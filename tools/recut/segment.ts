import { DEFAULT_BACKGROUND_OPTIONS, detectBackground } from './background.js';
import { DEFAULT_COMPONENT_OPTIONS, labelComponents } from './components.js';
import { DEFAULT_FILTER_OPTIONS, filterComponents } from './filter.js';
import { DEFAULT_MASK_OPTIONS, buildMask } from './mask.js';
import { DEFAULT_PIVOT_OPTIONS, computePivot, stabilizePivots } from './pivot.js';
import type { PivotOptions } from './pivot.js';
import type { AnimationSpec, Recipe } from './recipe.js';
import { RecipeError } from './recipe.js';
import { DEFAULT_ROW_OPTIONS, clusterRows } from './rows.js';
import { DEFAULT_SATELLITE_OPTIONS, groupCatalogue, groupFrames } from './satellites.js';
import type { FrameGroup } from './satellites.js';
import type { Background, Component, DroppedComponent, Frame, Mask, RawImage, RGB, Segmentation } from './types.js';
import { boxUnion } from './types.js';

function frameFromGroup(id: string, row: number, primary: Component, satellites: readonly Component[], mask: Mask, pivot: PivotOptions): Frame {
  let box = { x: primary.x, y: primary.y, w: primary.w, h: primary.h };
  for (const s of satellites) box = boxUnion(box, s);
  return { id, row, primary, satellites, ...box, pivot: computePivot(primary, mask, pivot) };
}

/** `#rrggbb` -> RGB. Validated by parseRecipe. */
function parseHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function resolveBackground(img: RawImage, recipe: Recipe): Background {
  const detected = detectBackground(img, DEFAULT_BACKGROUND_OPTIONS);
  if (!recipe.background) return detected;
  return { colors: recipe.background.map(parseHex), transparent: detected.transparent };
}

/** Force recipe `erase` rectangles to background (clipped to the sheet). */
function eraseRects(mask: Mask, rects: NonNullable<Recipe['overrides']>['erase']): void {
  for (const r of rects ?? []) {
    const x1 = Math.min(mask.width, r.x + r.w);
    const y1 = Math.min(mask.height, r.y + r.h);
    for (let y = r.y; y < y1; y++) mask.alpha.fill(0, y * mask.width + r.x, y * mask.width + x1);
  }
}

/** Catalogue props smaller than this many pixels are fragments of a neighbour, or dust. */
const CATALOGUE_MIN_PROP_AREA = 20;

/**
 * Run the automatic pipeline: background -> mask -> components -> filter ->
 * rows -> frame groups. Applies the recipe's `overrides` (merge/drop) so the
 * returned frames are what the reviewer sees and the packer consumes.
 * Frame ids come from the pre-override result and therefore survive edits.
 */
export function segment(img: RawImage, recipe: Recipe): Segmentation {
  const background = resolveBackground(img, recipe);
  const mask = buildMask(img, background, { ...DEFAULT_MASK_OPTIONS, ...recipe.mask });
  eraseRects(mask, recipe.overrides?.erase);
  const { components, labels } = labelComponents(mask, { ...DEFAULT_COMPONENT_OPTIONS, ...recipe.components });
  const filterOpts = { ...DEFAULT_FILTER_OPTIONS, ...recipe.filter };
  const { kept, dropped } = filterComponents(components, img.width, img.height, filterOpts);
  const rowsOfComponents = clusterRows(kept, img.height, { ...DEFAULT_ROW_OPTIONS, ...recipe.rows });
  const pivotOpts: PivotOptions = { ...DEFAULT_PIVOT_OPTIONS, ...recipe.pivot };
  const satOpts = { ...DEFAULT_SATELLITE_OPTIONS, ...recipe.satellites };
  const allDropped: DroppedComponent[] = [...dropped];

  const group = (row: Component[]): FrameGroup[] => {
    if (recipe.kind === 'sheet') return groupFrames(row, satOpts);
    const { groups, stray } = groupCatalogue(row, Math.max(CATALOGUE_MIN_PROP_AREA, filterOpts.minArea * 20));
    for (const c of stray) allDropped.push({ component: c, reason: 'noise' });
    return groups;
  };

  let rows: Frame[][] = rowsOfComponents
    .map((row, r) => group(row).map((g, i) => frameFromGroup(`r${r}f${i}`, r, g.primary, g.satellites, mask, pivotOpts)))
    .filter((row) => row.length > 0);

  const ov = recipe.overrides;
  if (ov) {
    const byId = new Map<string, Frame>();
    for (const row of rows) for (const f of row) byId.set(f.id, f);
    const requireFrame = (id: string, what: string): Frame => {
      const f = byId.get(id);
      if (!f) throw new RecipeError(`overrides.${what} references unknown frame "${id}"`);
      return f;
    };

    for (const group of ov.merge ?? []) {
      const [keepId, ...rest] = group;
      const keep = requireFrame(keepId, 'merge');
      const sats = [...keep.satellites];
      for (const id of rest) {
        const f = requireFrame(id, 'merge');
        if (f === keep) continue;
        sats.push(f.primary, ...f.satellites);
        byId.delete(id);
      }
      byId.set(keepId, frameFromGroup(keepId, keep.row, keep.primary, sats, mask, pivotOpts));
    }
    for (const id of ov.drop ?? []) {
      const f = requireFrame(id, 'drop');
      allDropped.push({ component: f.primary, reason: 'override' });
      for (const s of f.satellites) allDropped.push({ component: s, reason: 'override' });
      byId.delete(id);
    }
    for (const [id, p] of Object.entries(ov.pivots ?? {})) {
      const f = requireFrame(id, 'pivots');
      byId.set(id, { ...f, pivot: { x: f.x + p.x, y: f.y + p.y } });
    }

    rows = rows.map((row) => row.filter((f) => byId.has(f.id)).map((f) => byId.get(f.id)!)).filter((r) => r.length > 0);
  }

  return { width: img.width, height: img.height, background, mask, labels, rows, dropped: allDropped };
}

