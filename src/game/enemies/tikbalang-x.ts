import { Fsm } from '@core/sim/fsm';
import type { Rect } from '@content/level';
import { TIKBALANG_X } from '../tuning';
import { BossUnit, PhaseGate, coreRect, exposedOnlyDamage, phaseValue } from './boss-kit';
import type { EnemyCtx, EnemyPose } from './enemy';

type State = 'dormant' | 'runWindup' | 'run' | 'shotWindup' | 'warpWindup' | 'warp' | 'stumble' | 'shift';

const T = TIKBALANG_X;

/**
 * Level 6 boss. The scout in `tikbalang.ts` is a different actor. This one
 * runs a fixed span, fires one straight shot, then warps. The afterimage is
 * not a body. Damage lands only on the core during the stumble.
 */
export class TikbalangX extends BossUnit {
  private readonly phases = new PhaseGate(T.phaseHp);
  private readonly left: number;
  private readonly right: number;
  private goal: number;
  private ghost: Rect | null = null;
  private shotSent = false;
  private readonly fsm = new Fsm<State, EnemyCtx>(
    {
      dormant: {
        update: (ctx) => {
          this.facePlayer(ctx);
          if (ctx.player.dead) return undefined;
          const near = Math.abs(this.toPlayer(ctx)) <= T.engageRange && this.sameStorey(ctx, T.sightHeight);
          return near ? 'runWindup' : undefined;
        },
      },
      runWindup: {
        enter: () => {
          this.vx = 0;
          this.facing = this.goal < this.body.centerX ? -1 : 1;
        },
        update: (_ctx, ticks) => {
          if (this.phases.pending) return 'shift';
          return ticks >= phaseValue(T.runWindupTicks, this.phases.index) ? 'run' : undefined;
        },
      },
      run: {
        update: (ctx) => {
          if (this.phases.pending) return 'shift';
          const dx = this.goal - this.body.centerX;
          if (Math.abs(dx) <= 4) return 'shotWindup';
          if (!this.grounded(ctx.cw)) return undefined;
          const dir: 1 | -1 = dx < 0 ? -1 : 1;
          this.facing = dir;
          const blocked = this.ledgeAhead(ctx.cw, dir, 8) || this.walk(ctx.cw, dir, phaseValue(T.runSpeed, this.phases.index));
          return blocked ? 'shotWindup' : undefined;
        },
      },
      shotWindup: {
        enter: (ctx) => {
          this.vx = 0;
          this.shotSent = false;
          this.facePlayer(ctx);
        },
        update: (ctx, ticks) => {
          if (!this.shotSent && ticks >= phaseValue(T.shotWindupTicks, this.phases.index)) {
            this.shotSent = true;
            const b = this.body;
            ctx.fire({ x: this.facing > 0 ? b.right : b.x, y: b.y + T.muzzleY, vx: this.facing * T.shotSpeed, vy: 0 });
          }
          return ticks >= phaseValue(T.shotWindupTicks, this.phases.index) + T.shotHoldTicks ? 'warpWindup' : undefined;
        },
      },
      warpWindup: {
        enter: () => {
          this.vx = 0;
        },
        update: (_ctx, ticks) => (ticks >= phaseValue(T.warpWindupTicks, this.phases.index) ? 'warp' : undefined),
      },
      warp: {
        enter: () => {
          const b = this.body;
          this.ghost = { x: b.x, y: b.y, w: b.w, h: b.h };
          const dest = Math.abs(b.centerX - this.left) <= Math.abs(b.centerX - this.right) ? this.right : this.left;
          this.facing = dest < b.centerX ? -1 : 1;
          b.place(dest - b.w / 2, b.y);
          this.goal = dest === this.left ? this.right : this.left;
          this.vx = 0;
        },
        update: (_ctx, ticks) => (ticks >= T.warpTicks ? 'stumble' : undefined),
      },
      stumble: {
        enter: () => {
          this.vx = 0;
          this.ghost = null;
        },
        update: (_ctx, ticks) => {
          if (ticks < phaseValue(T.exposedTicks, this.phases.index)) return undefined;
          return this.phases.pending ? 'shift' : 'runWindup';
        },
      },
      shift: {
        enter: () => {
          this.phases.commit();
          this.vx = 0;
          this.ghost = null;
        },
        update: (_ctx, ticks) => (ticks >= T.phaseShiftTicks ? 'warpWindup' : undefined),
      },
    },
    'dormant',
  );

  constructor(id: number, x: number, y: number) {
    super(id, 'tikbalang-x', T, x, y);
    this.left = x - T.runSpan;
    this.right = x + T.runSpan;
    this.goal = this.right;
  }

  get label(): string {
    return T.label;
  }

  override get phase(): number {
    return this.phases.phase;
  }

  get engaged(): boolean {
    return this.fsm.state !== 'dormant';
  }

  get exposed(): boolean {
    return this.alive && this.fsm.state === 'stumble';
  }

  override get hittable(): boolean {
    return this.exposed;
  }

  /** The run is the only contact. The warp, the decoy, and the stumble are not. */
  override get harmsOnContact(): boolean {
    return this.alive && this.fsm.state === 'run';
  }

  protected override damageFor(damage: number, weakPoint: boolean): number {
    return exposedOnlyDamage(damage, this.exposed, weakPoint, T.weakPointMultiplier);
  }

  weakPointRect(): Rect {
    return coreRect(this.body, T.weakPoint);
  }

  override afterimage(): (Rect & { readonly alpha: number }) | null {
    if (!this.ghost || this.fsm.state !== 'warp') return null;
    return { ...this.ghost, alpha: T.afterimageAlpha };
  }

  get pose(): EnemyPose {
    if (!this.alive) return 'death';
    switch (this.fsm.state) {
      case 'dormant':
      case 'runWindup':
        return 'idle';
      case 'run':
        return 'move';
      case 'shotWindup':
        return 'shoot';
      case 'warpWindup':
        return 'windup';
      case 'warp':
        return 'rush';
      case 'stumble':
        return 'stunned';
      case 'shift':
        return 'shift';
    }
  }

  get state(): State {
    return this.fsm.state;
  }

  protected behave(ctx: EnemyCtx): void {
    this.fsm.update(ctx);
    this.fall(ctx.cw);
    // A warp lands on the floor. Drop any vertical remainder so the next run starts standing.
    if (this.grounded(ctx.cw)) this.vy = 0;
  }

  protected override onHurt(): void {
    this.phases.note(this.health.hp);
  }

}
