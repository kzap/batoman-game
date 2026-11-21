/**
 * Presentation-only motion and the colourblind-safe weak-point cue.
 * The sim still computes camera shake and stores it on the snapshot; callers
 * drop the offset when reduce-motion is on. Nothing here reads the World,
 * the DOM, or a clock, so replay fixtures stay bit-identical.
 */

/** Second channel besides magenta: a white diamond outline. Hue is not the only signal. */
export const WEAK_POINT_CUE = {
  shape: 'diamond',
  ring: 'white',
  ringHex: '#ffffff',
  fill: 'magenta',
  fillHex: '#ff2d78',
} as const;

export interface WeakPointCue {
  readonly shape: typeof WEAK_POINT_CUE.shape;
  readonly ring: typeof WEAK_POINT_CUE.ring;
  readonly pulsing: boolean;
}

/**
 * Visual tuning for motion that is not gameplay. Periods are sim ticks so a
 * given snapshot always shows the same pose. Gameplay numbers stay in `tuning.ts`.
 */
export const PRESENTATION = {
  weakPoint: {
    /** Steady fill opacity. The pulse adds and subtracts `pulse` when motion is allowed. */
    opacity: 0.55,
    pulse: 0.25,
    pulseTicks: 20,
    /** Fill scale breathes by this fraction. The white ring does not. */
    scalePulse: 0.12,
    /** Multiplier on half the weak-point height, in stage units. */
    scale: 1.6,
  },
  charge: { min: 0.15, max: 0.7, pulse: 0.1, pulsePeriodTicks: 12, offsetX: 6 },
  invuln: { halfPeriodTicks: 6, blinkOpacity: 0.45, steadyOpacity: 0.72 },
  /** A hurt flash that alternates this often is a strobe; reduce-motion holds `steadyTint` instead. */
  hurtFlash: { halfPeriodTicks: 3, steadyTint: 0xffffff },
  /** Vertical bob of an uncollected pickup, in sim pixels. The hitbox stays put. */
  pickup: { bobAmplitude: 3, bobPeriodTicks: 90 },
} as const;

/**
 * Diamond in local units, tip at +Y. The ring is the same four vertices, strictly
 * outside the fill, so the silhouette stays a diamond when the magenta fill is lost.
 */
export function weakPointDiamond(which: 'fill' | 'ring'): readonly [number, number][] {
  const y = which === 'ring' ? 1.22 : 1;
  const x = which === 'ring' ? 0.88 : 0.72;
  return [
    [0, y],
    [x, 0],
    [0, -y],
    [-x, 0],
  ];
}

const sine = (tick: number, period: number): number => Math.sin((tick / period) * Math.PI * 2);

export interface WeakPointLook extends WeakPointCue {
  readonly fillOpacity: number;
  readonly fillScale: number;
}

/** How the exposed core is drawn this tick. The ring is not part of the pulse. */
export function weakPointLook(tick: number, reduceMotion: boolean): WeakPointLook {
  const p = PRESENTATION.weakPoint;
  const wave = reduceMotion ? 0 : sine(tick, p.pulseTicks);
  return {
    shape: WEAK_POINT_CUE.shape,
    ring: WEAK_POINT_CUE.ring,
    pulsing: !reduceMotion,
    fillOpacity: p.opacity + p.pulse * wave,
    fillScale: 1 + p.scalePulse * wave,
  };
}

/** Shake offset the camera should add. The snapshot's own shake is left alone. */
export function presentedShake(shakeX: number, shakeY: number, reduceMotion: boolean): { readonly x: number; readonly y: number } {
  return reduceMotion ? { x: 0, y: 0 } : { x: shakeX, y: shakeY };
}

/** Camera centre in sim pixels after the presentation policy. */
export function presentedCamera(x: number, y: number, shakeX: number, shakeY: number, reduceMotion: boolean): { readonly x: number; readonly y: number } {
  const s = presentedShake(shakeX, shakeY, reduceMotion);
  return { x: x + s.x, y: y + s.y };
}

/** Film-grain opacity. `base` is the post stack's tuned value (`POST_TUNING.grainOpacity`). */
export function presentedGrainOpacity(base: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : base;
}

/** Pickup bob in sim pixels. Reduce-motion holds the quad on its hitbox. */
export function pickupBob(tick: number, reduceMotion: boolean): number {
  if (reduceMotion) return 0;
  const p = PRESENTATION.pickup;
  return sine(tick, p.bobPeriodTicks) * p.bobAmplitude;
}

/** Muzzle-glow scale. The pulse is decorative; the charge amount still grows the glow. */
export function chargeGlowScale(charge: number, tick: number, reduceMotion: boolean): number {
  const c = PRESENTATION.charge;
  const base = c.min + (c.max - c.min) * charge;
  if (reduceMotion) return base;
  return base * (1 + c.pulse * sine(tick, c.pulsePeriodTicks));
}

/** Player opacity while invulnerable. Reduce-motion holds a steady dim instead of blinking. */
export function invulnOpacity(invulnerable: boolean, tick: number, reduceMotion: boolean): number {
  if (!invulnerable) return 1;
  const i = PRESENTATION.invuln;
  if (reduceMotion) return i.steadyOpacity;
  return Math.floor(tick / i.halfPeriodTicks) % 2 === 0 ? i.blinkOpacity : 1;
}

/**
 * Enemy tint while `hurt`. Reduce-motion holds white for the whole flash window
 * so the hit still reads, without a magenta strobe.
 */
export function enemyHurtTint(hurt: boolean, tick: number, reduceMotion: boolean, base: number, flash: number): number {
  if (!hurt) return base;
  if (reduceMotion) return PRESENTATION.hurtFlash.steadyTint;
  const on = Math.floor(tick / PRESENTATION.hurtFlash.halfPeriodTicks) % 2 === 0;
  return on ? flash : base;
}
