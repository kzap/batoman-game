import { describe, expect, it } from 'vitest';
import type { LevelJson } from '@content/level';
import { levelProblems } from '@content/level';
import * as ops from '@editor/doc';
import { EditorDoc } from '@editor/doc';

const base: LevelJson = {
  version: 1,
  id: 'test',
  name: 'Test',
  width: 1024,
  height: 512,
  tileSize: 32,
  spawn: { x: 100, y: 64 },
  exit: { x: 960, y: 0, w: 64, h: 512 },
  solids: [{ x: 0, y: 0, w: 1024, h: 64 }, { x: 320, y: 128, w: 96, h: 32 }],
  oneWay: [{ x: 600, y: 160, w: 128, h: 8 }],
  movingSolids: [{ x: 500, y: 64, w: 96, h: 16, path: [{ x: 500, y: 64 }, { x: 700, y: 64 }], speed: 60, prop: 'plank' }],
  hazards: [{ x: 800, y: 64, w: 64, h: 16, kind: 'spikes' }],
  deathZones: [{ x: 0, y: 0, w: 1024, h: 8 }],
  checkpoints: [{ x: 400, y: 64, w: 32, h: 96, id: 1 }],
  enemies: [{ type: 'patroller', x: 700, y: 64, patrolDistance: 120 }],
  art: { props: 'props', backdrops: {}, decor: [{ prop: 'can', x: 200, y: 64 }, { prop: 'board', x: 300, y: 64, w: 100 }] },
};

const frames: Record<string, ops.FrameSize> = { can: { w: 16, h: 16, px: 0.5 }, board: { w: 200, h: 40, px: 0.5 }, plank: { w: 111, h: 43, px: 0.5 } };
const sizer: ops.DecorSizer = (p) => frames[p] ?? null;

describe('bounds', () => {
  it('places decor by its pivot fraction, mirrored when flipped', () => {
    const offPivot: ops.DecorSizer = () => ({ w: 100, h: 20, px: 0.3 });
    const lvl = { ...base, art: { ...base.art!, decor: [{ prop: 'p', x: 200, y: 0 }, { prop: 'p', x: 200, y: 0, flip: true }] } };
    expect(ops.bounds(lvl, { kind: 'decor', index: 0 }, offPivot).x).toBe(170);
    expect(ops.bounds(lvl, { kind: 'decor', index: 1 }, offPivot).x).toBe(130);
  });

  it('reports rect kinds as they are and point kinds as a standing body at the feet', () => {
    expect(ops.bounds(base, { kind: 'solid', index: 1 }, sizer)).toEqual({ x: 320, y: 128, w: 96, h: 32 });
    expect(ops.bounds(base, { kind: 'spawn', index: 0 }, sizer)).toEqual({ x: 88, y: 64, w: 24, h: 48 });
    expect(ops.bounds(base, { kind: 'enemy', index: 0 }, sizer)).toEqual({ x: 688, y: 64, w: 24, h: 48 });
  });

  it('sizes decor from the frame, or from an explicit width keeping the aspect', () => {
    expect(ops.bounds(base, { kind: 'decor', index: 0 }, sizer)).toEqual({ x: 192, y: 64, w: 16, h: 16 });
    expect(ops.bounds(base, { kind: 'decor', index: 1 }, sizer)).toEqual({ x: 250, y: 64, w: 100, h: 20 });
  });

  it('throws on a dangling ref', () => {
    expect(() => ops.bounds(base, { kind: 'solid', index: 9 }, sizer)).toThrow(/no solid/);
  });
});

describe('setBounds / move', () => {
  it('moves a mover with its whole path', () => {
    const next = ops.setBounds(base, { kind: 'mover', index: 0 }, { x: 532, y: 96, w: 96, h: 16 }, sizer);
    expect(next.movingSolids[0]!.path).toEqual([
      { x: 532, y: 96 },
      { x: 732, y: 96 },
    ]);
    expect(next.movingSolids[0]!.prop).toBe('plank');
  });

  it('moves point kinds by their feet and leaves the source level untouched', () => {
    const next = ops.move(base, { kind: 'spawn', index: 0 }, 32, 0, sizer);
    expect(next.spawn).toEqual({ x: 132, y: 64 });
    expect(base.spawn).toEqual({ x: 100, y: 64 });
  });

  it('resizing decor pins the width and drops any height so the aspect holds', () => {
    const next = ops.setBounds(base, { kind: 'decor', index: 0 }, { x: 100, y: 64, w: 64, h: 999 }, sizer);
    expect(next.art!.decor[0]).toEqual({ prop: 'can', x: 132, y: 64, w: 64 });
  });

  it('a pure move of decor keeps its size fields as they were', () => {
    const next = ops.move(base, { kind: 'decor', index: 1 }, 10, 5, sizer);
    expect(next.art!.decor[1]).toEqual({ prop: 'board', x: 310, y: 69, w: 100 });
  });
});

