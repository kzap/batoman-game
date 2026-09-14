/**
 * Pure editing operations over LevelJson. Every function returns a new level;
 * nothing here touches the DOM or Three.js, so the whole model is unit-tested
 * and the same operations can dress a level from a script.
 *
 * Objects are addressed by `Ref` (kind + index into that kind's array); the
 * spawn and exit are singletons at index 0.
 */

import { ENEMY_TYPES, HAZARD_KINDS, type EnemySpawnJson, type EnemyType, type HazardKind, type LevelJson, type MovingSolidJson, type Point, type Rect } from '@content/level';
import { DECOR_LAYERS, type DecorJson, type DecorLayer } from '@content/level-art';

export type ObjectKind = 'solid' | 'oneWay' | 'mover' | 'hazard' | 'deathZone' | 'checkpoint' | 'enemy' | 'decor' | 'spawn' | 'exit';

/** Kinds the editor can create by dragging a rectangle, in palette order. */
export const KINDS: readonly ObjectKind[] = ['solid', 'oneWay', 'mover', 'hazard', 'deathZone', 'checkpoint', 'enemy', 'decor', 'spawn', 'exit'];

export interface Ref {
  readonly kind: ObjectKind;
  readonly index: number;
}

export const sameRef = (a: Ref | null, b: Ref | null): boolean => a !== null && b !== null && a.kind === b.kind && a.index === b.index;

/**
 * How each kind is stored and shaped. `list` is the LevelJson array holding
 * it (`decor` lives under `art`; spawn and exit are single fields). `shape`
 * says what its bounds are: its own rectangle, a standing body at a feet
 * point, or a decor quad sized by its frame.
 */
type ListKey = 'solids' | 'oneWay' | 'movingSolids' | 'hazards' | 'deathZones' | 'checkpoints' | 'enemies';
type Shape = 'rect' | 'point' | 'decor';
const KIND: Readonly<Record<ObjectKind, { list: ListKey | 'decor' | null; shape: Shape }>> = {
  solid: { list: 'solids', shape: 'rect' },
  oneWay: { list: 'oneWay', shape: 'rect' },
  mover: { list: 'movingSolids', shape: 'rect' },
  hazard: { list: 'hazards', shape: 'rect' },
  deathZone: { list: 'deathZones', shape: 'rect' },
  checkpoint: { list: 'checkpoints', shape: 'rect' },
  exit: { list: null, shape: 'rect' },
  spawn: { list: null, shape: 'point' },
  enemy: { list: 'enemies', shape: 'point' },
  decor: { list: 'decor', shape: 'decor' },
};

/** Standing body of the player and of placeholder enemies, for hit-testing feet positions. */
export const BODY = { w: 24, h: 48 } as const;
/** Defaults for objects created by dragging; the fields panel edits them afterwards. */
export const MOVER_DEFAULTS = { travel: 128, speed: 60, pause: 30 } as const;
export const ENEMY_DEFAULT_PATROL = 120;
/** Stand-in size when a decor prop is not in the loaded atlas (the validator reports the name). */
const UNKNOWN_FRAME: FrameSize = { w: 32, h: 32, px: 0.5 };
const HISTORY_LIMIT = 200;

/** Natural size of a decor frame in sim px and where its pivot sits across its width (0..1, 0.5 = centred); from the prop atlas. */
export interface FrameSize {
  readonly w: number;
  readonly h: number;
  readonly px: number;
}
export type DecorSizer = (prop: string) => FrameSize | null;

/** Frame size from an atlas entry: atlas px at `scale` sim px each, pivot fraction from the pivot's x. */
export const frameSize = (f: { w: number; h: number; pivot: { x: number } }, scale: number): FrameSize => ({ w: f.w * scale, h: f.h * scale, px: f.pivot.x / f.w });

const bodyRect = (feet: Point): Rect => ({ x: feet.x - BODY.w / 2, y: feet.y, w: BODY.w, h: BODY.h });
const rectOf = (r: Rect): Rect => ({ x: r.x, y: r.y, w: r.w, h: r.h });
const feetOf = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y });

