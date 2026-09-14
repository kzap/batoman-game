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
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

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

export async function buildBackdrops(specPath: string, outRoot: string): Promise<WrittenBackdrop[]> {
  const spec = parseBackdrops(JSON.parse(await readFile(specPath, 'utf8')), specPath);
  const dir = path.join(outRoot, spec.level);
  await mkdir(dir, { recursive: true });
  const out: WrittenBackdrop[] = [];
  for (const [name, layer] of Object.entries(spec.layers)) {
    const src = path.join(path.dirname(specPath), layer.source);
    let img = sharp(src);
    const lossless = layer.lossless ?? (await hasTransparency(img));
    if (layer.scale && layer.scale < 1) {
      const meta = await img.metadata();
      img = img.resize(Math.round(meta.width * layer.scale), Math.round(meta.height * layer.scale), { kernel: 'lanczos3' });
    }
    const target = path.join(dir, `${name}.webp`);
    const info = await img.webp(lossless ? { lossless: true, effort: 6 } : { quality: layer.quality ?? 82, effort: 6, alphaQuality: 90 }).toFile(target);
    out.push({ layer: name, path: target, bytes: info.size, lossless });
  }
  return out;
}
