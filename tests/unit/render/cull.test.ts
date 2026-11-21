import { describe, expect, it } from 'vitest';
import type { DecorJson } from '@content/level-art';
import { decorBatches } from '@render/batches';
import { backdropContentBand, backdropPlacement, backdropTiles } from '@render/diorama';

const level1 = { width: 4224, height: 768, floorY: 64 };
const aspect = 1408 / 736;

const decor = (partial: Partial<DecorJson> & Pick<DecorJson, 'prop' | 'x' | 'y'>): DecorJson => partial;

describe('decorBatches', () => {
  it('groups copies of one prop in one chunk into a single batch, and keeps flips apart', () => {
    const batches = decorBatches(
      [
        decor({ prop: 'can', x: 100, y: 64 }),
        decor({ prop: 'can', x: 140, y: 64, flip: true }),
        decor({ prop: 'can', x: 180, y: 64 }),
        decor({ prop: 'crate', x: 160, y: 64, layer: 'wall' }),
      ],
      672,
      378,
    );
    const cans = batches.find((b) => b.prop === 'can' && !b.flip);
    expect(cans?.instances.map((i) => i.x)).toEqual([100, 180]);
    expect(batches.find((b) => b.prop === 'can' && b.flip)?.instances).toHaveLength(1);
    expect(batches.find((b) => b.prop === 'crate')?.layer).toBe('wall');
  });

  it('splits a prop across chunks so a long level can drop off-screen draws', () => {
    const batches = decorBatches(
      [decor({ prop: 'can', x: 10, y: 0 }), decor({ prop: 'can', x: 2000, y: 0 }), decor({ prop: 'can', x: 2000, y: 800 })],
      672,
      378,
    );
    expect(batches).toHaveLength(3);
    expect(new Set(batches.map((b) => `${b.chunkX},${b.chunkY}`)).size).toBe(3);
  });

  it('draws wall batches before prop batches, and within a layer follows first appearance', () => {
    const batches = decorBatches(
      [
        decor({ prop: 'late', x: 10, y: 0, layer: 'prop' }),
        decor({ prop: 'wall', x: 10, y: 0, layer: 'wall' }),
        decor({ prop: 'early', x: 10, y: 0, layer: 'prop' }),
      ],
      672,
      378,
    );
    expect(batches.map((b) => b.prop)).toEqual(['wall', 'late', 'early']);
  });

  it('rejects a zero chunk', () => {
    expect(() => decorBatches([], 0, 10)).toThrow(/chunk/);
  });
});

describe('backdrop tiles and content band', () => {
  const far = backdropPlacement('far', level1, aspect);

  it('a full-image band leaves the plane where it was', () => {
    const band = backdropContentBand(far, 736, 0, 736);
    expect(band.h).toBeCloseTo(far.h);
    expect(band.y).toBeCloseTo(far.y);
    expect(band.offsetY).toBeCloseTo(0);
    expect(band.repeatY).toBeCloseTo(1);
  });

  it('the bottom half of the image becomes the bottom half of the plane', () => {
    const band = backdropContentBand(far, 100, 50, 50);
    expect(band.h).toBeCloseTo(far.h / 2);
    expect(band.y - band.h / 2).toBeCloseTo(far.y - far.h / 2);
    expect(band.offsetY).toBeCloseTo(0);
    expect(band.repeatY).toBeCloseTo(0.5);
  });

  it('tiles cover the plane exactly and their UVs tile the repeat', () => {
    const band = backdropContentBand(far, 736, 0, 736);
    const tiles = backdropTiles(far, far.w / 3.2, band);
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.reduce((n, t) => n + t.w, 0)).toBeCloseTo(far.w);
    const left = Math.min(...tiles.map((t) => t.x - t.w / 2));
    const right = Math.max(...tiles.map((t) => t.x + t.w / 2));
    expect(left).toBeCloseTo(far.x - far.w / 2);
    expect(right).toBeCloseTo(far.x + far.w / 2);
    const span = tiles.reduce((n, t) => n + t.repeatX, 0);
    expect(span).toBeCloseTo(far.repeatX);
    expect(tiles[0]?.offsetX).toBeCloseTo(0);
    expect(tiles[tiles.length - 1]!.offsetX + tiles[tiles.length - 1]!.repeatX).toBeCloseTo(far.repeatX);
  });

  it('an empty band produces no tiles', () => {
    expect(backdropTiles(far, 10, backdropContentBand(far, 100, 0, 0))).toEqual([]);
  });
});
