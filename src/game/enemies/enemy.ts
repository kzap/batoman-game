import { Body, type CollisionWorld } from '@core/sim/collision';
import { SIM_DT } from '@core/sim/clock';
import type { StateDef } from '@core/sim/fsm';
import type { EnemyType } from '@content/level';
import { Health } from '../health';
import { ENEMY } from '../tuning';

/** Poses the renderer maps to clips. `windup`, `rush`, `stunned` and `shift` are boss-only. */
export type EnemyPose = 'idle' | 'move' | 'shoot' | 'hurt' | 'death' | 'cloaked' | 'windup' | 'rush' | 'stunned' | 'shift';

export interface EnemySnapshot {
  readonly id: number;
  readonly type: EnemyType;
  /** Exact body position; feet at (x + w/2, y). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly facing: 1 | -1;
  readonly pose: EnemyPose;
  readonly hp: number;
  readonly maxHp: number;
  /** Cloaked enemies fade; 1 for everyone else. */
  readonly alpha: number;
  /** Ticks of hurt flash left; the renderer tints while positive. */
  readonly flash: number;
  /** Boss phase (1-based); undefined for regular enemies. */
  readonly phase?: number;
}

/** A shot an enemy asks the world to spawn; the world owns projectiles. */
export interface ShotRequest {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/** What the world exposes to enemy behaviour each tick. Enemies read the player; they never mutate it. */
export interface EnemyCtx {
  readonly cw: CollisionWorld;
  readonly player: { readonly body: Body; readonly dead: boolean };
  readonly tick: number;
  fire(shot: ShotRequest): void;
  /** Boss summons: spawn a regular enemy at a feet position. */
  summon(type: EnemyType, x: number, y: number): void;
  /** Live enemies of a type, for summon caps. */
  countAlive(type: EnemyType): number;
  /** Level width, for clamping flyers and rushes. */
  readonly levelWidth: number;
}

export interface EnemyStats {
  readonly width: number;
  readonly height: number;
  readonly hp: number;
  readonly hurtTicks: number;
  readonly deathTicks: number;
}

/** Stats every shooting enemy shares; the shoot and hurt states below read them. */
export interface ShooterStats {
  readonly shotWindupTicks: number;
  readonly shotCooldownTicks: number;
  readonly knockback: number;
}

/**
 * Common enemy state: a body, hit points, facing, the hurt and death timers,
 * and the hit rule. Behaviour lives in subclasses' FSMs. Ticks, never seconds.
 */
export abstract class Enemy {
  readonly body: Body;
  readonly health: Health;
  facing: 1 | -1 = -1;
  vx = 0;
  vy = 0;
  /** Ticks of hurt reaction left. */
  hurtTicks = 0;
  /** Ticks since death started; -1 while alive. */
  deathTicks = -1;
  /** Ticks until the next shot may start. */
  protected shotCooldown = 0;
  private fired = false;

  constructor(
    readonly id: number,
    readonly type: EnemyType,
    readonly stats: EnemyStats,
    x: number,
    y: number,
  ) {
    this.body = new Body(Math.round(x - stats.width / 2), Math.round(y), stats.width, stats.height);
    this.health = new Health(stats.hp, 0);
  }

  get alive(): boolean {
    return this.deathTicks < 0;
  }

  /** Death animation finished; the world drops the enemy. */
  get gone(): boolean {
    return this.deathTicks >= this.stats.deathTicks;
  }

  /** Can be shot and hurts on contact. Subclasses hide themselves (cloak) or shield themselves (phase shift). */
  get hittable(): boolean {
    return this.alive;
  }

  get alpha(): number {
    return 1;
  }

  get phase(): number | undefined {
    return undefined;
  }

  abstract get pose(): EnemyPose;

  /** One tick of behaviour, including the death countdown. */
  update(ctx: EnemyCtx): void {
    if (!this.alive) {
      this.deathTicks++;
      return;
    }
    if (this.hurtTicks > 0) this.hurtTicks--;
    this.behave(ctx);
  }

  protected abstract behave(ctx: EnemyCtx): void;

  /** Apply damage from a player shot. `dir` is the shot's travel direction. Returns the damage dealt (0 when ignored). */
  hit(damage: number, dir: 1 | -1, weakPoint = false): number {
    if (!this.hittable) return 0;
    const dealt = this.damageFor(damage, weakPoint);
    if (!this.health.hit(dealt)) return 0;
    if (this.health.alive) {
      this.hurtTicks = this.stats.hurtTicks;
      this.onHurt(dir);
    } else {
      this.deathTicks = 0;
      this.vx = 0;
      this.vy = 0;
    }
    return dealt;
  }

