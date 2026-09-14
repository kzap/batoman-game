import { describe, expect, it } from 'vitest';
import { Rng } from '@core/sim/rng';
import { CameraController, type CameraTarget } from '@game/camera';
import { CAMERA } from '@game/tuning';

// Feet at y=300 so the camera is not resting on the bottom bound (viewH / 2 = 189).
const T = (over: Partial<CameraTarget> = {}): CameraTarget => ({ x: 1000, y: 300, facing: 1, moving: false, grounded: true, ...over });
const LEVEL = { w: 4224, h: 768 };
const cam = (start = { x: 1000, y: 300 }) => new CameraController(LEVEL.w, LEVEL.h, start);
const run = (c: CameraController, t: CameraTarget, n: number, rng = new Rng(1)) => {
  for (let i = 0; i < n; i++) c.update(t, rng);
};

describe('CameraController', () => {
  it('starts centred above the spawn and stays put inside the deadzone', () => {
    const c = cam();
    expect([c.x, c.y]).toEqual([1000, 300 + CAMERA.focusAboveFeet]);
    run(c, T({ x: 1000 + CAMERA.deadzoneX - 1 }), 60);
    expect(c.x).toBe(1000);
    run(c, T({ y: 300 + CAMERA.deadzoneY - 1 }), 60);
    expect(c.y).toBe(300 + CAMERA.focusAboveFeet);
  });

  it('follows a target outside the deadzone with smoothing and settles at the deadzone edge', () => {
    const c = cam();
    run(c, T({ x: 1300 }), 1);
    expect(c.x).toBeGreaterThan(1000);
    expect(c.x).toBeLessThan(1300 - CAMERA.deadzoneX);
    run(c, T({ x: 1300 }), 300);
    expect(c.x).toBeCloseTo(1300 - CAMERA.deadzoneX, 0);
  });

  it('leads a running player in the facing direction and eases back when they stop', () => {
    const c = cam();
    run(c, T({ moving: true, facing: 1 }), 600);
    expect(c.x).toBeCloseTo(1000 + CAMERA.lookAhead - CAMERA.deadzoneX, 0);
    run(c, T({ moving: true, facing: -1 }), 600);
    expect(c.x).toBeCloseTo(1000 - CAMERA.lookAhead + CAMERA.deadzoneX, 0);
  });

  it('ignores jumps below the air deadzone but follows a fall', () => {
    const c = cam();
    const settled = c.y;
    run(c, T({ y: 300 + 80, grounded: false }), 60); // a jump apex
    expect(c.y).toBe(settled);
    run(c, T({ y: 300 - 200, grounded: false }), 300); // falling far below
    expect(c.y).toBeLessThan(settled - 100);
  });

  it('clamps to the level bounds', () => {
    const c = cam({ x: 10, y: 0 });
    expect([c.x, c.y]).toEqual([CAMERA.viewW / 2, CAMERA.viewH / 2]);
    run(c, T({ x: LEVEL.w - 5, y: LEVEL.h }), 2000);
    expect(c.x).toBe(LEVEL.w - CAMERA.viewW / 2);
    expect(c.y).toBe(LEVEL.h - CAMERA.viewH / 2);
    const small = new CameraController(400, 200, { x: 0, y: 0 });
    expect([small.x, small.y]).toEqual([200, 100]);
  });

  it('shakes with a decaying amplitude, deterministically per seed, and snapTo recentres', () => {
    const a = cam();
    const b = cam();
    a.shake(10, 10);
    b.shake(10, 10);
    const ra = new Rng(3);
    const rb = new Rng(3);
    let maxEarly = 0;
    let maxLate = 0;
    for (let i = 0; i < 10; i++) {
      a.update(T(), ra);
      b.update(T(), rb);
      expect(a.snapshot()).toEqual(b.snapshot());
      const m = Math.abs(a.snapshot().shakeX);
      if (i < 3) maxEarly = Math.max(maxEarly, m);
      if (i >= 7) maxLate = Math.max(maxLate, m);
      expect(m).toBeLessThanOrEqual(10 * ((10 - i) / 10) + 1e-9);
    }
    expect(maxEarly).toBeGreaterThan(maxLate);
    a.update(T(), ra);
    expect(a.snapshot().shakeX).toBe(0);
    // A weaker shake never replaces a stronger one in progress; a stronger one does.
    a.shake(10, 10);
    a.shake(1, 1); // would be over after one tick if it had replaced the 10-tick shake
    a.update(T(), ra);
    a.update(T(), ra);
    expect(Math.abs(a.snapshot().shakeX) + Math.abs(a.snapshot().shakeY)).toBeGreaterThan(0);
    a.shake(50, 50);
    for (let i = 0; i < 20; i++) a.update(T(), ra);
    expect(Math.abs(a.snapshot().shakeX) + Math.abs(a.snapshot().shakeY)).toBeGreaterThan(0);
    a.snapTo(T({ x: 2000, y: 300 }));
    expect([a.x, a.y]).toEqual([2000, 300 + CAMERA.focusAboveFeet]);
  });
});
