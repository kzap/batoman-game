import { SIM_DT } from '@core/sim/clock';
import { Fsm } from '@core/sim/fsm';
import { approach } from '@core/math/vec2';
import { ENEMY } from '../tuning';
import { Enemy, type EnemyCtx, type EnemyPose, type ShotRequest } from './enemy';

type State = 'hover' | 'chase' | 'shoot' | 'hurt';
const T = ENEMY.drone;

/**
 * Flyer: hovers back and forth above its spawn's ground reference with a slow
 * bob. Seeing the player it dives to chest height, keeps a stand-off and fires
 * aimed shots, so a grounded player can shoot it back. Loses interest beyond
 * `loseRange`.
 */
export class Drone extends Enemy {
  private readonly minX: number;
  private readonly maxX: number;
  private readonly groundY: number;
  private readonly fsm = new Fsm<State, EnemyCtx>(
    {
      hover: {
        update: (ctx) => {
          if (this.hurtTicks > 0) return 'hurt';
          if (this.shotCooldown > 0) this.shotCooldown--;
          if (this.seesPlayer(ctx, T.sightRange)) return 'chase';
          const b = this.body;
          if (this.facing > 0 ? b.right >= this.maxX : b.x <= this.minX) this.facing = -this.facing as 1 | -1;
          const bob = Math.sin((ctx.tick / T.bobPeriodTicks) * Math.PI * 2) * T.bobAmplitude;
          this.flyToward(ctx, b.centerX + this.facing * T.speed, this.groundY + T.hoverHeight + bob, T.speed);
          return undefined;
        },
      },
      chase: {
        update: (ctx) => {
          if (this.hurtTicks > 0) return 'hurt';
          if (this.shotCooldown > 0) this.shotCooldown--;
          if (!this.seesPlayer(ctx, T.loseRange)) return 'hover';
          this.facePlayer(ctx);
          const p = ctx.player.body;
          const side = this.toPlayer(ctx) < 0 ? 1 : -1; // stay on this side of the player
          const arrived = this.flyToward(ctx, p.centerX + side * T.chaseStandoff, p.y + T.chaseHeight, T.speed);
          if (arrived && this.shotCooldown === 0) return 'shoot';
          return undefined;
        },
      },
      shoot: this.shootState(T, 'chase', (ctx) => this.aimedShot(ctx)),
      hurt: this.hurtState(T, 'chase'),
    },
    'hover',
  );

  /** `y` is the spawn's ground reference; the drone hovers `hoverHeight` above it (centre). */
  constructor(id: number, x: number, y: number, patrolDistance: number) {
    super(id, 'drone', T, x, y + T.hoverHeight - T.height / 2);
    this.groundY = y;
    this.minX = Math.max(0, x - patrolDistance);
    this.maxX = x + patrolDistance;
  }

  get pose(): EnemyPose {
    if (!this.alive) return 'death';
    switch (this.fsm.state) {
      case 'shoot':
        return 'shoot';
      case 'hurt':
        return 'hurt';
      case 'chase':
        return 'move';
      case 'hover':
        return 'idle';
    }
  }

  get state(): State {
    return this.fsm.state;
  }

  protected behave(ctx: EnemyCtx): void {
    this.fsm.update(ctx);
  }

  protected override onHurt(dir: 1 | -1): void {
    this.shove(T, dir);
  }

  private seesPlayer(ctx: EnemyCtx, range: number): boolean {
    return !ctx.player.dead && Math.abs(this.toPlayer(ctx)) <= range;
  }

  /** A shot from the centre toward the player's centre. */
  private aimedShot(ctx: EnemyCtx): ShotRequest {
    const b = this.body;
    const p = ctx.player.body;
    const dx = p.centerX - b.centerX;
    const dy = p.y + p.h / 2 - (b.y + b.h / 2);
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: b.centerX, y: b.y + b.h / 2, vx: (dx / len) * T.shotSpeed, vy: (dy / len) * T.shotSpeed };
  }

  /** Move the centre toward a target at up to `speed`, resolving against solids. Returns true when within a few pixels. */
  private flyToward(ctx: EnemyCtx, cx: number, cy: number, speed: number): boolean {
    const b = this.body;
    const step = speed * SIM_DT;
    const nx = approach(b.centerX, Math.min(Math.max(cx, b.w / 2), ctx.levelWidth - b.w / 2), step);
    const ny = approach(b.y + b.h / 2, cy, step);
    this.vx = (nx - b.centerX) / SIM_DT;
    this.vy = (ny - (b.y + b.h / 2)) / SIM_DT;
    ctx.cw.moveX(b, nx - b.centerX, () => (this.vx = 0));
    ctx.cw.moveY(b, ny - (b.y + b.h / 2), () => (this.vy = 0), { ignoreOneWay: true });
    return Math.abs(cx - b.centerX) <= step * 2 && Math.abs(cy - (b.y + b.h / 2)) <= step * 2;
  }
}
