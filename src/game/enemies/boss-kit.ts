import type { Rect } from '@content/level';
import { Enemy } from './enemy';

/**
 * Shared boss pieces for the Sigbin Unit, and for Manananggal-7 and Tikbalang-X
 * when those fights are built.
 *
 * A boss still owns its attack FSM. The kit is the part that is the same every
 * time: hp phases with one invulnerable shift, a weak-point rect, and the rule
 * for when a shot actually hurts. Manananggal-7 can drive PhaseGate from the
 * balcony half and use `exposedOnlyDamage` on the conduit. Tikbalang-X can use
 * the same damage rule for the stumble and `coreRect` for the visor.
 *
 * The ASWANG prototype uses PhaseGate, `coreRect` and `exposedMultiplier`. Its
 * states and timers are the ones in `boss.ts`; level-1 replays stay on the
 * committed fixture.
 */

/** A floor print or other non-body tell. The renderer draws these; the sim owns their lifetime. */
export interface BossTell {
  readonly kind: 'footprint';
  /** Level px. `x` is the centre of the print, `y` is the floor it sits on. */
  readonly x: number;
  readonly y: number;
  /** The way the print points. The Sigbin walks backward, so this opposes its travel. */
  readonly dir: 1 | -1;
  /** Ticks since the print was left. */
  readonly age: number;
  /** 1 when fresh, 0 at the end of its life. */
  readonly alpha: number;
}

/**
 * What the world reads off whichever boss the level placed. Species differ;
 * the bar, the exit and the weak-point mark do not.
 */
export abstract class BossUnit extends Enemy {
  /** HUD name, for example "SIGBIN UNIT". */
  abstract get label(): string;
  /** 1-based phase. Every boss has one; regular enemies do not. */
  abstract override get phase(): number;
  /** The fight has started and the exit stays shut. */
  abstract get engaged(): boolean;
  /** The weak point takes the punish hit this tick. */
  abstract get exposed(): boolean;
  /** Current FSM state, for tests and pose selection. */
  abstract get state(): string;
  /** Weak-point rect in level px. Shots that miss it are not core hits. */
  abstract weakPointRect(): Rect;
  /** Extra tells (footprints). None for a boss that does not leave any. */
  tells(): readonly BossTell[] {
    return [];
  }

  /**
   * A decoy left behind a warp. It is not a body, so shots never land on it.
   * Null when this boss is not showing one.
   */
  afterimage(): (Rect & { readonly alpha: number }) | null {
    return null;
  }
}

/**
 * Hp phases. Thresholds are the hp at which the next phase begins, one entry
 * per shift (phase 2, then phase 3, ...). `note` queues a shift when the
 * current threshold is crossed; `commit` advances exactly one phase, on the
 * tick the shift state is entered.
 */
export class PhaseGate {
  index = 0;
  pending = false;

  constructor(private readonly thresholds: readonly number[]) {}

  /** 1-based phase for the HUD. */
  get phase(): number {
    return this.index + 1;
  }

  note(hp: number): void {
    const next = this.thresholds[this.index];
    if (next !== undefined && hp <= next) this.pending = true;
  }

  commit(): void {
    this.pending = false;
    this.index += 1;
  }
}

/** Value for the current phase, clamped to the last entry so a later phase still has a number. */
export function phaseValue<T>(values: readonly T[], index: number): T {
  return values[Math.min(index, values.length - 1)]!;
}

/**
 * Any hit lands. A weak-point hit while `exposed` is multiplied. This is the
 * ASWANG stun: the body still takes the shot, the core takes more.
 */
export function exposedMultiplier(damage: number, exposed: boolean, weakPoint: boolean, multiplier: number): number {
  return exposed && weakPoint ? damage * multiplier : damage;
}

/**
 * Only a weak-point hit while `exposed` lands. Cloak, telegraph and the strike
 * itself deal nothing. This is the Sigbin punish window.
 */
export function exposedOnlyDamage(damage: number, exposed: boolean, weakPoint: boolean, multiplier: number): number {
  return exposed && weakPoint ? damage * multiplier : 0;
}

/** Weak-point rect from a feet-relative core. Width defaults to the body. */
export function coreRect(body: { x: number; y: number; w: number }, core: { y: number; h: number; w?: number }): Rect {
  const w = core.w ?? body.w;
  const x = core.w === undefined ? body.x : body.x + (body.w - w) / 2;
  return { x, y: body.y + core.y, w, h: core.h };
}

/**
 * Integer slide from `from` to `to` over `settleTicks`. Tick 0 is `from`;
 * tick `settleTicks` is `to`. Used so a core can drop from the spine into
 * the standing shot line without a float.
 */
export function dropCore(from: { y: number; h: number }, to: { y: number; h: number }, ticks: number, settleTicks: number): { y: number; h: number } {
  const t = Math.min(Math.max(ticks, 0), settleTicks);
  return {
    y: from.y + Math.floor(((to.y - from.y) * t) / settleTicks),
    h: from.h + Math.floor(((to.h - from.h) * t) / settleTicks),
  };
}

/**
 * Triangle wave in `[low, high]` over `period` ticks. Integer time, so two
 * replays shimmer the same; no `Math.random` and no `Math.sin`.
 */
export function shimmerAlpha(tick: number, period: number, low: number, high: number): number {
  const half = period / 2;
  const p = ((tick % period) + period) % period;
  const tri = p < half ? p / half : (period - p) / half;
  return low + (high - low) * tri;
}

/** A short trail of prints that fade after `life` ticks. */
export class FootprintTrail {
  private readonly prints: { x: number; y: number; dir: 1 | -1; age: number }[] = [];

  constructor(
    private readonly cap: number,
    private readonly life: number,
  ) {}

  /** Age every print and drop the ones that have lived out. Call once a tick. */
  age(): void {
    for (const p of this.prints) p.age++;
    while (this.prints.length > 0 && this.prints[0]!.age >= this.life) this.prints.shift();
  }

  add(x: number, y: number, dir: 1 | -1): void {
    this.prints.push({ x: Math.round(x), y: Math.round(y), dir, age: 0 });
    while (this.prints.length > this.cap) this.prints.shift();
  }

  snapshot(): BossTell[] {
    return this.prints.map((p) => ({
      kind: 'footprint' as const,
      x: p.x,
      y: p.y,
      dir: p.dir,
      age: p.age,
      alpha: 1 - p.age / this.life,
    }));
  }
}