/** Rendered size of a decor piece: explicit w/h, the other side by aspect, else the frame's natural size. */
export function decorSize(d: DecorJson, sizer: DecorSizer): FrameSize {
  const natural = sizer(d.prop) ?? UNKNOWN_FRAME;
  if (d.w !== undefined && d.h !== undefined) return { ...natural, w: d.w, h: d.h };
  if (d.w !== undefined) return { ...natural, w: d.w, h: (d.w * natural.h) / natural.w };
  if (d.h !== undefined) return { ...natural, w: (d.h * natural.w) / natural.h, h: d.h };
  return natural;
}

/** Pivot fraction across the drawn width, mirrored when flipped. */
const pivotOf = (d: { flip?: boolean }, s: FrameSize): number => (d.flip ? 1 - s.px : s.px);

// ---- Storage ----------------------------------------------------------------

function listOf(level: LevelJson, kind: ObjectKind): readonly object[] {
  const key = KIND[kind].list;
  if (key === null) throw new Error(`${kind} is a singleton`);
  if (key === 'decor') return level.art?.decor ?? [];
  return level[key];
}

function withList(level: LevelJson, kind: ObjectKind, list: readonly object[]): LevelJson {
  const key = KIND[kind].list;
  if (key === null) throw new Error(`${kind} is a singleton`);
  if (key === 'decor') {
    if (!level.art) throw new Error('level has no art block; decor needs a prop atlas');
    return { ...level, art: { ...level.art, decor: list as DecorJson[] } };
  }
  return { ...level, [key]: list };
}

function objectOf(level: LevelJson, ref: Ref): object {
  if (ref.kind === 'spawn') return level.spawn;
  if (ref.kind === 'exit') return level.exit;
  const v = listOf(level, ref.kind)[ref.index];
  if (v === undefined) throw new Error(`no ${ref.kind} at index ${ref.index}`);
  return v;
}

function putObject(level: LevelJson, ref: Ref, obj: object): LevelJson {
  if (ref.kind === 'spawn') return { ...level, spawn: obj as Point };
  if (ref.kind === 'exit') return { ...level, exit: obj as Rect };
  const list = listOf(level, ref.kind).slice();
  if (ref.index >= list.length) throw new Error(`no ${ref.kind} at index ${ref.index}`);
  list[ref.index] = obj;
  return withList(level, ref.kind, list);
}

const decorOf = (level: LevelJson, ref: Ref): DecorJson => objectOf(level, ref) as DecorJson;

// ---- Geometry ---------------------------------------------------------------

export function bounds(level: LevelJson, ref: Ref, sizer: DecorSizer): Rect {
  const obj = objectOf(level, ref);
  switch (KIND[ref.kind].shape) {
    case 'rect':
      return rectOf(obj as Rect);
    case 'point':
      return bodyRect(obj as Point);
    case 'decor': {
      const d = obj as DecorJson;
      const s = decorSize(d, sizer);
      return { x: d.x - s.w * pivotOf(d, s), y: d.y, w: s.w, h: s.h };
    }
  }
}

/**
 * Move/resize an object to a rectangle. Point objects take the rect's bottom
 * centre; a mover's path shifts with its collider; decor keeps its aspect
 * from the width (an explicit `h` is dropped).
 */