describe('add / remove / duplicate', () => {
  it('adds each kind with sensible defaults and returns its ref', () => {
    const r = { x: 64, y: 96, w: 64, h: 32 };
    expect(ops.add(base, 'solid', r).ref).toEqual({ kind: 'solid', index: 2 });
    expect(ops.add(base, 'checkpoint', r).level.checkpoints[1]!.id).toBe(2);
    expect(ops.add(base, 'hazard', r, { hazardKind: 'crusher' }).level.hazards[1]!.kind).toBe('crusher');
    const mover = ops.add(base, 'mover', r).level.movingSolids[1]!;
    expect(mover.path).toEqual([
      { x: 64, y: 96 },
      { x: 192, y: 96 },
    ]);
    expect(ops.add(base, 'enemy', r, { enemyType: 'drone' }).level.enemies[1]).toEqual({ type: 'drone', x: 96, y: 96, patrolDistance: 120 });
    const decor = ops.add(base, 'decor', r, { prop: 'can', layer: 'front', sizer }).level.art!.decor[2];
    expect(decor).toEqual({ prop: 'can', x: 96, y: 96, layer: 'front' });
    expect(ops.add(base, 'spawn', r).level.spawn).toEqual({ x: 96, y: 96 });
  });

  it('refuses decor without a prop', () => {
    expect(() => ops.add(base, 'decor', { x: 0, y: 0, w: 8, h: 8 })).toThrow(/prop/);
  });

  it('removes by index and ignores the singletons', () => {
    expect(ops.remove(base, { kind: 'solid', index: 0 }).solids).toEqual([{ x: 320, y: 128, w: 96, h: 32 }]);
    expect(ops.remove(base, { kind: 'spawn', index: 0 })).toBe(base);
  });

  it('duplicates one tile to the right, keeping kind-specific fields', () => {
    const hz = ops.duplicate(base, { kind: 'hazard', index: 0 }, sizer);
    expect(hz.level.hazards[1]).toEqual({ x: 832, y: 64, w: 64, h: 16, kind: 'spikes' });
    const cp = ops.duplicate(base, { kind: 'checkpoint', index: 0 }, sizer);
    expect(cp.level.checkpoints[1]).toEqual({ x: 432, y: 64, w: 32, h: 96, id: 2 });
    expect(ops.duplicate(base, { kind: 'exit', index: 0 }, sizer).level).toBe(base);
    const mv = ops.duplicate(base, { kind: 'mover', index: 0 }, sizer);
    expect(mv.level.movingSolids[1]!.path[1]).toEqual({ x: 732, y: 64 });
    expect(mv.level.movingSolids[1]!.prop).toBe('plank');
    const dc = ops.duplicate(base, { kind: 'decor', index: 1 }, sizer);
    expect(dc.level.art!.decor[2]).toEqual({ prop: 'board', x: 332, y: 64, w: 100 });
    const en = ops.duplicate(base, { kind: 'enemy', index: 0 }, sizer);
    expect(en.level.enemies[1]).toEqual({ type: 'patroller', x: 732, y: 64, patrolDistance: 120 });
  });
});

describe('fields', () => {
  it('lists editable fields per kind and reads/writes them', () => {
    expect(ops.fieldsFor('mover', ['plank']).map((f) => f.key)).toEqual(['x', 'y', 'w', 'h', 'speed', 'pause', 'prop', 'path']);
    expect(ops.getField(base, { kind: 'checkpoint', index: 0 }, 'id')).toBe(1);
    const next = ops.setField(base, { kind: 'enemy', index: 0 }, 'patrolDistance', undefined, sizer);
    expect(next.enemies[0]).toEqual({ type: 'patroller', x: 700, y: 64 });
  });

  it('typing a mover x or y moves its path along, like a drag does', () => {
    const next = ops.setField(base, { kind: 'mover', index: 0 }, 'x', 600, sizer);
    expect(next.movingSolids[0]!.x).toBe(600);
    expect(next.movingSolids[0]!.path).toEqual([
      { x: 600, y: 64 },
      { x: 800, y: 64 },
    ]);
  });
});

