import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Sharp } from 'sharp';

/**
 * backdrops.json next to a level's source layers:
 * { "version": 1, "level": "level-1", "layers": { "background": { "source": "background.png" }, ... } }
 * Output: public/assets/backdrops/<level>/<layer>.webp
 */
export interface BackdropsSpec {
  readonly version: 1;
  readonly level: string;
  readonly layers: Readonly<Record<string, BackdropLayer>>;
}

export interface BackdropLayer {
  /** Relative to the spec file. */
  readonly source: string;
  /** Lossy quality (1-100). Ignored when lossless. Default 82. */
  readonly quality?: number;
  /** Force lossless; default is lossless only when the layer has transparency. */
  readonly lossless?: boolean;
  /** Downscale factor in (0, 1]. Default 1. */
  readonly scale?: number;
  /**
   * Fade the left and right edges to transparent over this fraction of the
   * width (0 to 0.5), so a layer the renderer tiles horizontally meets itself
   * with a soft gap instead of a hard seam. Forces an alpha channel.
   */
  readonly edgeFade?: number;
  /** Source-pixel rects to blank out (generator watermarks, captions). Applied before scaling. */
  readonly erase?: readonly EraseRect[];
  /**
   * Chroma key: pixels within `tolerance` (max per-channel difference, 0-255) of `color`
   * become transparent. For layers drawn on a flat key colour instead of alpha. Applied
   * first, so an erase rect can then fill any keyed hole it overlaps.
   */
  readonly key?: ChromaKey;
}

export interface ChromaKey {
  /** `#rrggbb`. */
  readonly color: string;
  readonly tolerance: number;
}

export interface EraseRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /**
   * `clear` makes the rect transparent (cutout edges). `fill` recolours it with the mean colour of the
   * visible pixels around its border, keeping each pixel's alpha, so a mark on a wall becomes wall.
   */
  readonly mode: 'clear' | 'fill';
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

export function parseBackdrops(json: unknown, label: string): BackdropsSpec {
  if (typeof json !== 'object' || json === null) throw new Error(`${label}: must be an object`);
  const j = json as Record<string, unknown>;
  if (j.version !== 1) throw new Error(`${label}.version must be 1`);
  if (typeof j.level !== 'string' || !NAME_RE.test(j.level)) throw new Error(`${label}.level must match ${NAME_RE}`);
  if (typeof j.layers !== 'object' || j.layers === null) throw new Error(`${label}.layers must be an object`);
  for (const [name, layer] of Object.entries(j.layers as Record<string, unknown>)) {
    if (!NAME_RE.test(name)) throw new Error(`${label}.layers key "${name}" must match ${NAME_RE}`);
    if (typeof layer !== 'object' || layer === null) throw new Error(`${label}.layers.${name} must be an object`);
    const l = layer as Record<string, unknown>;
    if (typeof l.source !== 'string') throw new Error(`${label}.layers.${name}.source is required`);
    if (l.quality !== undefined && (typeof l.quality !== 'number' || l.quality < 1 || l.quality > 100)) throw new Error(`${label}.layers.${name}.quality must be 1-100`);
    if (l.scale !== undefined && (typeof l.scale !== 'number' || l.scale <= 0 || l.scale > 1)) throw new Error(`${label}.layers.${name}.scale must be in (0, 1]`);
    if (l.lossless !== undefined && typeof l.lossless !== 'boolean') throw new Error(`${label}.layers.${name}.lossless must be a boolean`);
    if (l.edgeFade !== undefined && (typeof l.edgeFade !== 'number' || l.edgeFade < 0 || l.edgeFade > 0.5)) throw new Error(`${label}.layers.${name}.edgeFade must be in [0, 0.5]`);
    if (l.key !== undefined) {
      const k = l.key as Record<string, unknown>;
      if (typeof k !== 'object' || k === null || typeof k.color !== 'string' || !HEX_RE.test(k.color)) throw new Error(`${label}.layers.${name}.key.color must be #rrggbb`);
      if (typeof k.tolerance !== 'number' || k.tolerance < 0 || k.tolerance > 255) throw new Error(`${label}.layers.${name}.key.tolerance must be 0-255`);
    }
    if (l.erase !== undefined) {
      if (!Array.isArray(l.erase)) throw new Error(`${label}.layers.${name}.erase must be an array`);
      l.erase.forEach((r: unknown, i: number) => {
        const e = r as Record<string, unknown>;
        if (typeof e !== 'object' || e === null || ![e.x, e.y, e.w, e.h].every((v) => Number.isInteger(v) && (v as number) >= 0) || (e.w as number) === 0 || (e.h as number) === 0) {
          throw new Error(`${label}.layers.${name}.erase[${i}] needs non-negative integer x, y and positive w, h`);
        }
        if (e.mode !== 'clear' && e.mode !== 'fill') throw new Error(`${label}.layers.${name}.erase[${i}].mode must be "clear" or "fill"`);
      });
    }
  }
  return json as BackdropsSpec;
}

