import { describe, expect, it } from 'vitest';
import { filterComponents } from '../filter';
import { computePivot, stabilizePivots } from '../pivot';
import { clusterRows, findRowBands } from '../rows';
import { groupFrames } from '../satellites';
import type { Frame } from '../types';
import { comp, maskFromRects } from './fixtures';

describe('filterComponents', () => {
  it('drops specks and the bottom-right sparkle but keeps a large sprite in that corner', () => {
    const sheet = { w: 1000, h: 500 };
    const speck = comp(400, 100, 2, 2);
    const sprite = comp(100, 100, 50, 80);
    const sparkle = comp(960, 470, 20, 20);
    const bigInCorner = comp(930, 430, 60, 60); // area 3600 > 0.002 * 500000 = 1000
    const { kept, dropped } = filterComponents([speck, sprite, sparkle, bigInCorner], sheet.w, sheet.h);
    expect(kept).toEqual([sprite, bigInCorner]);
    expect(dropped.map((d) => d.reason)).toEqual(['noise', 'watermark']);
  });

  it('keeps specks that sit inside a larger component (fragments, not noise)', () => {
    const sprite = comp(100, 100, 50, 80);
    const fragment = comp(120, 120, 2, 2);
    const stray = comp(300, 300, 2, 2);
    const { kept, dropped } = filterComponents([sprite, fragment, stray], 1000, 500, { minArea: 6, watermark: null });
    expect(kept).toEqual([sprite, fragment]);
    expect(dropped.map((d) => d.component)).toEqual([stray]);
  });

  it('can disable watermark removal', () => {
    const sparkle = comp(960, 470, 20, 20);
    const { kept } = filterComponents([sparkle], 1000, 500, { minArea: 1, watermark: null });
    expect(kept).toEqual([sparkle]);
  });
});

describe('findRowBands / clusterRows', () => {
  it('does not let a speck between rows create a row of its own', () => {
    const rowA = [comp(0, 10, 40, 30), comp(50, 10, 40, 30)];
    const rowB = [comp(0, 80, 40, 30), comp(50, 80, 40, 30)];
    const speck = comp(20, 55, 3, 3);
    const rows = clusterRows([...rowA, speck, ...rowB], 150);
    expect(rows).toHaveLength(2);
    expect(rows.flat()).toContain(speck);
  });

  it('splits rows at empty gaps and tolerates small gaps inside a row', () => {
    const rowA = [comp(0, 10, 10, 30), comp(20, 12, 10, 26), comp(40, 43, 10, 5)]; // last hangs 3px below (gap<=6 bridges)
    const rowB = [comp(0, 60, 10, 30), comp(20, 60, 10, 30)];
    const bands = findRowBands([...rowA, ...rowB], 100);
    expect(bands).toEqual([
      { y0: 10, y1: 48 },
      { y0: 60, y1: 90 },
    ]);
    const rows = clusterRows([...rowB, ...rowA], 100);
    expect(rows.map((r) => r.length)).toEqual([3, 2]);
    expect(rows[0].map((c) => c.x)).toEqual([0, 20, 40]);
  });

  it('splits two dense rows bridged by a single tall component', () => {
    const rowA = [comp(0, 10, 10, 30), comp(20, 10, 10, 30), comp(40, 10, 10, 30)];
    const rowB = [comp(0, 60, 10, 30), comp(20, 60, 10, 30), comp(40, 60, 10, 30)];
    const tall = comp(80, 10, 10, 80); // spans both rows
    const rows = clusterRows([...rowA, ...rowB, tall], 100);
    expect(rows).toHaveLength(2);
    // The thin run (y 40..59) joins the band below it, so tall's centroid (y=50) lands in row 1.
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(4);
  });

  it('does not split when the bridge is not a lone component', () => {
    // Two rows of two, joined by two overlapping tall components: coverage never drops to <= 1.
    const a = [comp(0, 10, 10, 80), comp(20, 10, 10, 80), comp(40, 10, 10, 30), comp(40, 60, 10, 30)];
    expect(clusterRows(a, 100)).toHaveLength(1);
  });
});

describe('groupFrames', () => {
  it('attaches small satellites to the nearest primary within reach', () => {
    const p1 = comp(0, 0, 40, 60);
    const p2 = comp(100, 0, 40, 60);
    const puff = comp(45, 0, 6, 6); // right next to p1
    const far = comp(75, 0, 6, 6); // gap to p1 = 35, to p2 = 19; reach = 0.35*40 = 14 -> promoted
    const groups = groupFrames([p1, puff, far, p2]);
    expect(groups.map((g) => g.primary.id)).toEqual([p1.id, far.id, p2.id]);
    expect(groups[0].satellites).toEqual([puff]);
  });

  it('treats a row of uniformly small sprites as all primaries', () => {
    const bullets = [comp(0, 0, 6, 6), comp(20, 0, 8, 6), comp(40, 0, 6, 8), comp(60, 0, 7, 7)];
    expect(groupFrames(bullets).map((g) => g.satellites.length)).toEqual([0, 0, 0, 0]);
  });

  it('fuses primaries whose x-ranges overlap substantially', () => {
    const head = comp(10, 0, 30, 20);
    const body = comp(8, 22, 34, 40);
    const other = comp(100, 0, 40, 60);
    const groups = groupFrames([head, body, other]);
    expect(groups).toHaveLength(2);
    expect(groups[0].primary).toBe(body);
    expect(groups[0].satellites).toEqual([head]);
  });
});

describe('computePivot', () => {
  const mask = maskFromRects(40, 40, [
    { x: 10, y: 10, w: 20, h: 20 }, // body
    { x: 10, y: 30, w: 5, h: 4 }, // one foot at the left
  ]);
  const primary = { ...comp(10, 10, 20, 24), cx: 19, cy: 20 };

  it('mass mode uses the silhouette centroid and bottom anchor', () => {
    expect(computePivot(primary, mask, { mode: 'mass', contactBand: 0.1, anchor: 'bottom' })).toEqual({ x: 19, y: 34 });
  });

  it('contact mode uses the bottom band centroid', () => {
    const p = computePivot(primary, mask, { mode: 'contact', contactBand: 0.1, anchor: 'bottom' });
    expect(p.y).toBe(34);
    expect(p.x).toBeCloseTo(12.5); // foot spans pixels 10..14, geometric centre 12.5
  });

  it('center mode anchors at the box centre', () => {
    expect(computePivot(primary, mask, { mode: 'center', contactBand: 0.1, anchor: 'center' })).toEqual({ x: 20, y: 22 });
  });
});

describe('stabilizePivots', () => {
  const frame = (id: string, x: number, pivotX: number): Frame => {
    const primary = comp(x, 0, 20, 40);
    return { id, row: 0, primary, satellites: [], x, y: 0, w: 20, h: 40, pivot: { x: pivotX, y: 40 } };
  };

  it('snaps outliers to the median offset from box centre', () => {
    const frames = [frame('a', 0, 10), frame('b', 30, 40), frame('c', 60, 76), frame('d', 90, 100)];
    const out = stabilizePivots(frames);
    expect(out.map((f) => f.pivot.x)).toEqual([10, 40, 70, 100]);
  });

  it('leaves short animations alone', () => {
    const frames = [frame('a', 0, 10), frame('b', 30, 46)];
    expect(stabilizePivots(frames)).toEqual(frames);
  });
});
