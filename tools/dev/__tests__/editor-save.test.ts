import { describe, expect, it } from 'vitest';
import { saveLevel, type SaveIo } from '../editor-save';

const level = {
  version: 1,
  id: 'level-9',
  name: 'Nine',
  width: 640,
  height: 320,
  tileSize: 32,
  spawn: { x: 100, y: 64 },
  exit: { x: 576, y: 0, w: 64, h: 320 },
  solids: [{ x: 0, y: 0, w: 640, h: 64 }],
  oneWay: [],
  movingSolids: [],
  hazards: [],
  deathZones: [],
  checkpoints: [],
  enemies: [],
};

function io(overrides: Partial<SaveIo> = {}): SaveIo & { written: { path: string; text: string }[] } {
  const written: { path: string; text: string }[] = [];
  return {
    root: '/repo',
    manifestIds: () => ['level-1', 'level-9'],
    write: (path, text) => written.push({ path, text }),
    artReferences: () => [],
    written,
    ...overrides,
  };
}

describe('saveLevel', () => {
  it('writes a formatted file for a valid level listed in the manifest', () => {
    const w = io();
    const r = saveLevel('level-9', JSON.stringify(level), w);
    expect(r.status).toBe(200);
    expect(w.written[0]!.path).toBe('/repo/src/content/levels/level-9.json');
    expect(w.written[0]!.text).toContain('"solids": [\n    { "x": 0, "y": 0, "w": 640, "h": 64 }\n  ]');
    expect(JSON.parse(w.written[0]!.text)).toEqual(level);
  });

  it('rejects ids outside the manifest, bad ids, and non-JSON bodies without writing', () => {
    const w = io();
    expect(saveLevel('level-2', JSON.stringify(level), w).status).toBe(404);
    expect(saveLevel('../etc', JSON.stringify(level), w).status).toBe(400);
    expect(saveLevel('level-9', '{oops', w).status).toBe(400);
    expect(w.written).toEqual([]);
  });

  it('returns 422 with the validator problems, including a URL/id mismatch and art references', () => {
    const w = io({ artReferences: () => ['art.decor[0].prop "x" is not a frame in atlas props'] });
    const bad = saveLevel('level-9', JSON.stringify({ ...level, spawn: { x: 10, y: 10 } }), w);
    expect(bad.status).toBe(422);
    expect(bad.body.problems!.some((p) => /spawn/.test(p))).toBe(true);
    const mismatch = saveLevel('level-1', JSON.stringify(level), w);
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.problems![0]).toMatch(/does not match URL id/);
    const art = saveLevel('level-9', JSON.stringify(level), w);
    expect(art.status).toBe(422);
    expect(art.body.problems![0]).toMatch(/not a frame/);
    expect(w.written).toEqual([]);
  });
});
