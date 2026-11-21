import { SIM_DT } from '@core/sim/clock';
import { Fsm } from '@core/sim/fsm';
import { SIGBIN } from '../tuning';
import { BossUnit, FootprintTrail, PhaseGate, coreRect, dropCore, exposedOnlyDamage, phaseValue, shimmerAlpha, type BossTell } from './boss-kit';
import type { EnemyCtx, EnemyPose } from './enemy';

type State = 'dormant' | 'cloak' | 'telegraph' | 'lunge' | 'recover' | 'shift';

/**
 * Level 3 boss: the Sigbin Unit, a cloaked hunter. It is dormant until the
 * player reaches the gallery, then backs off along its own side of them, walking
 * backward (head opposite its travel, footprints pointing the wrong way). A
 * telegraph decloaks it and it steps in to lunge range, then lunges. A player
 * who stands in the pocket is hit; one who leaves during the tell is not. The
 * dorsal core then drops into the standing shot line. Shots deal damage only
 * on that chest-sized core, and only while the window is open. It does not fly
 * and it does not move the room. Three phases, each one faster, with an
 * invulnerable shift between them.
 */
export class Sigbin extends BossUnit {
  private readonly phases = new PhaseGate(SIGBIN.phaseHp);
  private readonly prints = new FootprintTrail(SIGBIN.footprintCap, SIGBIN.footprintLife);
  private lungeDir: 1 | -1 = -1;
  /** Pocket committed when the stalk starts, on the boss's side of the player. */
  private rear = 0;
  private rearCommitted = false;
  /** Ticks the fight has been going, for the cloak shimmer. */
  private age = 0;
  /** Steps taken while cloaked, so footprints are evenly spaced. */
  private stepTick = 0;
  private readonly fsm = new Fsm<State, EnemyCtx>(
    {
      dormant: {
        update: (ctx) => {
          // Head points away from the player: the thing in the dark is already facing the wrong way.
          this.facing = this.toPlayer(ctx) < 0 ? 1 : -1;
          if (ctx.player.dead) return undefined;
          const near = Math.abs(this.toPlayer(ctx)) <= SIGBIN.engageRange && this.sameStorey(ctx, SIGBIN.sightHeight);
          return near ? 'cloak' : undefined;
        },
      },
      cloak: {
        enter: () => {
          this.vx = 0;
          this.rearCommitted = false;
        },
        update: (ctx, ticks) => {
          if (this.phases.pending) return 'shift';
          // The pocket stays fixed for this stalk. It is read on the first step, from where the player actually is.
          if (!this.rearCommitted) {
            this.rear = this.rearX(ctx);
            this.rearCommitted = true;
          }
          const dx = this.rear - this.body.centerX;
          const arrived = Math.abs(dx) <= SIGBIN.rearSlack;
          const giveUp = ticks >= phaseValue(SIGBIN.stalkMaxTicks, this.phases.index);
          if (arrived || giveUp) return 'telegraph';
          const dir: 1 | -1 = dx < 0 ? -1 : 1;
          // Backward walk: the head points opposite the step. The prints record that facing.
          this.facing = dir === -1 ? 1 : -1;
          if (!this.grounded(ctx.cw)) return undefined;
          const blocked = this.ledgeAhead(ctx.cw, dir, SIGBIN.stalkProbe) || this.walk(ctx.cw, dir, phaseValue(SIGBIN.stalkSpeed, this.phases.index));
          if (blocked) return 'telegraph';
          this.stepTick++;
          if (this.stepTick % SIGBIN.footprintEvery === 1) this.prints.add(this.body.centerX, this.body.y, this.facing);
          return undefined;
        },
      },
      telegraph: {
        enter: (ctx) => {
          this.vx = 0;
          this.lungeDir = this.toPlayer(ctx) < 0 ? -1 : 1;
          this.facing = this.lungeDir;
        },
        update: (ctx, ticks) => {
          if (this.phases.pending) return 'shift';
          // Close from the pocket to lunge range. A still player is caught; running away during the tell is not.
          const dist = Math.abs(this.toPlayer(ctx));
          if (dist > SIGBIN.strikeRange && this.grounded(ctx.cw)) {
            const dir: 1 | -1 = this.toPlayer(ctx) < 0 ? -1 : 1;
            this.lungeDir = dir;
            this.facing = dir;
            if (!this.ledgeAhead(ctx.cw, dir, SIGBIN.approachSpeed * SIM_DT)) this.walk(ctx.cw, dir, SIGBIN.approachSpeed);
          } else this.vx = 0;
          return ticks >= phaseValue(SIGBIN.telegraphTicks, this.phases.index) ? 'lunge' : undefined;
        },
      },
      lunge: {
        update: (ctx, ticks) => {
          if (!this.grounded(ctx.cw)) return 'recover';
          // Leave before this tick's step so the dash is exactly `lungeTicks` long.
          if (ticks >= SIGBIN.lungeTicks) return 'recover';
          // A ledge or a wall ends the strike early. The recovery, not the strike, is when it can be hurt.
          if (this.ledgeAhead(ctx.cw, this.lungeDir, SIGBIN.lungeSpeed * SIM_DT)) return 'recover';
          const hitWall = this.walk(ctx.cw, this.lungeDir, SIGBIN.lungeSpeed);
          return hitWall ? 'recover' : undefined;
        },
      },
      recover: {
        enter: () => {
          this.vx = 0;
        },
        update: (_ctx, ticks) => {
          if (this.phases.pending) return 'shift';
          return ticks >= phaseValue(SIGBIN.exposedTicks, this.phases.index) ? 'cloak' : undefined;
        },
      },
      shift: {
        enter: () => {
          this.phases.commit();
          this.vx = 0;
        },
        update: (_ctx, ticks) => (ticks >= SIGBIN.phaseShiftTicks ? 'cloak' : undefined),
      },
    },
    'dormant',
  );

