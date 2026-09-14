import type { ComponentOptions } from './components.js';
import type { FilterOptions } from './filter.js';
import type { MaskOptions } from './mask.js';
import type { PivotOptions } from './pivot.js';
import type { RowOptions } from './rows.js';
import type { SatelliteOptions } from './satellites.js';

/**
 * A recipe is the committed, human-reviewed description of how one source sheet
 * becomes one atlas. The segmenter's automatic result is deterministic for a
 * given source + options; the recipe layers names and corrections on top using
 * the segmenter's stable frame ids (`r<row>f<index>`).
 */
export interface Recipe {
  readonly version: 1;
  /** Source image, relative to the repo root. */
  readonly source: string;
  /** Atlas name; output is public/assets/atlases/<name>.{webp,json}. */
  readonly name: string;
  /** sheet: rows of animation frames. catalogue: independent props, one per component. */
  readonly kind: 'sheet' | 'catalogue';
  /** Output scale applied when packing (1 = native). */
  readonly scale?: number;
  /** Explicit background palette as #rrggbb; replaces border sampling. */
  readonly background?: readonly string[];
  readonly mask?: Partial<MaskOptions>;
  readonly components?: Partial<ComponentOptions>;
  readonly filter?: Partial<FilterOptions>;
  readonly rows?: Partial<RowOptions>;
  readonly satellites?: Partial<SatelliteOptions>;
  /** Default pivot options; animations may override. */
  readonly pivot?: Partial<PivotOptions>;
  readonly animations?: readonly AnimationSpec[];
  /** catalogue only: frame id -> prop name. Unlisted frames are skipped. */
  readonly props?: Readonly<Record<string, string>>;
  readonly overrides?: RecipeOverrides;
  /** Free-form reviewer notes; carried through untouched. */
  readonly notes?: string;
}

export interface AnimationSpec {
  readonly name: string;
  readonly row: number;
  /** Frame ids in play order. Defaults to every frame in the row, left to right. */
  readonly frames?: readonly string[];
  readonly fps: number;
  readonly loop: boolean;
  readonly pivot?: Partial<PivotOptions>;
  /** Damp horizontal pivot jitter across the animation. */
  readonly stabilize?: boolean;
}

export interface RecipeOverrides {
  /** Groups of frame ids to fuse into one frame. The first id is kept. */
  readonly merge?: readonly (readonly string[])[];
  /** Frame ids to discard (stray marks, duplicate frames). */
  readonly drop?: readonly string[];
  /** Frame id -> pivot in frame-relative pixels (from the frame's top-left). */
  readonly pivots?: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  /**
   * Sheet rectangles forced to background before labelling: cut touching props
   * apart, or remove a watermark that overlaps real content. Applied before
   * ids are assigned, so adding one can renumber frames in that row.
   */
  readonly erase?: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
}

export class RecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeError';
  }
}

const ID_RE = /^r\d+f\d+$/;
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function expectNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RecipeError(`${path} must be a finite number`);
  return v;
}

function checkPartialNumbers(v: unknown, path: string, keys: readonly string[]): void {
  if (v === undefined) return;
  if (!isRecord(v)) throw new RecipeError(`${path} must be an object`);
  for (const k of Object.keys(v)) {
    if (!keys.includes(k)) throw new RecipeError(`${path}.${k} is not a known option`);
  }
}

