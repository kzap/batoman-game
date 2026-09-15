import { Fsm } from '@core/sim/fsm';
import { ENEMY } from '../tuning';
import { Enemy, type EnemyCtx, type EnemyPose } from './enemy';

type State = 'patrol' | 'shoot' | 'hurt';
const T = ENEMY.patroller;

/**
 * Ground patrol: walks between its spawn +/- patrolDistance, turning at
 * bounds, walls and ledges. Seeing the player ahead at its height it stops
 * and fires a horizontal shot after a wind-up, then resumes. A hit interrupts
 * whatever it was doing and knocks it back a little.
 */
export class Patroller extends Enemy {
  private readonly minX: number;
  private readonly maxX: number;
  private readonly fsm = new Fsm<State, EnemyCtx>(
    {
      patrol: {
        update: (ctx) => {
          if (this.hurtTicks > 0) return 'hurt';
          if (this.shotCooldown > 0) this.shotCooldown--;
          if (this.shotCooldown === 0 && this.seesPlayer(ctx)) return 'shoot';
          if (this.grounded(ctx.cw)) {
            const b = this.body;
            const atBound = this.facing > 0 ? b.right >= this.maxX : b.x <= this.minX;
            if (atBound || this.ledgeAhead(ctx.cw, this.facing, ENEMY.ledgeProbe)) this.turn();
            else if (this.walk(ctx.cw, this.facing, T.speed)) this.turn();
          } else this.vx = 0;
          return undefined;
        },
      },
      shoot: this.shootState(T, 'patrol', () => this.levelShot(T.muzzleY, T.shotSpeed)),
      hurt: this.hurtState(T, 'patrol'),
    },
    'patrol',
  );

  constructor(id: number, x: number, y: number, patrolDistance: number) {
    super(id, 'patroller', T, x, y);
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
      case 'patrol':
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
    this.shove(T, dir);
  }

  private turn(): void {
    this.facing = -this.facing as 1 | -1;
    this.vx = 0;
  }

  private seesPlayer(ctx: EnemyCtx): boolean {
    if (ctx.player.dead) return false;
    const dx = this.toPlayer(ctx);
    return Math.sign(dx) === this.facing && Math.abs(dx) <= T.sightRange && this.sameStorey(ctx, T.sightHeight);
  }
}
