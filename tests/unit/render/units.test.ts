import { describe, expect, it } from 'vitest';
import { CAMERA } from '@game/tuning';
import { LENS } from '@render/stage';
import { PIXELS_PER_UNIT, rectCenter, toUnits } from '@render/units';

describe('sim pixels to stage units', () => {
  it('converts by the tile size', () => {
    expect(toUnits(64)).toBe(2);
    expect(rectCenter({ x: 32, y: 0, w: 64, h: 32 })).toEqual({ x: 2, y: 0.5 });
  });

  it('the simulated camera view matches what the lens shows at Z=0', () => {
    // Two definitions of the same thing must agree: the follow camera clamps to CAMERA.viewW/viewH in pixels,
    // the lens (FOV, distance) decides what is visible. Drift here would let the camera show outside the level.
    const visibleH = 2 * LENS.distance * Math.tan((LENS.fovDeg * Math.PI) / 360) * PIXELS_PER_UNIT;
    expect(Math.abs(visibleH - CAMERA.viewH) / CAMERA.viewH).toBeLessThan(0.01);
    expect(CAMERA.viewW / CAMERA.viewH).toBeCloseTo(16 / 9, 2);
  });
});
