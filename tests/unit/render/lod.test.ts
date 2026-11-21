import { describe, expect, it } from 'vitest';
import { CAMERA } from '@game/tuning';
import { backdropPlacement } from '@render/diorama';
import { FAR_LOD, farLodDimensions, farVisibleFraction } from '@render/far-lod';
import { LAYER_Z, LENS } from '@render/stage';
import { toUnits } from '@render/units';

const level1 = { width: 6400, height: 768, floorY: 64 };

describe('far-layer LOD', () => {
  it('uses the same camera and margin as the backdrop placement', () => {
    expect(FAR_LOD.lensDistance).toBe(LENS.distance);
    expect(FAR_LOD.farZ).toBe(LAYER_Z.farStructures);
    expect(FAR_LOD.viewW).toBe(CAMERA.viewW);
    expect(FAR_LOD.viewH).toBe(CAMERA.viewH);
    const p = backdropPlacement('far', level1, 1408 / 736);
    const grow = (LENS.distance - p.z) / LENS.distance;
    const viewH = toUnits(CAMERA.viewH) * grow;
    expect(farVisibleFraction(level1.width, level1.height).y).toBeCloseTo(viewH / p.h);
  });

  it('decimates a far texture that is finer than two screen pixels, and never upscales', () => {
    const lod = farLodDimensions(1408, 736, level1.width, level1.height);
    expect(lod.width).toBeLessThan(1408);
    expect(lod.height).toBeLessThan(736);
    expect(lod.width % 4).toBe(0);
    expect(lod.height % 4).toBe(0);
    // A tiny source is already coarser than the target.
    expect(farLodDimensions(64, 32, level1.width, level1.height)).toEqual({ width: 64, height: 32 });
  });

  it('reduces the taller level 4 skyline by more than the level 1 sky', () => {
    const a = farLodDimensions(1408, 736, 6400, 768);
    const b = farLodDimensions(2816, 1536, 1600, 1664);
    expect(b.height / 1536).toBeLessThan(a.height / 736);
  });
});