/** A frame with its final name and frame-relative pivot, ready for packing. */
export interface PlannedFrame {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Pivot relative to the frame's top-left, in source pixels. */
  readonly pivot: { readonly x: number; readonly y: number };
}

export interface PlannedAnimation {
  readonly name: string;
  readonly fps: number;
  readonly loop: boolean;
  readonly frames: readonly string[];
}

export interface AtlasPlan {
  readonly name: string;
  readonly scale: number;
  readonly frames: readonly PlannedFrame[];
  readonly animations: readonly PlannedAnimation[];
  /** Frame ids the recipe never referenced; reported so nothing goes missing silently. */
  readonly unused: readonly string[];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function frameById(seg: Segmentation): Map<string, Frame> {
  const m = new Map<string, Frame>();
  for (const row of seg.rows) for (const f of row) m.set(f.id, f);
  return m;
}

function resolveAnimationFrames(anim: AnimationSpec, seg: Segmentation, byId: Map<string, Frame>): Frame[] {
  if (anim.frames) {
    return anim.frames.map((id) => {
      const f = byId.get(id);
      if (!f) throw new RecipeError(`animation "${anim.name}" references unknown frame "${id}"`);
      return f;
    });
  }
  const row = seg.rows[anim.row];
  if (!row) throw new RecipeError(`animation "${anim.name}" uses row ${anim.row} but the sheet has ${seg.rows.length} rows`);
  return [...row];
}

/**
 * Turn a segmentation plus recipe into the concrete list of frames and
 * animations to pack. Pivots are recomputed per animation (a flyer's row can
 * anchor at centre while the rest of the sheet anchors at the feet) and
 * optionally stabilised. Explicit pivot overrides always win.
 */
export function planAtlas(seg: Segmentation, recipe: Recipe): AtlasPlan {
  const byId = frameById(seg);
  const used = new Map<string, string>(); // frame id -> atlas frame name
  const frames: PlannedFrame[] = [];
  const animations: PlannedAnimation[] = [];
  const overridden = new Set(Object.keys(recipe.overrides?.pivots ?? {}));
  const basePivot: PivotOptions = { ...DEFAULT_PIVOT_OPTIONS, ...recipe.pivot };

  /** Register a frame once; a frame shared by two animations keeps its first name. */
  const emit = (f: Frame, name: string): string => {
    const existing = used.get(f.id);
    if (existing) return existing;
    frames.push({ id: f.id, name, x: f.x, y: f.y, w: f.w, h: f.h, pivot: { x: f.pivot.x - f.x, y: f.pivot.y - f.y } });
    used.set(f.id, name);
    return name;
  };

  if (recipe.kind === 'sheet') {
    for (const anim of recipe.animations ?? []) {
      let list = resolveAnimationFrames(anim, seg, byId);
      const pivotOpts = { ...basePivot, ...anim.pivot };
      list = list.map((f) => (overridden.has(f.id) ? f : { ...f, pivot: computePivot(f.primary, seg.mask, pivotOpts) }));
      if (anim.stabilize) {
        const stabilised = stabilizePivots(list);
        list = list.map((f, i) => (overridden.has(f.id) ? f : stabilised[i]));
      }
      const names: string[] = [];
      list.forEach((f, i) => {
        names.push(emit(f, `${anim.name}_${pad2(i)}`));
      });
      animations.push({ name: anim.name, fps: anim.fps, loop: anim.loop, frames: names });
    }
  } else {
    for (const [id, name] of Object.entries(recipe.props ?? {})) {
      const f = byId.get(id);
      if (!f) throw new RecipeError(`props references unknown frame "${id}"`);
      emit(f, name);
    }
  }

  const unused = [...byId.keys()].filter((id) => !used.has(id));
  return { name: recipe.name, scale: recipe.scale ?? 1, frames, animations, unused };
}
