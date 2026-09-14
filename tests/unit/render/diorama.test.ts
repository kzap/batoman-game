import { describe, expect, it } from 'vitest';
import { CAMERA } from '@game/tuning';
import { backdropPlacement, cameraRange, SLOT_Z } from '@render/diorama';
import { LENS } from '@render/stage';
import { toUnits } from '@render/units';

const level1 = { width: 4224, height: 768, floorY: 64 };
const aspect = 1408 / 736;

/** Half-extent of the view at a plane `z`, in stage units. */
const halfView = (z: number, px: number): number => ((toUnits(px) / 2) * (LENS.distance - z)) / LENS.distance;

describe('cameraRange', () => {
  it('is where the CameraController can put the camera centre', () => {
    const r = cameraRange(level1);
    expect(r.minX).toBeCloseTo(toUnits(CAMERA.viewW / 2));
    expect(r.maxX).toBeCloseTo(toUnits(4224 - CAMERA.viewW / 2));
    expect(r.minY).toBeCloseTo(toUnits(CAMERA.viewH / 2));
    expect(r.maxY).toBeCloseTo(toUnits(768 - CAMERA.viewH / 2));
  });

  it('pins the centre when the level is smaller than the view', () => {
    const r = cameraRange({ width: 320, height: 200, floorY: 0 });
    expect(r.minX).toBe(r.maxX);
    expect(r.minY).toBe(r.maxY);
  });
});

describe('backdropPlacement', () => {
  it('the far layer covers the whole view from every camera position, with margin', () => {
    const p = backdropPlacement('far', level1, aspect);
    const r = cameraRange(level1);
    const hw = halfView(p.z, CAMERA.viewW);
    const hh = halfView(p.z, CAMERA.viewH);
    expect(p.z).toBe(SLOT_Z.far);
    expect(p.x - p.w / 2).toBeLessThan(r.minX - hw);
    expect(p.x + p.w / 2).toBeGreaterThan(r.maxX + hw);
    expect(p.y - p.h / 2).toBeLessThan(r.minY - hh);
    expect(p.y + p.h / 2).toBeGreaterThan(r.maxY + hh);
  });

  it('tiles the texture instead of stretching it: each repeat keeps the image aspect', () => {
    for (const slot of ['far', 'mid'] as const) {
      const p = backdropPlacement(slot, level1, aspect);
      expect((p.w / p.repeatX / p.h).toFixed(6)).toBe(aspect.toFixed(6));
      expect(p.repeatX).toBeGreaterThan(1);
    }
  });

  it('the mid layer stands just below the ground line when the camera rests on its lower bound', () => {
    const p = backdropPlacement('mid', level1, aspect);
    const r = cameraRange(level1);
    // Project the plane's bottom edge onto Z=0 as seen from a camera at minY.
    const grow = (LENS.distance - p.z) / LENS.distance;
    const apparentBottom = r.minY + (p.y - p.h / 2 - r.minY) / grow;
    expect(apparentBottom).toBeLessThan(toUnits(level1.floorY));
    expect(apparentBottom).toBeGreaterThan(toUnits(level1.floorY) - 1.5);
    // And it spans the horizontal camera travel.
    const hw = halfView(p.z, CAMERA.viewW);
    expect(p.x - p.w / 2).toBeLessThan(r.minX - hw);
    expect(p.x + p.w / 2).toBeGreaterThan(r.maxX + hw);
  });

  it('only the far layer mirrors its repeats (the town has readable signs)', () => {
    expect(backdropPlacement('far', level1, aspect).mirrored).toBe(true);
    expect(backdropPlacement('mid', level1, aspect).mirrored).toBe(false);
  });
});
