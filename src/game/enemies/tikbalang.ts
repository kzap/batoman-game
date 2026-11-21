import { SIM_DT } from '@core/sim/clock';
import { Fsm } from '@core/sim/fsm';
import { ENEMY } from '../tuning';
import { Enemy, type EnemyCtx, type EnemyPose } from './enemy';

type State = 'patrol' | 'burst' | 'stomp' | 'hurt';
const T = ENEMY.tikbalang;

/**
 * Scout (not the Tikbalang-X boss): a quadruped that patrols in bursts and,
 * once the player is on its storey, runs in and stomps. The stomp rears, then
 * lunges low enough that a jump clears it. The lunge is committed: getting
 * hit during the rear does not cancel it. Bursts follow the tick counter, so
 * nothing here draws a random number.
 */
export class Tikbalang extends Enemy {
  private readonly minX: number;
  private readonly maxX: number;
  private lunging = false;
  /** Set on the first tick the lunge reaches the player, so that tick still uses the low body. */
  private reached = false;
  /** Ticks left before another stomp. Counts down while chasing. */
  private recover = 0;
  private readonly fsm = new Fsm<State, EnemyCtx>(
    {
      patrol: {
        update: (ctx, ticks) => {
          if (this.hurtTicks > 0) return 'hurt';
          if (!this.grounded(ctx.cw)) {
            this.vx = 0;
            return undefined;
          }
          if (this.sees(ctx, T.sightRange)) return 'burst';
          const bursting = ticks % (T.burstTicks + T.pauseTicks) < T.burstTicks;
          if (!bursting) {
            this.vx = 0;
            return undefined;
          }
          const b = this.body;
          const atBound = this.facing > 0 ? b.right >= this.maxX : b.x <= this.minX;
          if (atBound || this.ledgeAhead(ctx.cw, this.facing, ENEMY.ledgeProbe)) this.turn();
          else if (this.walk(ctx.cw, this.facing, T.speed)) this.turn();
          return undefined;
        },
      },
      burst: {
        update: (ctx) => {
          // The chase does not flinch. A shot still damages it; only the patrol does.
          if (this.recover > 0) this.recover--;
          if (!this.sees(ctx, T.loseRange)) return 'patrol';
          this.facePlayer(ctx);
          const gap = this.gapAhead(ctx);
          // Inside the standoff (or still overlapping after a lunge): back out.
          // A lunge that ended under a jumping player must clear that column
          // before the body stands up, or the landing is a free hit.
          if (gap < T.standoff) {
            if (this.recover === 0 && gap >= 0) return 'stomp';
            this.separate(ctx);
            return undefined;
          }
          if (this.body.h !== T.height) this.body.h = T.height;
          if (this.recover > 0) {
            this.vx = 0;
            return undefined;
          }
          if (this.grounded(ctx.cw) && !this.ledgeAhead(ctx.cw, this.facing, ENEMY.ledgeProbe)) {
            this.walk(ctx.cw, this.facing, T.burstSpeed);
          } else this.vx = 0;
          return undefined;
        },
      },
      stomp: {
        enter: (ctx) => {
          this.vx = 0;
          this.lunging = false;
          this.reached = false;
          this.facePlayer(ctx);
        },
        exit: (ctx) => {
          this.lunging = false;
          this.reached = false;
          this.vx = 0;
          this.recover = T.recoverTicks;
          if (this.gapAhead(ctx) >= 4) this.body.h = T.height;
        },
        update: (ctx, ticks) => {
          // Committed: damage lands, but the rear and the lunge play out.
          if (!this.lunging) {
            this.vx = 0;
            if (ticks >= T.windupTicks) {
              this.lunging = true;
              this.body.h = T.lungeHeight;
            }
            return undefined;
          }
          if (this.reached) return 'burst';
          const lunged = ticks - T.windupTicks;
          const step = Math.ceil(T.lungeSpeed * SIM_DT);
          const ledge = this.ledgeAhead(ctx.cw, this.facing, step) && ctx.cw.wallBeside(this.body, this.facing) === null;
          if (lunged >= T.lungeTicks || ledge) return 'burst';
          const hitWall = this.walk(ctx.cw, this.facing, T.lungeSpeed);
          if (hitWall) return 'burst';
          // One tick of overlap at the low height. Standing back up waits until the column is clear.
          if (this.gapAhead(ctx) < 0) this.reached = true;
          return undefined;
        },
      },
      hurt: {
        update: (ctx) => {
          ctx.cw.moveX(this.body, this.vx * SIM_DT, () => (this.vx = 0));
          this.vx *= ENEMY.knockbackDecay;
          if (this.hurtTicks > 0) return undefined;
          this.vx = 0;
          return 'burst';
        },
      },
    },
    'patrol',
  );

  constructor(id: number, x: number, y: number, patrolDistance: number) {
    super(id, 'tikbalang', T, x, y);
    this.minX = Math.max(0, x - patrolDistance);
    this.maxX = x + patrolDistance;
  }

  get pose(): EnemyPose {
    if (!this.alive) return 'death';
    switch (this.fsm.state) {
      case 'stomp':
        return this.lunging ? 'rush' : 'shoot';
      case 'hurt':
        return 'hurt';
      case 'patrol':
      case 'burst':
        return this.vx !== 0 ? 'move' : 'idle';
    }
  }

  get state(): State {
    return this.fsm.state;
  }

  protected behave(ctx: EnemyCtx): void {
    this.fsm.update(ctx);
    this.fall(ctx.cw);
  }

  protected override onHurt(dir: 1 | -1): void {
    this.vx = dir * T.knockback;
  }

  override hit(damage: number, dir: 1 | -1, weakPoint = false): number {
    const dealt = super.hit(damage, dir, weakPoint);
    if (!this.alive) this.body.h = T.height;
    return dealt;
  }

  /** Step away from the player until the standoff is restored, then stand up. */
  private separate(ctx: EnemyCtx): void {
    const away = (this.facing === 1 ? -1 : 1) as 1 | -1;
    if (this.grounded(ctx.cw) && !this.ledgeAhead(ctx.cw, away, ENEMY.ledgeProbe)) this.walk(ctx.cw, away, T.burstSpeed);
    else this.vx = 0;
    if (this.body.h !== T.height && this.gapAhead(ctx) >= 4) this.body.h = T.height;
  }

  private turn(): void {
    this.facing = (this.facing === 1 ? -1 : 1) as 1 | -1;
    this.vx = 0;
  }

  /** Centre distance within `range`, on this storey. */
  private sees(ctx: EnemyCtx, range: number): boolean {
    if (ctx.player.dead) return false;
    return Math.abs(this.toPlayer(ctx)) <= range && this.sameStorey(ctx, T.sightHeight);
  }

  /** Pixels between the leading edge and the player's near edge. Negative once the body has crossed it. */
  private gapAhead(ctx: EnemyCtx): number {
    const p = ctx.player.body;
    return this.facing > 0 ? p.x - this.body.right : this.body.x - p.right;
  }
}
