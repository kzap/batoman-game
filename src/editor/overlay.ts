import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { LevelJson, Rect } from '@content/level';
import { DECOR_Z } from '@render/level-view';
import { PIXELS_PER_UNIT, toUnits } from '@render/units';
import { allRefs, bounds, type DecorSizer, type ObjectKind, type Ref } from './doc';

/** Outline colour per kind; the debug overlay's green/rust/magenta/cyan family plus a few. */
export const KIND_COLORS: Readonly<Record<ObjectKind, number>> = {
  solid: 0x40ff80,
  oneWay: 0xd2691e,
  mover: 0xffd040,
  hazard: 0xff40c0,
  deathZone: 0xff4040,
  checkpoint: 0xffaa33,
  enemy: 0xff8080,
  decor: 0x80c0ff,
  spawn: 0xffffff,
  exit: 0x00e5ff,
};

const SELECT_COLOR = 0xffffff;
const GRID_COLOR = 0x3a3a55;
const BOUNDS_COLOR = 0x8080a0;
/** Everything the editor draws sits above the front decor layer and ignores depth; the small offsets order the layers among themselves. */
const OVERLAY_Z = DECOR_Z.front + 0.5;
const Z = { grid: OVERLAY_Z - 0.1, objects: OVERLAY_Z, selection: OVERLAY_Z + 0.1, handles: OVERLAY_Z + 0.2 } as const;
/** Draw order after the scene (which uses the default 0): grid under outlines under handles. */
const RENDER_ORDER = { grid: 99, lines: 100, handles: 101 } as const;
/** Handle size in CSS pixels; rescaled from the camera distance each frame. */
const HANDLE_PX = 8;

/** Resize handles: name and position on the unit rect (0..1). */
export const HANDLES = [
  { name: 'sw', u: 0, v: 0 },
  { name: 's', u: 0.5, v: 0 },
  { name: 'se', u: 1, v: 0 },
  { name: 'e', u: 1, v: 0.5 },
  { name: 'ne', u: 1, v: 1 },
  { name: 'n', u: 0.5, v: 1 },
  { name: 'nw', u: 0, v: 1 },
  { name: 'w', u: 0, v: 0.5 },
] as const;
export type HandleName = (typeof HANDLES)[number]['name'];

function rectSegments(out: number[], r: Rect, z: number): void {
  const x0 = toUnits(r.x);
  const y0 = toUnits(r.y);
  const x1 = toUnits(r.x + r.w);
  const y1 = toUnits(r.y + r.h);
  out.push(x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z);
}

function lines(points: number[], color: number, opacity = 1): LineSegments {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
  const mat = new LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false });
  const seg = new LineSegments(geo, mat);
  seg.renderOrder = RENDER_ORDER.lines;
  return seg;
}

/**
 * Everything the editor draws over the level: outlines for every object,
 * mover paths, the level bounds and grid, the selection with its resize
 * handles, and the rectangle being dragged out. Rebuilt on every document
 * revision; the level is small enough that this is cheaper than diffing.
 */
export class EditorOverlay {
  readonly group = new Group();
  private objects = new Group();
  private selection = new Group();
  private readonly handles: Mesh[] = [];
  private readonly handleMaterial = new MeshBasicMaterial({ color: SELECT_COLOR, depthTest: false });
  private ghost: LineSegments | null = null;
  private grid: LineSegments | null = null;
  private gridSize = 0;
  private gridLevel: { w: number; h: number } = { w: 0, h: 0 };

  constructor() {
    this.group.add(this.objects, this.selection);
    for (const h of HANDLES) {
      const m = new Mesh(new PlaneGeometry(1, 1), this.handleMaterial);
      m.name = h.name;
      m.renderOrder = RENDER_ORDER.handles;
      this.handles.push(m);
      this.selection.add(m);
    }
  }