export function setBounds(level: LevelJson, ref: Ref, r: Rect, sizer: DecorSizer): LevelJson {
  const obj = objectOf(level, ref);
  switch (KIND[ref.kind].shape) {
    case 'rect': {
      if (ref.kind === 'mover') {
        const m = obj as MovingSolidJson;
        const dx = r.x - m.x;
        const dy = r.y - m.y;
        return putObject(level, ref, { ...m, ...rectOf(r), path: m.path.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
      }
      return putObject(level, ref, { ...obj, ...rectOf(r) });
    }
    case 'point':
      return putObject(level, ref, { ...obj, ...feetOf(r) });
    case 'decor': {
      const d = obj as DecorJson;
      const next: DecorJson = { ...d, x: Math.round(r.x + r.w * pivotOf(d, decorSize(d, sizer))), y: r.y, w: Math.round(r.w) };
      delete (next as { h?: number }).h;
      return putObject(level, ref, next);
    }
  }
}

export function move(level: LevelJson, ref: Ref, dx: number, dy: number, sizer: DecorSizer): LevelJson {
  if (ref.kind === 'decor') {
    // A pure move must not pin the width the way setBounds does.
    const d = decorOf(level, ref);
    return putObject(level, ref, { ...d, x: d.x + dx, y: d.y + dy });
  }
  const b = bounds(level, ref, sizer);
  return setBounds(level, ref, { ...b, x: b.x + dx, y: b.y + dy }, sizer);
}

// ---- Create / delete --------------------------------------------------------

export interface AddOptions {
  /** Decor prop and mover prop name. */
  readonly prop?: string;
  readonly enemyType?: EnemyType;
  readonly hazardKind?: HazardKind;
  readonly layer?: DecorLayer;
  /** Needed for decor so the piece lands with its pivot where the frame's art expects it. */
  readonly sizer?: DecorSizer;
}

/** The object a drag of `r` creates for `kind`, with defaults the fields panel can change later. */
function newObject(level: LevelJson, kind: ObjectKind, r: Rect, opts: AddOptions): object {
  const rect = rectOf(r);
  const feet = feetOf(r);
  switch (kind) {
    case 'solid':
    case 'oneWay':
    case 'deathZone':
    case 'exit':
      return rect;
    case 'hazard':
      return { ...rect, kind: opts.hazardKind ?? 'spikes' };
    case 'checkpoint':
      return { ...rect, id: level.checkpoints.reduce((m, c) => Math.max(m, c.id), 0) + 1 };
    case 'mover': {
      const m: MovingSolidJson = { ...rect, path: [{ x: rect.x, y: rect.y }, { x: rect.x + MOVER_DEFAULTS.travel, y: rect.y }], speed: MOVER_DEFAULTS.speed, pause: MOVER_DEFAULTS.pause };
      return opts.prop ? { ...m, prop: opts.prop } : m;
    }
    case 'spawn':
      return feet;
    case 'enemy': {
      const e: EnemySpawnJson = { type: opts.enemyType ?? 'patroller', ...feet, patrolDistance: ENEMY_DEFAULT_PATROL };
      return e;
    }
    case 'decor': {
      if (!opts.prop) throw new Error('decor needs a prop');
      const px = opts.sizer?.(opts.prop)?.px ?? UNKNOWN_FRAME.px;
      const d: DecorJson = { prop: opts.prop, x: Math.round(r.x + r.w * px), y: feet.y };
      return opts.layer && opts.layer !== 'prop' ? { ...d, layer: opts.layer } : d;
    }
  }
}

/** Create an object of `kind` filling `r` (point objects use its bottom centre). Returns the level and the new ref. */
export function add(level: LevelJson, kind: ObjectKind, r: Rect, opts: AddOptions = {}): { level: LevelJson; ref: Ref } {
  const obj = newObject(level, kind, r, opts);
  if (KIND[kind].list === null) return { level: putObject(level, { kind, index: 0 }, obj), ref: { kind, index: 0 } };
  const list = listOf(level, kind);
  return { level: withList(level, kind, [...list, obj]), ref: { kind, index: list.length } };
}

/** Delete by ref; the singletons (spawn, exit) stay. */
export function remove(level: LevelJson, ref: Ref): LevelJson {
  if (KIND[ref.kind].list === null) return level;
  return withList(level, ref.kind, listOf(level, ref.kind).filter((_, i) => i !== ref.index));
}

/** Copy an object one tile to the right with all its fields. Singletons are not duplicated. */
export function duplicate(level: LevelJson, ref: Ref, sizer: DecorSizer): { level: LevelJson; ref: Ref } {
  if (KIND[ref.kind].list === null) return { level, ref };
  const list = listOf(level, ref.kind);
  const copy: Ref = { kind: ref.kind, index: list.length };
  let obj = objectOf(level, ref);
  if (ref.kind === 'checkpoint') obj = { ...obj, id: level.checkpoints.reduce((m, c) => Math.max(m, c.id), 0) + 1 };
  const appended = withList(level, ref.kind, [...list, obj]);
  return { level: move(appended, copy, level.tileSize, 0, sizer), ref: copy };
}

// ---- Fields -----------------------------------------------------------------

export type FieldType = 'int' | 'text' | 'enum' | 'bool' | 'points';

export interface FieldSpec {
  readonly key: string;
  readonly type: FieldType;
  readonly options?: readonly string[];
  /** Optional fields are deleted when cleared. */
  readonly optional?: boolean;
}

const RECT_FIELDS: readonly FieldSpec[] = ['x', 'y', 'w', 'h'].map((key) => ({ key, type: 'int' }));
const POINT_FIELDS: readonly FieldSpec[] = ['x', 'y'].map((key) => ({ key, type: 'int' }));

/** Editable fields per kind, in panel order. Enumerations come from the content schema so the panel cannot drift from the validator. */
export function fieldsFor(kind: ObjectKind, propNames: readonly string[]): readonly FieldSpec[] {
  switch (kind) {
    case 'solid':
    case 'oneWay':
    case 'deathZone':
    case 'exit':
      return RECT_FIELDS;
    case 'hazard':
      return [...RECT_FIELDS, { key: 'kind', type: 'enum', options: HAZARD_KINDS }];
    case 'checkpoint':
      return [...RECT_FIELDS, { key: 'id', type: 'int' }];
    case 'mover':
      return [
        ...RECT_FIELDS,
        { key: 'speed', type: 'int' },
        { key: 'pause', type: 'int', optional: true },
        { key: 'prop', type: 'enum', options: propNames, optional: true },
        { key: 'path', type: 'points' },
      ];
    case 'spawn':
      return POINT_FIELDS;
    case 'enemy':
      return [...POINT_FIELDS, { key: 'type', type: 'enum', options: ENEMY_TYPES }, { key: 'patrolDistance', type: 'int', optional: true }];
    case 'decor':
      return [
        ...POINT_FIELDS,
        { key: 'prop', type: 'enum', options: propNames },
        { key: 'w', type: 'int', optional: true },
        { key: 'h', type: 'int', optional: true },
        { key: 'flip', type: 'bool', optional: true },
        { key: 'layer', type: 'enum', options: DECOR_LAYERS, optional: true },
      ];
  }
}

export function getField(level: LevelJson, ref: Ref, key: string): unknown {
  return (objectOf(level, ref) as Record<string, unknown>)[key];
}

/**
 * Set one field; `undefined` deletes an optional field. Values are taken as
 * already parsed (int/bool/points). A mover's x/y go through `setBounds` so
 * its path travels with it, as it does when dragged.
 */
export function setField(level: LevelJson, ref: Ref, key: string, value: unknown, sizer: DecorSizer): LevelJson {
  if (ref.kind === 'mover' && (key === 'x' || key === 'y') && typeof value === 'number') {
    return setBounds(level, ref, { ...bounds(level, ref, sizer), [key]: value }, sizer);
  }
  const obj = { ...(objectOf(level, ref) as Record<string, unknown>) };
  if (value === undefined) delete obj[key];
  else obj[key] = value;
  return putObject(level, ref, obj);
}

// ---- Queries ----------------------------------------------------------------

export function allRefs(level: LevelJson): Ref[] {
  const refs: Ref[] = [];
  for (const kind of KINDS) {
    const n = KIND[kind].list === null ? 1 : listOf(level, kind).length;
    for (let i = 0; i < n; i++) refs.push({ kind, index: i });
  }
  return refs;
}

const contains = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Objects under a point, smallest first, so a can on a floor is picked before the floor. */
export function refsAt(level: LevelJson, p: Point, sizer: DecorSizer): Ref[] {
  return allRefs(level)
    .map((ref) => ({ ref, b: bounds(level, ref, sizer) }))
    .filter(({ b }) => contains(b, p))
    .sort((a, b) => a.b.w * a.b.h - b.b.w * b.b.h)
    .map(({ ref }) => ref);
}

export const snap = (v: number, grid: number): number => (grid > 0 ? Math.round(v / grid) * grid : Math.round(v));

/** Snap a rect's corners to the grid and keep it at least one grid cell in each dimension. */
export function snapRect(r: Rect, grid: number): Rect {
  const cell = Math.max(grid, 1);
  const x0 = snap(r.x, grid);
  const y0 = snap(r.y, grid);
  const x1 = Math.max(x0 + cell, snap(r.x + r.w, grid));
  const y1 = Math.max(y0 + cell, snap(r.y + r.h, grid));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Normalise a drag from `a` to `b` into a rect with positive size. */
export function rectFromDrag(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

// ---- Dressing ---------------------------------------------------------------

/**
 * Cover a solid or one-way with copies of a prop, appended as decor. A thick
 * collider is filled: each copy is scaled to its height and the count chosen
 * so the copies tile its width with the least stretch. A thin collider (less
 * than half the prop's height, one-way ledges) keeps the prop's aspect and
 * hangs the copies from its top edge, like a mover's prop.
 */
export function dressSpan(level: LevelJson, ref: Ref, prop: string, sizer: DecorSizer, layer: DecorLayer = 'prop'): LevelJson {
  if (ref.kind !== 'solid' && ref.kind !== 'oneWay') throw new Error('dressSpan needs a solid or one-way');
  const natural = sizer(prop);
  if (!natural) throw new Error(`unknown prop "${prop}"`);
  const r = bounds(level, ref, sizer);
  const thin = r.h < natural.h / 2;
  const eachW = thin ? natural.w : (natural.w * r.h) / natural.h;
  const n = Math.max(1, Math.round(r.w / eachW));
  const w = Math.round(r.w / n);
  const artH = (natural.h * w) / natural.w;
  const y = thin ? Math.round(r.y + r.h - artH) : r.y;
  const pieces: DecorJson[] = [];
  for (let i = 0; i < n; i++) {
    const d: DecorJson = thin ? { prop, x: Math.round(r.x + w * i + w * natural.px), y, w } : { prop, x: Math.round(r.x + w * i + w * natural.px), y, w, h: r.h };
    pieces.push(layer !== 'prop' ? { ...d, layer } : d);
  }
  return withList(level, 'decor', [...listOf(level, 'decor'), ...pieces]);
}

// ---- History ----------------------------------------------------------------

/**
 * The editor's document: current level, selection, and an undo/redo stack of
 * whole levels (they are a few KB). `preview` shows a transient state during a
 * drag without touching history; `commitFrom` then records the drag as one step.
 */
export class EditorDoc {
  private current: LevelJson;
  private undoStack: LevelJson[] = [];
  private redoStack: LevelJson[] = [];
  selection: Ref | null = null;
  /** Bumped on every change so views know to rebuild. */
  revision = 0;

  constructor(
    level: LevelJson,
    readonly sizer: DecorSizer,
  ) {
    this.current = level;
  }

  get level(): LevelJson {
    return this.current;
  }

  /** Replace the level, recording the previous one for undo. Returns false when nothing changed. */
  commit(next: LevelJson): boolean {
    return this.commitFrom(this.current, next);
  }

  /** Record `next` as one undo step away from `base` (the level a drag started from), whatever previews happened between. */
  commitFrom(base: LevelJson, next: LevelJson): boolean {
    if (next === base) {
      this.set(base);
      return false;
    }
    this.undoStack.push(base);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.set(next);
    return true;
  }

  /** Show a level without recording it; the next `commitFrom` decides what history sees. */
  preview(level: LevelJson): void {
    this.set(level);
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.current);
    this.set(prev);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.current);
    this.set(next);
    return true;
  }

  private set(level: LevelJson): void {
    this.current = level;
    this.revision++;
    if (this.selection && !allRefs(level).some((r) => sameRef(r, this.selection))) this.selection = null;
  }
}