/** Structural validation; throws RecipeError with a path on the first problem. */
export function parseRecipe(json: unknown, label = 'recipe'): Recipe {
  if (!isRecord(json)) throw new RecipeError(`${label}: must be an object`);
  if (json.version !== 1) throw new RecipeError(`${label}.version must be 1`);
  if (typeof json.source !== 'string' || json.source.length === 0) throw new RecipeError(`${label}.source is required`);
  if (typeof json.name !== 'string' || !NAME_RE.test(json.name)) throw new RecipeError(`${label}.name must match ${NAME_RE}`);
  if (json.kind !== 'sheet' && json.kind !== 'catalogue') throw new RecipeError(`${label}.kind must be "sheet" or "catalogue"`);
  if (json.scale !== undefined) {
    const s = expectNumber(json.scale, `${label}.scale`);
    if (s <= 0 || s > 1) throw new RecipeError(`${label}.scale must be in (0, 1]`);
  }
  if (json.background !== undefined) {
    if (!Array.isArray(json.background) || json.background.length === 0 || json.background.some((c) => typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)))
      throw new RecipeError(`${label}.background must be a non-empty array of #rrggbb colours`);
  }
  checkPartialNumbers(json.mask, `${label}.mask`, ['tolerance', 'softTolerance', 'alphaThreshold', 'enclosed']);
  if (isRecord(json.mask) && json.mask.enclosed !== undefined && !['auto', 'keep', 'key'].includes(json.mask.enclosed as string))
    throw new RecipeError(`${label}.mask.enclosed must be "auto", "keep" or "key"`);
  checkPartialNumbers(json.components, `${label}.components`, ['alphaThreshold', 'bridge']);
  checkPartialNumbers(json.filter, `${label}.filter`, ['minArea', 'watermark']);
  checkPartialNumbers(json.rows, `${label}.rows`, ['gap', 'thin', 'strong']);
  checkPartialNumbers(json.satellites, `${label}.satellites`, ['ratio', 'maxGap', 'overlapMerge']);
  checkPartialNumbers(json.pivot, `${label}.pivot`, ['mode', 'contactBand', 'anchor']);

  if (json.kind === 'sheet') {
    if (!Array.isArray(json.animations)) throw new RecipeError(`${label}.animations is required for kind "sheet"`);
    const seen = new Set<string>();
    json.animations.forEach((a, i) => {
      const p = `${label}.animations[${i}]`;
      if (!isRecord(a)) throw new RecipeError(`${p} must be an object`);
      if (typeof a.name !== 'string' || !NAME_RE.test(a.name)) throw new RecipeError(`${p}.name must match ${NAME_RE}`);
      if (seen.has(a.name)) throw new RecipeError(`${p}.name "${a.name}" is duplicated`);
      seen.add(a.name);
      const row = expectNumber(a.row, `${p}.row`);
      if (row < 0 || !Number.isInteger(row)) throw new RecipeError(`${p}.row must be a non-negative integer`);
      if (expectNumber(a.fps, `${p}.fps`) <= 0) throw new RecipeError(`${p}.fps must be positive`);
      if (typeof a.loop !== 'boolean') throw new RecipeError(`${p}.loop must be a boolean`);
      if (a.frames !== undefined) {
        if (!Array.isArray(a.frames) || a.frames.some((f) => typeof f !== 'string' || !ID_RE.test(f)))
          throw new RecipeError(`${p}.frames must be an array of frame ids like "r0f3"`);
      }
      checkPartialNumbers(a.pivot, `${p}.pivot`, ['mode', 'contactBand', 'anchor']);
    });
  } else {
    if (json.props !== undefined) {
      if (!isRecord(json.props)) throw new RecipeError(`${label}.props must be an object`);
      const names = new Set<string>();
      for (const [id, name] of Object.entries(json.props)) {
        if (!ID_RE.test(id)) throw new RecipeError(`${label}.props key "${id}" is not a frame id`);
        if (typeof name !== 'string' || !NAME_RE.test(name)) throw new RecipeError(`${label}.props.${id} must match ${NAME_RE}`);
        if (names.has(name)) throw new RecipeError(`${label}.props name "${name}" is duplicated`);
        names.add(name);
      }
    }
  }

  if (json.overrides !== undefined) {
    const o = json.overrides;
    if (!isRecord(o)) throw new RecipeError(`${label}.overrides must be an object`);
    if (o.merge !== undefined) {
      if (!Array.isArray(o.merge) || o.merge.some((g) => !Array.isArray(g) || g.length < 2 || g.some((id) => typeof id !== 'string' || !ID_RE.test(id))))
        throw new RecipeError(`${label}.overrides.merge must be an array of arrays of 2+ frame ids`);
    }
    if (o.drop !== undefined) {
      if (!Array.isArray(o.drop) || o.drop.some((id) => typeof id !== 'string' || !ID_RE.test(id)))
        throw new RecipeError(`${label}.overrides.drop must be an array of frame ids`);
    }
    if (o.erase !== undefined) {
      if (!Array.isArray(o.erase)) throw new RecipeError(`${label}.overrides.erase must be an array`);
      o.erase.forEach((r, i) => {
        if (!isRecord(r)) throw new RecipeError(`${label}.overrides.erase[${i}] must be {x, y, w, h}`);
        for (const k of ['x', 'y', 'w', 'h']) {
          const v = expectNumber(r[k], `${label}.overrides.erase[${i}].${k}`);
          if (!Number.isInteger(v) || v < 0 || ((k === 'w' || k === 'h') && v === 0)) throw new RecipeError(`${label}.overrides.erase[${i}].${k} must be a non-negative integer${k === 'w' || k === 'h' ? ' > 0' : ''}`);
        }
      });
    }
    if (o.pivots !== undefined) {
      if (!isRecord(o.pivots)) throw new RecipeError(`${label}.overrides.pivots must be an object`);
      for (const [id, p] of Object.entries(o.pivots)) {
        if (!ID_RE.test(id)) throw new RecipeError(`${label}.overrides.pivots key "${id}" is not a frame id`);
        if (!isRecord(p)) throw new RecipeError(`${label}.overrides.pivots.${id} must be {x, y}`);
        expectNumber(p.x, `${label}.overrides.pivots.${id}.x`);
        expectNumber(p.y, `${label}.overrides.pivots.${id}.y`);
      }
    }
  }

  return json as unknown as Recipe;
}

/** Starting recipe for a fresh sheet: one looping 8 fps animation per row, named by index. */
export function scaffoldRecipe(source: string, name: string, kind: Recipe['kind'], rowCount: number): Recipe {
  if (kind === 'catalogue') return { version: 1, source, name, kind, props: {} };
  const animations: AnimationSpec[] = [];
  for (let r = 0; r < rowCount; r++) animations.push({ name: `row${r}`, row: r, fps: 8, loop: true });
  return { version: 1, source, name, kind, animations };
}
