import { describe, expect, it } from 'vitest';
import { extractFrame } from '../extract';
import { applyMask } from '../mask';
import { parseRecipe, RecipeError, scaffoldRecipe } from '../recipe';
import type { Recipe } from '../recipe';
import { planAtlas, segment } from '../segment';
import { BLUE, Canvas, PINK, RED } from './fixtures';

/** Two rows: three red "actors" (with a small blue puff next to the second) and two blue bullets. */
function sheet(): Canvas {
  return new Canvas(200, 120, PINK)
    .rect(10, 10, 30, 40, RED)
    .rect(60, 10, 30, 40, RED)
    .rect(93, 12, 5, 5, BLUE) // puff -> satellite of second actor
    .rect(110, 10, 30, 40, RED)
    .rect(10, 80, 8, 6, BLUE)
    .rect(40, 80, 8, 6, BLUE)
    .rect(190, 112, 4, 4, BLUE); // sparkle
}

const base: Recipe = {
  version: 1,
  source: 'x.png',
  name: 'test',
  kind: 'sheet',
  filter: { minArea: 4, watermark: { corner: [0.1, 0.1], maxArea: 0.01 } },
  animations: [
    { name: 'walk', row: 0, fps: 8, loop: true },
    { name: 'shot', row: 1, fps: 12, loop: false, pivot: { mode: 'center', anchor: 'center' } },
  ],
};

describe('segment', () => {
  it('produces stable frame ids, satellites, and drops the watermark', () => {
    const seg = segment(sheet().image(), base);
    expect(seg.rows.map((r) => r.map((f) => f.id))).toEqual([
      ['r0f0', 'r0f1', 'r0f2'],
      ['r1f0', 'r1f1'],
    ]);
    expect(seg.rows[0][1].satellites).toHaveLength(1);
    expect(seg.rows[0][1]).toMatchObject({ x: 60, y: 10, w: 38, h: 40 });
    expect(seg.dropped.map((d) => d.reason)).toEqual(['watermark']);
  });

  it('applies merge, drop and pivot overrides by id', () => {
    const recipe: Recipe = {
      ...base,
      overrides: { merge: [['r0f0', 'r0f1']], drop: ['r1f1'], pivots: { r0f2: { x: 1, y: 2 } } },
    };
    const seg = segment(sheet().image(), recipe);
    expect(seg.rows.map((r) => r.map((f) => f.id))).toEqual([['r0f0', 'r0f2'], ['r1f0']]);
    expect(seg.rows[0][0]).toMatchObject({ x: 10, w: 88 });
    expect(seg.rows[0][1].pivot).toEqual({ x: 111, y: 12 });
    expect(seg.dropped.filter((d) => d.reason === 'override')).toHaveLength(1);
  });

  it('erase rectangles cut touching components apart before ids are assigned', () => {
    const img = new Canvas(120, 60, PINK).rect(10, 10, 60, 30, RED).image();
    const recipe: Recipe = { version: 1, source: 'x', name: 't', kind: 'sheet', filter: { watermark: null }, animations: [] };
    expect(segment(img, recipe).rows[0]).toHaveLength(1);
    const cut = segment(img, { ...recipe, overrides: { erase: [{ x: 39, y: 0, w: 2, h: 60 }] } });
    expect(cut.rows[0]!.map((f) => [f.x, f.w])).toEqual([
      [10, 29],
      [41, 29],
    ]);
  });

  it('uses an explicit background palette when the recipe provides one', () => {
    // Border is pink but the recipe says the key is red: the red block becomes background, pink stays.
    const img = new Canvas(60, 30, PINK).rect(10, 10, 10, 10, RED).image();
    const seg = segment(img, { version: 1, source: 'x', name: 't', kind: 'sheet', background: ['#c81e1e'], filter: { watermark: null }, animations: [] });
    expect(seg.background.colors).toEqual([RED]);
    expect(seg.mask.alpha[15 * 60 + 15]).toBe(0);
  });

  it('rejects overrides naming unknown frames', () => {
    expect(() => segment(sheet().image(), { ...base, overrides: { drop: ['r9f9'] } })).toThrow(RecipeError);
  });
});