  /** Hook for damage rules (the boss doubles weak-point hits). */
  protected damageFor(damage: number, _weakPoint: boolean): number {
    return damage;
  }

  /** Hook for the hurt reaction (knockback, interrupting an attack). */
  protected onHurt(_dir: 1 | -1): void {}

  snapshot(): EnemySnapshot {
    const b = this.body;
    const s: EnemySnapshot = {
      id: this.id,
      type: this.type,
      x: b.exactX,
      y: b.exactY,
      w: b.w,
      h: b.h,
      facing: this.facing,
      pose: this.pose,
      hp: this.health.hp,
      maxHp: this.health.max,
      alpha: this.alpha,
      flash: this.hurtTicks,
    };
    const phase = this.phase;
    return phase === undefined ? s : { ...s, phase };
  }

  // ---- Shared movement helpers ------------------------------------------------

  /** Horizontal distance from this body's centre to the player's centre, signed toward the player. */
  protected toPlayer(ctx: EnemyCtx): number {
    return ctx.player.body.centerX - this.body.centerX;
  }

  protected facePlayer(ctx: EnemyCtx): void {
    this.facing = this.toPlayer(ctx) < 0 ? -1 : 1;
  }

  /** Gravity and vertical resolution for ground enemies. */
  protected fall(cw: CollisionWorld): void {
    this.vy = Math.max(-ENEMY.maxFall, this.vy - ENEMY.gravity * SIM_DT);
    cw.moveY(this.body, this.vy * SIM_DT, () => (this.vy = 0));
  }

  protected grounded(cw: CollisionWorld): boolean {
    return this.vy <= 0 && cw.groundUnder(this.body) !== null;
  }

  /** Is there floor under the leading edge one step ahead? Ground enemies turn at ledges. */
  protected ledgeAhead(cw: CollisionWorld, dir: 1 | -1, probe: number): boolean {
    const b = this.body;
    const x = dir > 0 ? b.right + probe : b.x - probe - 1;
    return cw.solidAt({ x, y: b.y - 1, w: 1, h: 1 }) === null;
  }

  /** Walk at `speed` in `dir`; returns true when a wall stopped the move. */
  protected walk(cw: CollisionWorld, dir: 1 | -1, speed: number): boolean {
    this.vx = dir * speed;
    return cw.moveX(this.body, this.vx * SIM_DT, () => (this.vx = 0));
  }

  /** A horizontal shot leaving the facing edge `muzzleY` above the feet. */
  protected levelShot(muzzleY: number, speed: number): ShotRequest {
    const b = this.body;
    return { x: this.facing > 0 ? b.right : b.x, y: b.y + muzzleY, vx: this.facing * speed, vy: 0 };
  }

  // ---- Shared states ----------------------------------------------------------

  /**
   * Stop, face the player, fire once `shotWindupTicks` in, hold the pose as long
   * again, then go to `next` with the cooldown armed. A hit interrupts into `hurt`.
   */
  protected shootState<S extends string>(t: ShooterStats, next: S, aim: (ctx: EnemyCtx) => ShotRequest): StateDef<S | 'hurt', EnemyCtx> {
    return {
      enter: (ctx) => {
        this.fired = false;
        this.vx = 0;
        this.facePlayer(ctx);
      },
      update: (ctx, ticks) => {
        if (this.hurtTicks > 0) return 'hurt';
        if (ticks === t.shotWindupTicks && !this.fired) {
          this.fired = true;
          ctx.fire(aim(ctx));
        }
        if (ticks >= t.shotWindupTicks * 2) {
          this.shotCooldown = t.shotCooldownTicks;
          return next;
        }
        return undefined;
      },
    };
  }

  /** Slide back with the knockback until the hurt timer runs out, then resume `next` with the cooldown restarted. */
  protected hurtState<S extends string>(t: ShooterStats, next: S): StateDef<S | 'hurt', EnemyCtx> {
    return {
      update: (ctx) => {
        ctx.cw.moveX(this.body, this.vx * SIM_DT, () => (this.vx = 0));
        this.vx *= ENEMY.knockbackDecay;
        if (this.hurtTicks > 0) return undefined;
        this.vx = 0;
        this.shotCooldown = t.shotCooldownTicks;
        return next;
      },
    };
  }

  /** The common hurt reaction for light enemies: a shove in the shot's direction. */
  protected shove(t: ShooterStats, dir: 1 | -1): void {
    this.vx = dir * t.knockback;
  }
}
