import { describe, expect, it } from 'vitest';
import { atlasesForLevel, categoryOf, sessionBytes, summarize, type LevelArt } from '../../../tools/validate/budget-report';
import type { FileEntry } from '../../../tools/validate/lib';

const file = (rel: string, size: number): FileEntry => ({ rel, size });

const level: LevelArt = {
  id: 'level-1',
  music: 'level-1',
  enemies: [{ type: 'patroller' }, { type: 'aswang' }],
  props: 'level-1-props',
  backdrops: ['sky', 'town'],
};

function dist(): FileEntry[] {
  return [
    file('index.html', 10),
    file('assets/index-aaa.js', 100),
    file('assets/index-aaa.css', 20),
    file('assets/three-bbb.js', 300),
    file('assets/three-bbb.js.map', 9_000),
    file('assets/editor-ccc.js', 40),
    file('assets/KTX2Loader-ddd.js', 50),
    file('assets/KTX2Loader-ddd.js.map', 500),
    file('assets/basis_transcoder-eee.js', 60),
    file('assets/basis_transcoder-eee.wasm', 70),
    file('assets/atlases/batoman.webp', 200),
    file('assets/atlases/batoman.json', 5),
    file('assets/atlases/level-1-props.webp', 80),
    file('assets/atlases/level-1-props.json', 4),
    file('assets/atlases/patroller.webp', 30),
    file('assets/atlases/patroller.json', 3),
    file('assets/atlases/drone.webp', 15),
    file('assets/atlases/drone.json', 2),
    file('assets/backdrops/level-1/sky.ktx2', 11),
    file('assets/backdrops/level-1/sky.webp', 7),
    file('assets/backdrops/level-1/sky.meta.json', 1),
    file('assets/backdrops/level-1/town.ktx2', 13),
    file('assets/backdrops/level-1/town.webp', 9),
    file('assets/backdrops/level-1/town.meta.json', 1),
    file('assets/level-1-fff.json', 6),
    file('assets/audio/level-1.ogg', 400),
  ];
}

describe('categoryOf', () => {
  it('splits the served tree and drops source maps', () => {
    expect(categoryOf('assets/app.js.map')).toBe('sourcemap');
    expect(categoryOf('assets/basis_transcoder-eee.wasm')).toBe('basisWasm');
    expect(categoryOf('assets/backdrops/level-1/sky.ktx2')).toBe('ktx2');
    expect(categoryOf('assets/atlases/batoman.webp')).toBe('webpAtlases');
    expect(categoryOf('assets/backdrops/level-1/sky.webp')).toBe('webpBackdrops');
    expect(categoryOf('assets/audio/level-1.ogg')).toBe('audio');
    expect(categoryOf('assets/level-1-fff.json')).toBe('levelJson');
    expect(categoryOf('index.html')).toBe('html');
    expect(categoryOf('assets/index-aaa.js')).toBe('code');
  });
});

describe('summarize', () => {
  it('sums categories to the served total and ranks files', () => {
    const summary = summarize(dist());
    expect(summary.sourcemaps).toBe(9_500);
    expect(summary.categories.reduce((n, c) => n + c.bytes, 0)).toBe(summary.served);
    expect(summary.served).toBe(dist().reduce((n, f) => n + f.size, 0) - 9_500);
    expect(summary.top[0]?.rel).toBe('assets/audio/level-1.ogg');
    expect(summary.largestImage?.rel).toBe('assets/atlases/batoman.webp');
    expect(summary.largestAudio?.size).toBe(400);
    expect(summary.code).toBe(100 + 20 + 300 + 40 + 50 + 60);
  });
});

describe('sessionBytes', () => {
  it('counts one backdrop format and the sheets that level spawns', () => {
    expect(atlasesForLevel(level)).toEqual(['batoman', 'drone', 'level-1-props', 'patroller']);
    const gpu = sessionBytes(dist(), level, 'ktx2');
    const soft = sessionBytes(dist(), level, 'webp');
    expect(gpu.missing).toEqual([]);
    expect(soft.missing).toEqual([]);
    expect(gpu.bytes - soft.bytes).toBe(50 + 60 + 70 + (11 - 7) + (13 - 9));
    expect(gpu.parts.find((p) => p.label === 'basis runtime')?.bytes).toBe(50 + 60 + 70);
    expect(soft.parts.some((p) => p.label === 'basis runtime')).toBe(false);
    expect(gpu.bytes).toBe(10 + 100 + 20 + 300 + 180 + 200 + 5 + 80 + 4 + 30 + 3 + 15 + 2 + 11 + 1 + 13 + 1 + 6 + 400);
  });

  it('skips backdrops when the level has no art block', () => {
    const grey: LevelArt = { id: 'level-3', music: 'level-2', enemies: [{ type: 'stealth' }], backdrops: [] };
    const session = sessionBytes(
      [...dist(), file('assets/atlases/unused.webp', 500), file('assets/audio/level-2.ogg', 8), file('assets/level-3-ggg.json', 4)],
      grey,
      'ktx2',
    );
    expect(session.missing).toEqual([]);
    expect(session.parts.some((p) => p.label.startsWith('backdrop'))).toBe(false);
    expect(session.parts.find((p) => p.label === 'music')?.bytes).toBe(8);
  });
});
