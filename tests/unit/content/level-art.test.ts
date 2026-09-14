import { describe, expect, it } from 'vitest';
import { levelProblems } from '@content/level';
import { levelArtProblems, levelArtReferenceProblems, type LevelArtJson } from '@content/level-art';

const dims = { width: 640, height: 320 };

const art: LevelArtJson = {
  props: 'level-1-props',
  backdrops: { far: 'sky', mid: 'town' },
  decor: [
    { prop: 'platform_long_a', x: 228, y: -5, w: 455 },
    { prop: 'wall_rust_c', x: 100, y: 60, layer: 'wall' },
    { prop: 'can', x: 330, y: 32, flip: true },
  ],
};

describe('levelArtProblems', () => {
  it('accepts a well-formed art block', () => {
    expect(levelArtProblems(art, dims)).toEqual([]);
  });

  it('checks names, slots, layers and numeric fields', () => {
    expect(levelArtProblems({ ...art, props: 'Level 1' }, dims)).toEqual([expect.stringMatching(/art\.props/)]);
    expect(levelArtProblems({ ...art, backdrops: { near: 'x' } }, dims)).toEqual([expect.stringMatching(/slot must be one of/)]);
    expect(levelArtProblems({ ...art, decor: [{ prop: 'can', x: 1.5, y: 0 }] }, dims)).toEqual([expect.stringMatching(/integers/)]);
    expect(levelArtProblems({ ...art, decor: [{ prop: 'can', x: 0, y: 0, w: 0 }] }, dims)).toEqual([expect.stringMatching(/\.w must be a positive integer/)]);
    expect(levelArtProblems({ ...art, decor: [{ prop: 'can', x: 0, y: 0, layer: 'sky' }] }, dims)).toEqual([expect.stringMatching(/layer must be one of/)]);
    expect(levelArtProblems({ ...art, decor: [{ prop: 'can', x: 0, y: 0, flip: 1 }] }, dims)).toEqual([expect.stringMatching(/flip/)]);
    expect(levelArtProblems({ ...art, decor: [{ x: 0, y: 0 }] }, dims)).toEqual([expect.stringMatching(/prop is required/)]);
  });

  it('allows decor a little outside the level (floor boards hang below y = 0) but not far away', () => {
    expect(levelArtProblems({ ...art, decor: [{ prop: 'can', x: -100, y: -50 }] }, dims)).toEqual([]);
    expect(levelArtProblems({ ...art, decor: [{ prop: 'can', x: 5000, y: 0 }] }, dims)).toEqual([expect.stringMatching(/far outside/)]);
  });

  it('is run by levelProblems when a level has an art block', () => {
    const level = {
      version: 1,
      id: 'x',
      name: 'X',
      width: 640,
      height: 320,
      tileSize: 32,
      spawn: { x: 10, y: 32 },
      exit: { x: 600, y: 0, w: 40, h: 320 },
      solids: [{ x: 0, y: 0, w: 640, h: 32 }],
      oneWay: [],
      movingSolids: [{ x: 300, y: 64, w: 64, h: 16, path: [{ x: 300, y: 64 }, { x: 400, y: 64 }], speed: 80, prop: '' }],
      hazards: [],
      deathZones: [],
      checkpoints: [],
      enemies: [],
      art: { ...art, decor: 'none' },
    };
    expect(levelProblems(level)).toEqual([expect.stringMatching(/movingSolids\[0\]\.prop/), 'art.decor must be an array']);
  });
});

describe('levelArtReferenceProblems', () => {
  const frames = new Set(['platform_long_a', 'wall_rust_c', 'can', 'platform_low_a']);
  const files = new Set(['sky', 'town']);

  it('passes when every prop and backdrop resolves', () => {
    expect(levelArtReferenceProblems(art, ['platform_low_a', undefined], frames, files)).toEqual([]);
  });

  it('names the missing frame or file', () => {
    expect(levelArtReferenceProblems({ ...art, decor: [{ prop: 'crate', x: 0, y: 0 }] }, [], frames, files)).toEqual([expect.stringMatching(/"crate" is not a frame/)]);
    expect(levelArtReferenceProblems(art, ['lift'], frames, files)).toEqual([expect.stringMatching(/movingSolids\[0\]\.prop "lift"/)]);
    expect(levelArtReferenceProblems({ ...art, backdrops: { far: 'clouds' } }, [], frames, files)).toEqual([expect.stringMatching(/art\.backdrops\.far "clouds"/)]);
  });
});