describe('queries', () => {
  it('hit-tests smallest first so a can on the floor beats the floor', () => {
    const hits = ops.refsAt(base, { x: 200, y: 64 }, sizer);
    expect(hits[0]).toEqual({ kind: 'decor', index: 0 });
    expect(hits.at(-1)).toEqual({ kind: 'solid', index: 0 });
  });

  it('snaps rects to the grid and never collapses them', () => {
    expect(ops.snapRect({ x: 10, y: 20, w: 5, h: 3 }, 32)).toEqual({ x: 0, y: 32, w: 32, h: 32 });
    expect(ops.snapRect({ x: 30, y: 0, w: 70, h: 40 }, 32)).toEqual({ x: 32, y: 0, w: 64, h: 32 });
    expect(ops.rectFromDrag({ x: 50, y: 50 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 40, h: 30 });
  });
});

describe('dressSpan', () => {
  it('tiles a solid with copies scaled to its height, appended as decor', () => {
    // board is 200x40 -> at h 64 each copy is 320 wide; the 1024 floor takes round(3.2) = 3 copies of 341.
    const next = ops.dressSpan(base, { kind: 'solid', index: 0 }, 'board', sizer);
    const added = next.art!.decor.slice(2);
    expect(added).toHaveLength(3);
    expect(added[0]).toEqual({ prop: 'board', x: 171, y: 0, w: 341, h: 64 });
    expect(added[2]!.x).toBe(853);
    expect(levelProblems(next)).toEqual([]);
  });

  it('hangs natural-aspect copies from the top of a thin one-way', () => {
    // one-way at y 160 h 8, 128 wide; board 200x40 -> one copy, 128 wide, 25.6 tall, top at 168.
    const next = ops.dressSpan(base, { kind: 'oneWay', index: 0 }, 'board', sizer);
    expect(next.art!.decor.at(-1)).toEqual({ prop: 'board', x: 664, y: 142, w: 128 });
  });

  it('rejects non-solid targets and unknown props', () => {
    expect(() => ops.dressSpan(base, { kind: 'enemy', index: 0 }, 'board', sizer)).toThrow(/solid/);
    expect(() => ops.dressSpan(base, { kind: 'solid', index: 0 }, 'nope', sizer)).toThrow(/unknown prop/);
  });
});

describe('EditorDoc history', () => {
  it('records commits, undoes and redoes, and drops a selection that no longer exists', () => {
    const doc = new EditorDoc(base, sizer);
    const added = ops.add(base, 'solid', { x: 64, y: 96, w: 64, h: 32 });
    expect(doc.commit(added.level)).toBe(true);
    doc.selection = added.ref;
    expect(doc.commit(doc.level)).toBe(false); // identical reference: no-op
    expect(doc.undo()).toBe(true);
    expect(doc.level).toBe(base);
    expect(doc.selection).toBeNull();
    expect(doc.redo()).toBe(true);
    expect(doc.level).toBe(added.level);
    expect(doc.redo()).toBe(false);
  });

  it('previews bypass history and a commitFrom records the whole drag as one step', () => {
    const doc = new EditorDoc(base, sizer);
    const ref = { kind: 'solid', index: 1 } as const;
    const step1 = ops.move(base, ref, 32, 0, sizer);
    const step2 = ops.move(base, ref, 64, 0, sizer);
    doc.preview(step1);
    doc.preview(step2);
    expect(doc.level).toBe(step2);
    expect(doc.undo()).toBe(false); // nothing recorded yet
    expect(doc.commitFrom(base, step2)).toBe(true);
    expect(doc.undo()).toBe(true);
    expect(doc.level).toBe(base);
    // A drag that ends where it started leaves history alone and restores the base.
    doc.preview(step1);
    expect(doc.commitFrom(base, base)).toBe(false);
    expect(doc.level).toBe(base);
    expect(doc.undo()).toBe(false);
  });
});