describe('planAtlas', () => {
  it('names frames per animation, recomputes pivots per animation, and reports unused frames', () => {
    const recipe: Recipe = { ...base, animations: [base.animations![0]] };
    const seg = segment(sheet().image(), recipe);
    const plan = planAtlas(seg, recipe);
    expect(plan.frames.map((f) => f.name)).toEqual(['walk_00', 'walk_01', 'walk_02']);
    expect(plan.animations).toEqual([{ name: 'walk', fps: 8, loop: true, frames: ['walk_00', 'walk_01', 'walk_02'] }]);
    expect(plan.unused).toEqual(['r1f0', 'r1f1']);
    // Bottom-anchored mass pivot, frame-relative.
    expect(plan.frames[0].pivot).toEqual({ x: 15, y: 40 });
  });

  it('uses animation pivot options and shares a frame between animations under one name', () => {
    const recipe: Recipe = {
      ...base,
      animations: [...base.animations!, { name: 'idle', row: 0, frames: ['r0f0'], fps: 1, loop: true }],
    };
    const plan = planAtlas(segment(sheet().image(), recipe), recipe);
    expect(plan.frames.find((f) => f.name === 'shot_00')?.pivot).toEqual({ x: 4, y: 3 });
    expect(plan.animations[2].frames).toEqual(['walk_00']);
    expect(plan.frames.filter((f) => f.id === 'r0f0')).toHaveLength(1);
  });

  it('explicit pivot overrides survive per-animation recomputation', () => {
    const recipe: Recipe = { ...base, overrides: { pivots: { r1f0: { x: 0, y: 0 } } } };
    const plan = planAtlas(segment(sheet().image(), recipe), recipe);
    expect(plan.frames.find((f) => f.id === 'r1f0')?.pivot).toEqual({ x: 0, y: 0 });
  });

  it('catalogue kind never fuses components', () => {
    const img = new Canvas(120, 60, PINK).rect(10, 10, 40, 40, RED).rect(55, 12, 5, 5, BLUE).image();
    const asSheet: Recipe = { version: 1, source: 'x', name: 't', kind: 'sheet', filter: { watermark: null }, animations: [] };
    expect(segment(img, asSheet).rows[0]!).toHaveLength(1);
    // Catalogue: the puff is a prop in its own right (above the fragment threshold)...
    const cat = segment(img, { ...asSheet, kind: 'catalogue', filter: { minArea: 1, watermark: null } });
    expect(cat.rows[0]!).toHaveLength(2);
    // ...but a fragment inside a prop's box joins it, and one outside any prop is dust.
    const withFragments = new Canvas(120, 60, PINK).ring(10, 10, 40, 40, RED, PINK).rect(20, 20, 2, 2, BLUE).rect(90, 20, 2, 2, BLUE).image();
    const seg = segment(withFragments, { ...asSheet, kind: 'catalogue', filter: { minArea: 1, watermark: null } });
    expect(seg.rows[0]!).toHaveLength(1);
    expect(seg.rows[0]![0]!.satellites).toHaveLength(1);
    expect(seg.dropped.map((d) => d.reason)).toEqual(['noise']);
  });

  it('catalogue kind emits named props only', () => {
    const recipe: Recipe = { version: 1, source: 'x', name: 'props', kind: 'catalogue', filter: { minArea: 1, watermark: null }, props: { r0f0: 'crate', r1f1: 'bolt' } };
    const plan = planAtlas(segment(sheet().image(), recipe), recipe);
    expect(plan.frames.map((f) => f.name)).toEqual(['crate', 'bolt']);
    expect(plan.animations).toEqual([]);
    expect(plan.unused).toEqual(['r0f1', 'r0f2', 'r0f3', 'r1f0']); // the puff is a prop candidate in catalogue mode; the sparkle is dust
  });
});

describe('extractFrame', () => {
  it('copies only pixels belonging to the frame, not overlapping neighbours', () => {
    // Actor A has a long barrel that reaches under actor B's box.
    const img = new Canvas(120, 60, PINK).rect(10, 10, 30, 40, RED).rect(40, 40, 30, 4, RED).rect(60, 10, 30, 28, BLUE).image();
    const recipe: Recipe = { version: 1, source: 'x', name: 't', kind: 'sheet', filter: { watermark: null }, animations: [] };
    const seg = segment(img, recipe);
    const keyed = applyMask(img, seg.mask, seg.background);
    const [a, b] = seg.rows[0];
    const cutB = extractFrame(keyed, seg, b);
    // The barrel passes at y=40..43, x=60..69 which is inside B's box? B's box is y 10..37 so no; extend check using A.
    const cutA = extractFrame(keyed, seg, a);
    expect(cutA.width).toBe(60);
    // Pixel of B inside A's box (x=60..69, y=10..37 overlaps A's box x 10..69) must be transparent in A's cut.
    expect(cutA.data[((12 - a.y) * cutA.width + (62 - a.x)) * 4 + 3]).toBe(0);
    // And the barrel pixel is present.
    expect(cutA.data[((41 - a.y) * cutA.width + (65 - a.x)) * 4 + 3]).toBe(255);
    expect(cutB.width).toBe(30);
  });
});

describe('parseRecipe', () => {
  it('accepts the scaffold and rejects malformed input with a path', () => {
    expect(() => parseRecipe(scaffoldRecipe('a.png', 'a', 'sheet', 2))).not.toThrow();
    expect(() => parseRecipe({ ...scaffoldRecipe('a.png', 'a', 'sheet', 1), name: 'Bad Name' })).toThrow(/name/);
    expect(() => parseRecipe({ ...base, animations: [{ name: 'x', row: 0, fps: 0, loop: true }] })).toThrow(/fps/);
    expect(() => parseRecipe({ ...base, overrides: { merge: [['r0f0']] } })).toThrow(/merge/);
    expect(() => parseRecipe({ ...base, rows: { bogus: 1 } })).toThrow(/rows\.bogus/);
    expect(() => parseRecipe({ ...base, scale: 2 })).toThrow(/scale/);
  });
});
