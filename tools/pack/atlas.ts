import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AtlasJson, AtlasFrame } from '../../src/content/atlas.js';
import { ATLAS_MAX_SIZE, atlasProblems } from '../../src/content/atlas.js';
import { extractFrame } from '../recut/extract.js';
import { toSharp } from '../recut/io.js';
import type { AtlasPlan } from '../recut/segment.js';
import type { Frame, RawImage, Segmentation } from '../recut/types.js';
import { packAtlas } from './packer.js';

/** Each frame is stored with a 1px replicated border so bilinear sampling never bleeds a neighbour. */
const EXTRUDE = 1;
/** Empty pixels between extruded cells. */
const GUTTER = 1;

interface PreparedFrame {
  readonly name: string;
  readonly image: RawImage;
  readonly pivot: { x: number; y: number };
}

async function scaleFrame(img: RawImage, scale: number): Promise<RawImage> {
  if (scale === 1) return img;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const { data, info } = await toSharp(img).resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

/** Copy `src` into `dst` at (x, y) and replicate its border outward by EXTRUDE pixels. */
function blit(dst: RawImage, src: RawImage, x: number, y: number): void {
  const put = (dx: number, dy: number, sx: number, sy: number): void => {
    const d = (dy * dst.width + dx) * 4;
    const s = (sy * src.width + sx) * 4;
    dst.data[d] = src.data[s];
    dst.data[d + 1] = src.data[s + 1];
    dst.data[d + 2] = src.data[s + 2];
    dst.data[d + 3] = src.data[s + 3];
  };
  for (let sy = -EXTRUDE; sy < src.height + EXTRUDE; sy++) {
    const cy = Math.min(src.height - 1, Math.max(0, sy));
    for (let sx = -EXTRUDE; sx < src.width + EXTRUDE; sx++) {
      const cx = Math.min(src.width - 1, Math.max(0, sx));
      const dx = x + sx;
      const dy = y + sy;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      put(dx, dy, cx, cy);
    }
  }
}

export interface BuiltAtlas {
  readonly json: AtlasJson;
  readonly image: RawImage;
}

/** Compose the atlas texture and description in memory. */
export async function buildAtlas(keyed: RawImage, seg: Segmentation, plan: AtlasPlan): Promise<BuiltAtlas> {
  const byId = new Map<string, Frame>();
  for (const row of seg.rows) for (const f of row) byId.set(f.id, f);

  const prepared: PreparedFrame[] = [];
  for (const pf of plan.frames) {
    const frame = byId.get(pf.id);
    if (!frame) throw new Error(`plan references frame ${pf.id} missing from segmentation`);
    const cut = extractFrame(keyed, seg, frame);
    const scaled = await scaleFrame(cut, plan.scale);
    prepared.push({ name: pf.name, image: scaled, pivot: { x: pf.pivot.x * plan.scale, y: pf.pivot.y * plan.scale } });
  }

  const packed = packAtlas(
    prepared.map((p) => ({ id: p.name, w: p.image.width + 2 * EXTRUDE, h: p.image.height + 2 * EXTRUDE })),
    GUTTER,
    ATLAS_MAX_SIZE,
  );

  const image: RawImage = { width: packed.width, height: packed.height, data: new Uint8ClampedArray(packed.width * packed.height * 4) };
  const frames: Record<string, AtlasFrame> = {};
  const byName = new Map(prepared.map((p) => [p.name, p]));
  for (const pl of packed.placements) {
    const p = byName.get(pl.id)!;
    const fx = pl.x + EXTRUDE;
    const fy = pl.y + EXTRUDE;
    blit(image, p.image, fx, fy);
    frames[pl.id] = {
      x: fx,
      y: fy,
      w: p.image.width,
      h: p.image.height,
      pivot: { x: round2(p.pivot.x), y: round2(p.pivot.y) },
    };
  }
  // Stable key order for clean diffs.
  const sortedFrames = Object.fromEntries(Object.entries(frames).sort(([a], [b]) => a.localeCompare(b)));
  const animations = Object.fromEntries(plan.animations.map((a) => [a.name, { fps: a.fps, loop: a.loop, frames: a.frames }]));

  const json: AtlasJson = {
    version: 1,
    image: `${plan.name}.webp`,
    width: packed.width,
    height: packed.height,
    scale: plan.scale,
    frames: sortedFrames,
    animations,
  };
  const problems = atlasProblems(json);
  if (problems.length) throw new Error(`atlas ${plan.name} is inconsistent:\n  ${problems.join('\n  ')}`);
  return { json, image };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface WrittenAtlas {
  readonly imagePath: string;
  readonly jsonPath: string;
  readonly imageBytes: number;
}

/** Write <dir>/<name>.webp (lossless, alpha preserved) and <dir>/<name>.json. */
export async function writeAtlas(built: BuiltAtlas, dir: string): Promise<WrittenAtlas> {
  await mkdir(dir, { recursive: true });
  const name = built.json.image.replace(/\.webp$/, '');
  const imagePath = path.join(dir, built.json.image);
  const jsonPath = path.join(dir, `${name}.json`);
  const info = await toSharp(built.image).webp({ lossless: true, effort: 6 }).toFile(imagePath);
  await writeFile(jsonPath, `${JSON.stringify(built.json, null, 2)}\n`);
  return { imagePath, jsonPath, imageBytes: info.size };
}
