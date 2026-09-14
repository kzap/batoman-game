import { Fsm } from '@core/sim/fsm';
import { ENEMY } from '../tuning';
import { Enemy, type EnemyCtx, type EnemyPose } from './enemy';

type State = 'cloaked' | 'decloak' | 'chase' | 'shoot' | 'hurt';
const T = ENEMY.stealth;

/**
 * Ambusher: stands cloaked (faint, unhittable) until the player comes within
 * ambush range, decloaks over a few ticks, then chases and fires fast shots.
 * Re-cloaks when the player gets far enough away. Uses the patroller sheet
 * until sigbin art exists.
 */
export class Stealth extends Enemy {
  private readonly fsm = new Fsm<State, EnemyCtx>(
    {
      cloaked: {
        enter: () => {
          this.vx = 0;
        },
        update: (ctx) => (!ctx.player.dead && Math.abs(this.toPlayer(ctx)) <= T.ambushRange ? 'decloak' : undefined),
      },
      decloak: {
        enter: (ctx) => this.facePlayer(ctx),
        update: (_ctx, ticks) => (ticks >= T.decloakTicks ? 'chase' : undefined),
      },
      chase: {
        update: (ctx) => {
          if (this.hurtTicks > 0) return 'hurt';
          if (this.shotCooldown > 0) this.shotCooldown--;
          const dx = this.toPlayer(ctx);
          if (ctx.player.dead || Math.abs(dx) > T.chaseRange) return 'cloaked';
          this.facePlayer(ctx);
          if (this.shotCooldown === 0 && Math.abs(ctx.player.body.y - this.body.y) <= T.height) return 'shoot';
          if (Math.abs(dx) > T.standoff && this.grounded(ctx.cw) && !this.ledgeAhead(ctx.cw, this.facing, ENEMY.ledgeProbe)) {
            this.walk(ctx.cw, this.facing, T.speed);
          } else this.vx = 0;
          return undefined;
        },
      },
      shoot: this.shootState(T, 'chase', () => this.levelShot(T.muzzleY, T.shotSpeed)),
      hurt: this.hurtState(T, 'chase'),
    },
    'cloaked',
  );

  constructor(id: number, x: number, y: number) {
    super(id, 'stealth', T, x, y);
  }

  override get hittable(): boolean {
    return this.alive && this.fsm.state !== 'cloaked';
  }

  override get alpha(): number {
    if (!this.alive) return 1;
    if (this.fsm.state === 'cloaked') return T.cloakedAlpha;
    if (this.fsm.state === 'decloak') return T.cloakedAlpha + (1 - T.cloakedAlpha) * Math.min(1, this.fsm.ticks / T.decloakTicks);
    return 1;
  }

  get pose(): EnemyPose {
    if (!this.alive) return 'death';
    switch (this.fsm.state) {
      case 'cloaked':
        return 'cloaked';
      case 'decloak':
        return 'idle';
      case 'shoot':
        return 'shoot';
      case 'hurt':
        return 'hurt';
      case 'chase':
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
}
