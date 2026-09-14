import { describe, expect, it } from 'vitest';
import { levelProblems } from '../../../src/content/level';
import { convertTiled, dropToGround, mergeTiles } from '../from-tiled';

const grid = (rows: string[]): boolean[] => rows.flatMap((r) => [...r].map((c) => c === '#'));

describe('mergeTiles', () => {
  it('merges runs into rectangles that cover every tile exactly once', () => {
    const rows = ['..###.', '..###.', '######', '......'];
    const rects = mergeTiles(grid(rows), 6, 4);
    expect(rects).toEqual([
      { x: 2, y: 0, w: 3, h: 3 },
      { x: 0, y: 2, w: 2, h: 1 },
      { x: 5, y: 2, w: 1, h: 1 },
    ]);
    const covered = new Set<string>();
    for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) covered.add(`${x},${y}`);
    expect(covered.size).toBe(rows.join('').split('#').length - 1);
  });
});

describe('convertTiled', () => {
  const map = {
    width: 6,
    height: 4,
    tilewidth: 32,
    tileheight: 32,
    layers: [
      { type: 'tilelayer' as const, name: 'platforms', data: grid(['......', '..##..', '......', '######']).map((b) => (b ? 7 : 0)) },
      {
        type: 'objectgroup' as const,
        name: 'spawns',
        objects: [
          { type: 'enemy', x: 64, y: 96, width: 32, height: 32, properties: [{ name: 'enemyType', value: 'drone' }, { name: 'patrolDistance', value: 50 }] },
          { type: 'checkpoint', x: 128, y: 64, width: 32, height: 32, properties: [{ name: 'id', value: 3 }] },
          { type: 'death-zone', x: 0, y: 140, width: 192, height: 64 },
        ],
      },
    ],
  };

  it('flips Y, converts tiles to pixel rects, and carries spawns over', () => {
    const level = convertTiled(map, 'test-1', 'Test');
    expect(level.width).toBe(192);
    expect(level.height).toBe(128);
    expect(level.solids).toEqual([
      { x: 64, y: 64, w: 64, h: 32 },
      { x: 0, y: 0, w: 192, h: 32 },
    ]);
    expect(level.enemies).toEqual([{ type: 'drone', x: 64, y: 32, patrolDistance: 50 }]);
    expect(level.checkpoints).toEqual([{ id: 3, x: 128, y: 32, w: 32, h: 32 }]);
    expect(level.deathZones).toEqual([]); // below the map: dropped
    expect(dropToGround(level, 100)).toBe(96);
    expect(levelProblems({ ...level, spawn: { x: 10, y: 32 } })).toEqual([]);
  });
});
