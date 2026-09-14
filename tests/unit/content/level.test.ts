import { describe, expect, it } from 'vitest';
import { levelProblems, parseLevel, type LevelJson } from '@content/level';

const base: LevelJson = {
  version: 1,
  id: 'test-1',
  name: 'Test',
  width: 640,
  height: 320,
  tileSize: 32,
  spawn: { x: 100, y: 32 },
  exit: { x: 600, y: 0, w: 40, h: 320 },
  solids: [{ x: 0, y: 0, w: 640, h: 32 }],
  oneWay: [{ x: 100, y: 96, w: 64, h: 8 }],
  movingSolids: [{ x: 300, y: 64, w: 64, h: 16, path: [{ x: 300, y: 64 }, { x: 400, y: 64 }], speed: 80, pause: 10 }],
  hazards: [{ x: 200, y: 32, w: 32, h: 16, kind: 'spikes' }],
  deathZones: [],
  checkpoints: [{ id: 1, x: 500, y: 32, w: 32, h: 64 }],
  enemies: [{ type: 'drone', x: 400, y: 32, patrolDistance: 100 }],
};

describe('levelProblems', () => {
  it('accepts a well-formed level', () => {
    expect(levelProblems(base)).toEqual([]);
    expect(parseLevel(base)).toBe(base);
  });

  it('rejects overlapping blocking geometry, out-of-bounds rects and a spawn inside a solid', () => {
    expect(levelProblems({ ...base, solids: [...base.solids, { x: 10, y: 10, w: 10, h: 10 }] })).toEqual([expect.stringMatching(/overlap/)]);
    expect(levelProblems({ ...base, oneWay: [{ x: 0, y: 16, w: 32, h: 8 }] })).toEqual([expect.stringMatching(/overlap/)]);
    expect(levelProblems({ ...base, hazards: [{ x: 630, y: 0, w: 32, h: 16, kind: 'spikes' }] })).toEqual([expect.stringMatching(/leaves the level bounds/)]);
    expect(levelProblems({ ...base, spawn: { x: 100, y: 10 } })).toEqual(['spawn is inside a solid']);
  });

  it('checks enumerations, ids and paths', () => {
    expect(levelProblems({ ...base, hazards: [{ ...base.hazards[0], kind: 'lava' }] })).toEqual([expect.stringMatching(/kind must be one of/)]);
    expect(levelProblems({ ...base, enemies: [{ type: 'boss', x: 1, y: 1 }] })).toEqual([expect.stringMatching(/type must be one of/)]);
    expect(levelProblems({ ...base, checkpoints: [...base.checkpoints, { id: 1, x: 10, y: 32, w: 8, h: 8 }] })).toEqual([expect.stringMatching(/duplicated/)]);
    expect(levelProblems({ ...base, movingSolids: [{ ...base.movingSolids[0], path: [{ x: 1, y: 1 }] }] })).toEqual([expect.stringMatching(/at least two points/)]);
    expect(levelProblems({ ...base, movingSolids: [{ ...base.movingSolids[0], speed: 0 }] })).toEqual([expect.stringMatching(/speed/)]);
  });

  it('fails fast on non-objects and bad dimensions', () => {
    expect(levelProblems(null)).toEqual(['level must be an object']);
    expect(levelProblems({ ...base, width: -1 })).toEqual([expect.stringMatching(/width and height/)]);
    expect(() => parseLevel({ ...base, id: 'Bad Id' }, 'x')).toThrow(/x: id must match/);
  });
});