  constructor(id: number, x: number, y: number) {
    super(id, 'sigbin', SIGBIN, x, y);
  }

  get label(): string {
    return SIGBIN.label;
  }

  override get phase(): number {
    return this.phases.phase;
  }

  get engaged(): boolean {
    return this.fsm.state !== 'dormant';
  }

  /** The core is open for the whole recovery, including the ticks it spends dropping into reach. */
  get exposed(): boolean {
    return this.alive && this.fsm.state === 'recover';
  }

  override get hittable(): boolean {
    // Shots can land during the lunge and the recovery. The lunge still deals 0:
    // damageFor requires the core to be open. Cloak, telegraph and shift are not shot-hittable.
    return this.alive && (this.fsm.state === 'lunge' || this.fsm.state === 'recover');
  }

  /** The lunge is the only contact attack. Recovery is the punish window, not a second hit. */
  override get harmsOnContact(): boolean {
    return this.alive && this.fsm.state === 'lunge';
  }

  override get alpha(): number {
    if (!this.alive) return 1;
    const shimmer = shimmerAlpha(this.age, SIGBIN.shimmerPeriod, SIGBIN.cloakedAlpha, SIGBIN.shimmerAlpha);
    switch (this.fsm.state) {
      case 'dormant':
      case 'cloak':
        return shimmer;
      case 'telegraph': {
        const n = phaseValue(SIGBIN.telegraphTicks, this.phases.index);
        const u = n === 0 ? 1 : Math.min(1, this.fsm.ticks / n);
        return shimmer + (1 - shimmer) * u;
      }
      case 'shift':
        return 1;
      default:
        return 1;
    }
  }

  protected override damageFor(damage: number, weakPoint: boolean): number {
    return exposedOnlyDamage(damage, this.exposed, weakPoint, SIGBIN.weakPointMultiplier);
  }

  weakPointRect(): { x: number; y: number; w: number; h: number } {
    const dropped = this.fsm.state === 'recover' ? dropCore(SIGBIN.weakPointRaised, SIGBIN.weakPoint, this.fsm.ticks, SIGBIN.coreSettleTicks) : SIGBIN.weakPointRaised;
    return coreRect(this.body, dropped);
  }

  override tells(): readonly BossTell[] {
    return this.prints.snapshot();
  }

  get pose(): EnemyPose {
    if (!this.alive) return 'death';
    switch (this.fsm.state) {
      case 'dormant':
        return 'cloaked';
      case 'cloak':
        return this.vx !== 0 ? 'move' : 'cloaked';
      case 'telegraph':
        return 'windup';
      case 'lunge':
        return 'rush';
      case 'recover':
        return 'stunned';
      case 'shift':
        return 'shift';
    }
  }

  get state(): State {
    return this.fsm.state;
  }

  protected behave(ctx: EnemyCtx): void {
    this.age++;
    this.prints.age();
    this.fsm.update(ctx);
    this.fall(ctx.cw);
  }

  protected override onHurt(): void {
    // No knockback: it is too heavy, and a slide would move the core under the shot.
    this.phases.note(this.health.hp);
  }

  /** The pocket on the boss's side of the player. It backs off there, then lunges toward them. */
  private rearX(ctx: EnemyCtx): number {
    const side: 1 | -1 = this.body.centerX >= ctx.player.body.centerX ? 1 : -1;
    return ctx.player.body.centerX + side * SIGBIN.rearOffset;
  }
}
