/**
 * Atlas JSON written by tools/pack and consumed by the renderer. Kept in
 * src/content so both sides compile against one definition.
 *
 * All pixel values are in atlas texture pixels (already scaled).
 */
export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Pivot relative to the frame's top-left. Grounded actors: feet; flyers: centre. */
  readonly pivot: { readonly x: number; readonly y: number };
}

export interface AtlasAnimation {
  readonly fps: number;
  readonly loop: boolean;
  readonly frames: readonly string[];
}

export interface AtlasJson {
  readonly version: 1;
  /** Image file name, relative to the JSON file. */
  readonly image: string;
  readonly width: number;
  readonly height: number;
  /** Atlas pixels per source pixel (0 < scale <= 1). Debugging aid; not needed at runtime. */
  readonly scale: number;
  readonly frames: Readonly<Record<string, AtlasFrame>>;
  readonly animations: Readonly<Record<string, AtlasAnimation>>;
}

export const ATLAS_MAX_SIZE = 4096;

/**
 * Check an atlas description for internal consistency. Returns a list of
 * problems; empty means valid. Used by the build-time validator and by tests.
 */
export function atlasProblems(atlas: AtlasJson): string[] {
  const problems: string[] = [];
  if (atlas.version !== 1) problems.push(`unsupported version ${String(atlas.version)}`);
  if (!Number.isInteger(atlas.width) || !Number.isInteger(atlas.height) || atlas.width <= 0 || atlas.height <= 0) {
    problems.push('width/height must be positive integers');
  }
  if (atlas.width > ATLAS_MAX_SIZE || atlas.height > ATLAS_MAX_SIZE) problems.push(`texture exceeds ${ATLAS_MAX_SIZE}px`);
  if (typeof atlas.image !== 'string' || !/^[a-z0-9_-]+\.(webp|png)$/.test(atlas.image)) problems.push(`image "${String(atlas.image)}" is not a plain file name`);

  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isRecord(atlas.frames) || !isRecord(atlas.animations)) {
    problems.push('frames and animations must be objects');
    return problems;
  }
  const entries = Object.entries(atlas.frames);
  if (entries.length === 0) problems.push('atlas has no frames');
  const rects: { name: string; x: number; y: number; w: number; h: number }[] = [];
  for (const [name, f] of entries) {
    if (!isRecord(f)) {
      problems.push(`frame ${name}: must be an object`);
      continue;
    }
    const { x, y, w, h } = f;
    if (![x, y, w, h].every(Number.isInteger) || w <= 0 || h <= 0) {
      problems.push(`frame ${name}: rect must be positive integers`);
      continue;
    }
    if (x < 0 || y < 0 || x + w > atlas.width || y + h > atlas.height) problems.push(`frame ${name}: rect leaves the texture`);
    // Input may come from disk, so do not trust the static type for the pivot.
    const pivot = f.pivot as { x?: unknown; y?: unknown } | undefined;
    if (typeof pivot?.x !== 'number' || typeof pivot.y !== 'number' || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) {
      problems.push(`frame ${name}: pivot missing`);
    } else if (pivot.x < -w || pivot.x > 2 * w || pivot.y < -h || pivot.y > 2 * h) {
      problems.push(`frame ${name}: pivot far outside the frame`);
    }
    rects.push({ name, x, y, w, h });
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) problems.push(`frames ${a.name} and ${b.name} overlap`);
    }
  }
  for (const [name, anim] of Object.entries(atlas.animations)) {
    if (!isRecord(anim) || !Array.isArray(anim.frames)) {
      problems.push(`animation ${name}: must have a frames array`);
      continue;
    }
    if (!(anim.fps > 0)) problems.push(`animation ${name}: fps must be positive`);
    if (anim.frames.length === 0) problems.push(`animation ${name}: has no frames`);
    for (const fr of anim.frames) if (!(fr in atlas.frames)) problems.push(`animation ${name}: unknown frame "${fr}"`);
  }
  return problems;
}
