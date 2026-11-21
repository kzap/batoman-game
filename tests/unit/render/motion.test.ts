import { describe, expect, it } from 'vitest';
import {
  PRESENTATION,
  WEAK_POINT_CUE,
  chargeGlowScale,
  enemyHurtTint,
  invulnOpacity,
  presentedCamera,
  presentedGrainOpacity,
  presentedShake,
  weakPointDiamond,
  weakPointLook,
} from '@render/motion';

/** `|x|/rx + |y|/ry <= 1` against one of the two diamonds. */
function inside(px: number, py: number, which: 'fill' | 'ring'): boolean {
  const diamond = weakPointDiamond(which);
  const rx = diamond[1]![0];
  const ry = diamond[0]![1];
  return Math.abs(px) / rx + Math.abs(py) / ry <= 1 + 1e-9;
}

describe('weak-point cue', () => {
  it('is a diamond with a white ring, and the ring strictly contains the fill', () => {
    expect(WEAK_POINT_CUE).toMatchObject({ shape: 'diamond', ring: 'white', ringHex: '#ffffff', fill: 'magenta', fillHex: '#ff2d78' });
    const fill = weakPointDiamond('fill');
    const ring = weakPointDiamond('ring');
    expect(fill).toHaveLength(4);
    expect(ring).toHaveLength(4);
    for (const [x, y] of fill) expect(inside(x, y, 'ring')).toBe(true);
    // The ring vertices sit outside the fill, so the outline is a second shape, not a recolour of the same disc.
    const [tip, side] = ring;
    expect(inside(tip![0], tip![1], 'fill')).toBe(false);
    expect(Math.abs(side![0])).toBeGreaterThan(Math.abs(fill[1]![0]));
  });

  it('pulses the fill and holds the cue identity when motion is allowed', () => {
    const open = weakPointLook(5, false);
    const closed = weakPointLook(15, false);
    expect(open).toMatchObject({ shape: 'diamond', ring: 'white', pulsing: true });
    expect(open.fillOpacity).toBeCloseTo(PRESENTATION.weakPoint.opacity + PRESENTATION.weakPoint.pulse);
    expect(open.fillScale).toBeCloseTo(1 + PRESENTATION.weakPoint.scalePulse);
    expect(closed.fillOpacity).toBeCloseTo(PRESENTATION.weakPoint.opacity - PRESENTATION.weakPoint.pulse);
    expect(closed.fillScale).toBeLessThan(1);
    expect(open.fillOpacity).not.toBeCloseTo(closed.fillOpacity);
  });

  it('holds a steady diamond when reduce-motion is on', () => {
    for (const tick of [0, 5, 15, 40]) {
      const look = weakPointLook(tick, true);
      expect(look).toMatchObject({ shape: 'diamond', ring: 'white', pulsing: false, fillScale: 1 });
      expect(look.fillOpacity).toBe(PRESENTATION.weakPoint.opacity);
    }
  });
});

describe('reduce-motion presentation', () => {
  it('drops camera shake without changing the centre the sim asked for', () => {
    expect(presentedShake(6, -2, false)).toEqual({ x: 6, y: -2 });
    expect(presentedShake(6, -2, true)).toEqual({ x: 0, y: 0 });
    expect(presentedCamera(100, 50, 6, -2, false)).toEqual({ x: 106, y: 48 });
    expect(presentedCamera(100, 50, 6, -2, true)).toEqual({ x: 100, y: 50 });
  });

  it('zeros film grain and steadies decorative pulse and strobes', () => {
    expect(presentedGrainOpacity(0.35, false)).toBe(0.35);
    expect(presentedGrainOpacity(0.35, true)).toBe(0);

    const full = chargeGlowScale(1, 3, false);
    const steady = chargeGlowScale(1, 3, true);
    expect(full).toBeCloseTo(PRESENTATION.charge.max * (1 + PRESENTATION.charge.pulse));
    expect(steady).toBe(PRESENTATION.charge.max);
    expect(chargeGlowScale(1, 0, true)).toBe(steady);
    expect(chargeGlowScale(0, 3, true)).toBe(PRESENTATION.charge.min);

    expect(invulnOpacity(false, 0, true)).toBe(1);
    expect(invulnOpacity(true, 0, false)).toBe(PRESENTATION.invuln.blinkOpacity);
    expect(invulnOpacity(true, PRESENTATION.invuln.halfPeriodTicks, false)).toBe(1);
    expect(invulnOpacity(true, 0, true)).toBe(PRESENTATION.invuln.steadyOpacity);
    expect(invulnOpacity(true, 6, true)).toBe(PRESENTATION.invuln.steadyOpacity);

    const base = 0x88ffaa;
    const flash = 0xff2d78;
    expect(enemyHurtTint(false, 0, true, base, flash)).toBe(base);
    expect(enemyHurtTint(true, 0, false, base, flash)).toBe(flash);
    expect(enemyHurtTint(true, PRESENTATION.hurtFlash.halfPeriodTicks, false, base, flash)).toBe(base);
    expect(enemyHurtTint(true, 0, true, base, flash)).toBe(PRESENTATION.hurtFlash.steadyTint);
    expect(enemyHurtTint(true, 3, true, base, flash)).toBe(PRESENTATION.hurtFlash.steadyTint);
  });
});
