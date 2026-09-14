/**
 * Optional art block of a level: which prop atlas dresses it, which backdrop
 * layers sit behind it, and where each catalogue prop is placed. The sim
 * ignores all of this; the renderer and the build-time validator read it.
 * Positions are sim pixels, Y up, like the rest of the level.
 */

import { isInt, isRecord, NAME_RE } from './json';

/** Depth slot of a decor piece; the renderer maps these to Z. */
export type DecorLayer = 'wall' | 'prop' | 'front';
export const DECOR_LAYERS: readonly DecorLayer[] = ['wall', 'prop', 'front'];

/** Backdrop slots the renderer knows how to place. */
export type BackdropSlot = 'far' | 'mid';
export const BACKDROP_SLOTS: readonly BackdropSlot[] = ['far', 'mid'];

export interface DecorJson {
  /** Frame name in the level's prop atlas. */
  readonly prop: string;
  /** Where the frame's pivot goes (grounded props: bottom centre). */
  readonly x: number;
  readonly y: number;
  /** Rendered size in sim px. Default: the frame's natural size. */
  readonly w?: number;
  readonly h?: number;
  readonly flip?: boolean;
  /** Default 'prop': just behind the gameplay plane, aligned with colliders. */
  readonly layer?: DecorLayer;
}

export interface LevelArtJson {
  /** Atlas name under assets/atlases (without extension). */
  readonly props: string;
  /** Slot to backdrop file name under assets/backdrops/<level id>/ (without .webp). */
  readonly backdrops: Readonly<Partial<Record<BackdropSlot, string>>>;
  readonly decor: readonly DecorJson[];
}


/** Shape checks only; reference checks need the atlas and are in `levelArtReferenceProblems`. */
export function levelArtProblems(art: unknown, level: { width: number; height: number }): string[] {
  if (!isRecord(art)) return ['art must be an object'];
  const problems: string[] = [];
  if (typeof art.props !== 'string' || !NAME_RE.test(art.props)) problems.push(`art.props must match ${String(NAME_RE)}`);
  if (!isRecord(art.backdrops)) problems.push('art.backdrops must be an object');
  else {
    for (const [slot, file] of Object.entries(art.backdrops)) {
      if (!BACKDROP_SLOTS.includes(slot as BackdropSlot)) problems.push(`art.backdrops.${slot}: slot must be one of ${BACKDROP_SLOTS.join(', ')}`);
      if (typeof file !== 'string' || !NAME_RE.test(file)) problems.push(`art.backdrops.${slot} must match ${String(NAME_RE)}`);
    }
  }
  if (!Array.isArray(art.decor)) problems.push('art.decor must be an array');
  else {
    art.decor.forEach((d, i) => {
      const label = `art.decor[${i}]`;
      if (!isRecord(d)) return problems.push(`${label}: must be an object`);
      if (typeof d.prop !== 'string' || d.prop.length === 0) problems.push(`${label}.prop is required`);
      if (!isInt(d.x) || !isInt(d.y)) problems.push(`${label}: x and y must be integers`);
      else if (d.x < -level.width || d.x > 2 * level.width || d.y < -level.height || d.y > 2 * level.height) problems.push(`${label}: far outside the level`);
      for (const k of ['w', 'h'] as const) {
        if (d[k] !== undefined && (!isInt(d[k]) || (d[k] as number) <= 0)) problems.push(`${label}.${k} must be a positive integer`);
      }
      if (d.flip !== undefined && typeof d.flip !== 'boolean') problems.push(`${label}.flip must be a boolean`);
      if (d.layer !== undefined && !DECOR_LAYERS.includes(d.layer as DecorLayer)) problems.push(`${label}.layer must be one of ${DECOR_LAYERS.join(', ')}`);
    });
  }
  return problems;
}

/**
 * Every prop the level names must be a frame in its atlas, and every backdrop
 * slot must have a file. `frames` and `backdropFiles` come from disk (build
 * time) or from the loaded assets (runtime).
 */
export function levelArtReferenceProblems(
  art: LevelArtJson,
  moverProps: readonly (string | undefined)[],
  frames: ReadonlySet<string>,
  backdropFiles: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  art.decor.forEach((d, i) => {
    if (!frames.has(d.prop)) problems.push(`art.decor[${i}].prop "${d.prop}" is not a frame in atlas ${art.props}`);
  });
  moverProps.forEach((p, i) => {
    if (p !== undefined && !frames.has(p)) problems.push(`movingSolids[${i}].prop "${p}" is not a frame in atlas ${art.props}`);
  });
  for (const [slot, file] of Object.entries(art.backdrops)) {
    if (file !== undefined && !backdropFiles.has(file)) problems.push(`art.backdrops.${slot} "${file}" has no backdrop file`);
  }
  return problems;
}