  /** Redraw the object outlines and the selection. */
  rebuild(level: LevelJson, selected: Ref | null, sizer: DecorSizer): void {
    this.group.remove(this.objects);
    this.disposeGroup(this.objects);
    this.objects = new Group();
    const byKind = new Map<ObjectKind, number[]>();
    for (const ref of allRefs(level)) {
      const pts = byKind.get(ref.kind) ?? [];
      rectSegments(pts, bounds(level, ref, sizer), Z.objects);
      byKind.set(ref.kind, pts);
    }
    for (const [kind, pts] of byKind) this.objects.add(lines(pts, KIND_COLORS[kind], 0.9));
    // Mover paths: waypoints are the collider's min corner; draw the collider at each and join their centres.
    const path: number[] = [];
    for (const m of level.movingSolids) {
      for (let i = 1; i < m.path.length; i++) {
        const a = m.path[i - 1]!;
        const b = m.path[i]!;
        path.push(toUnits(a.x + m.w / 2), toUnits(a.y + m.h / 2), Z.objects, toUnits(b.x + m.w / 2), toUnits(b.y + m.h / 2), Z.objects);
      }
      for (const p of m.path) rectSegments(path, { x: p.x, y: p.y, w: m.w, h: m.h }, Z.objects);
    }
    if (path.length) this.objects.add(lines(path, KIND_COLORS.mover, 0.5));
    const boundsPts: number[] = [];
    rectSegments(boundsPts, { x: 0, y: 0, w: level.width, h: level.height }, Z.objects);
    this.objects.add(lines(boundsPts, BOUNDS_COLOR));
    this.group.add(this.objects);
    this.setGrid(this.gridSize, level);
    this.showSelection(selected ? bounds(level, selected, sizer) : null, selected?.kind ?? null);
  }

  /** Grid lines at `size` sim px over the level; 0 hides them. */
  setGrid(size: number, level: LevelJson): void {
    if (this.grid && size === this.gridSize && level.width === this.gridLevel.w && level.height === this.gridLevel.h) return;
    if (this.grid) {
      this.group.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as LineBasicMaterial).dispose();
      this.grid = null;
    }
    this.gridSize = size;
    this.gridLevel = { w: level.width, h: level.height };
    if (size <= 0) return;
    const pts: number[] = [];
    for (let x = 0; x <= level.width; x += size) pts.push(toUnits(x), 0, Z.grid, toUnits(x), toUnits(level.height), Z.grid);
    for (let y = 0; y <= level.height; y += size) pts.push(0, toUnits(y), Z.grid, toUnits(level.width), toUnits(y), Z.grid);
    this.grid = lines(pts, GRID_COLOR, 0.35);
    this.grid.renderOrder = RENDER_ORDER.grid;
    this.group.add(this.grid);
  }

  private showSelection(r: Rect | null, kind: ObjectKind | null): void {
    this.selection.visible = r !== null;
    if (!r) return;
    const old = this.selection.children.filter((c) => c instanceof LineSegments);
    for (const o of old) {
      this.selection.remove(o);
      (o as LineSegments).geometry.dispose();
      ((o as LineSegments).material as LineBasicMaterial).dispose();
    }
    const pts: number[] = [];
    rectSegments(pts, r, Z.selection);
    this.selection.add(lines(pts, SELECT_COLOR));
    const resizable = kind !== 'spawn' && kind !== 'enemy';
    for (const [i, h] of HANDLES.entries()) {
      const m = this.handles[i]!;
      m.visible = resizable || h.name === 's';
      m.position.set(toUnits(r.x + r.w * h.u), toUnits(r.y + r.h * h.v), Z.handles);
    }
  }

  /** Keep handles a constant size on screen: `unitsPerPx` is the current stage units per CSS pixel at Z=0. */
  setScale(unitsPerPx: number): void {
    const s = HANDLE_PX * unitsPerPx;
    for (const h of this.handles) h.scale.set(s, s, 1);
  }

  /** Handle under a point (sim px), if any, with the same hit size the handles are drawn at. */
  handleAt(r: Rect, p: { x: number; y: number }, unitsPerPx: number): HandleName | null {
    const half = (HANDLE_PX * unitsPerPx * PIXELS_PER_UNIT) / 2 + 2;
    for (const h of HANDLES) {
      const hx = r.x + r.w * h.u;
      const hy = r.y + r.h * h.v;
      const m = this.handles.find((x) => x.name === h.name)!;
      if (m.visible && Math.abs(p.x - hx) <= half && Math.abs(p.y - hy) <= half) return h.name;
    }
    return null;
  }

  /** Rectangle being dragged out by a create tool; null clears it. */
  setGhost(r: Rect | null, kind: ObjectKind): void {
    if (this.ghost) {
      this.group.remove(this.ghost);
      this.ghost.geometry.dispose();
      (this.ghost.material as LineBasicMaterial).dispose();
      this.ghost = null;
    }
    if (!r) return;
    const pts: number[] = [];
    rectSegments(pts, r, Z.selection);
    this.ghost = lines(pts, KIND_COLORS[kind]);
    this.group.add(this.ghost);
  }

  private disposeGroup(g: Group): void {
    g.traverse((o) => {
      if (o instanceof LineSegments || o instanceof Mesh) {
        o.geometry.dispose();
        const m = o.material as LineBasicMaterial | MeshBasicMaterial;
        if (m !== this.handleMaterial) m.dispose();
      }
    });
  }

  dispose(): void {
    this.disposeGroup(this.group);
    this.handleMaterial.dispose();
    this.group.removeFromParent();
  }
}