export interface WrittenBackdrop {
  readonly layer: string;
  readonly path: string;
  readonly bytes: number;
  readonly lossless: boolean;
}

/** Does the image have any pixel with alpha < 255? Cheap sampled check. */
async function hasTransparency(img: Sharp): Promise<boolean> {
  const meta = await img.metadata();
  if (!meta.hasAlpha) return false;
  const { data, info } = await img.clone().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  const stride = Math.max(1, Math.floor(data.length / 50_000));
  for (let i = 0; i < info.width * info.height; i += stride) if (data[i] < 255) return true;
  return false;
}

/** Raw RGBA pixels of an image, with any pending operations resolved. */
async function rawRgba(img: Sharp): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const fromRaw = (data: Buffer, width: number, height: number): Sharp => sharp(data, { raw: { width, height, channels: 4 } });

/** Zero the alpha of every pixel within the key's tolerance of its colour (max difference over R, G, B). */
export async function keyOut(img: Sharp, key: ChromaKey): Promise<Sharp> {
  const { data, width, height } = await rawRgba(img);
  const target = [1, 3, 5].map((i) => parseInt(key.color.slice(i, i + 2), 16));
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.max(Math.abs(data[i] - target[0]), Math.abs(data[i + 1] - target[1]), Math.abs(data[i + 2] - target[2]));
    if (d <= key.tolerance) data[i + 3] = 0;
  }
  return fromRaw(data, width, height);
}

/** Blank out rects: `clear` zeroes the alpha, `fill` recolours with the mean of the visible one-pixel border, alpha kept. */
export async function eraseRects(img: Sharp, rects: readonly EraseRect[]): Promise<Sharp> {
  const { data, width, height } = await rawRgba(img);
  const idx = (x: number, y: number): number => (y * width + x) * 4;
  for (const r of rects) {
    const x0 = Math.min(r.x, width);
    const y0 = Math.min(r.y, height);
    const x1 = Math.min(r.x + r.w, width);
    const y1 = Math.min(r.y + r.h, height);
    if (r.mode === 'clear') {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[idx(x, y) + 3] = 0;
      continue;
    }
    const sum = [0, 0, 0];
    let n = 0;
    const add = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = idx(x, y);
      if (data[i + 3] === 0) return;
      for (let c = 0; c < 3; c++) sum[c] += data[i + c];
      n++;
    };
    for (let x = x0 - 1; x <= x1; x++) {
      add(x, y0 - 1);
      add(x, y1);
    }
    for (let y = y0; y < y1; y++) {
      add(x0 - 1, y);
      add(x1, y);
    }
    if (n === 0) continue;
    const mean = sum.map((v) => Math.round(v / n));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) data[idx(x, y) + c] = mean[c];
  }
  return fromRaw(data, width, height);
}

/** Multiply the alpha by a ramp that is 0 at the left/right edges and 1 from `fraction` of the width inwards. */
export async function fadeEdges(img: Sharp, fraction: number): Promise<Sharp> {
  // Resolve any pending resize so the mask matches the output size.
  const { data, width, height } = await rawRgba(img);
  const ramp = Math.max(1, Math.round(width * fraction));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = Math.min(x, width - 1 - x);
      if (edge >= ramp) continue;
      const i = (y * width + x) * 4 + 3;
      data[i] = Math.round((data[i] * edge) / ramp);
    }
  }
  return fromRaw(data, width, height);
}

export async function buildBackdrops(specPath: string, outRoot: string): Promise<WrittenBackdrop[]> {
  const spec = parseBackdrops(JSON.parse(await readFile(specPath, 'utf8')), specPath);
  const dir = path.join(outRoot, spec.level);
  await mkdir(dir, { recursive: true });
  const out: WrittenBackdrop[] = [];
  for (const [name, layer] of Object.entries(spec.layers)) {
    const src = path.join(path.dirname(specPath), layer.source);
    let img = sharp(src);
    if (layer.key) img = await keyOut(img, layer.key);
    if (layer.erase?.length) img = await eraseRects(img, layer.erase);
    const lossless = layer.lossless ?? (await hasTransparency(img));
    if (layer.scale && layer.scale < 1) {
      const meta = await img.metadata();
      img = img.resize(Math.round(meta.width * layer.scale), Math.round(meta.height * layer.scale), { kernel: 'lanczos3' });
    }
    if (layer.edgeFade) img = await fadeEdges(img, layer.edgeFade);
    const target = path.join(dir, `${name}.webp`);
    const info = await img.webp(lossless ? { lossless: true, effort: 6 } : { quality: layer.quality ?? 82, effort: 6, alphaQuality: 90 }).toFile(target);
    out.push({ layer: name, path: target, bytes: info.size, lossless });
  }
  return out;
}
