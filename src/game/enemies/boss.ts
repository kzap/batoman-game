import { SIM_DT } from '@core/sim/clock';
import { Fsm } from '@core/sim/fsm';
import { BOSS } from '../tuning';
import { Enemy, type EnemyCtx, type EnemyPose } from './enemy';

type State = 'dormant' | 'walk' | 'shoot' | 'rushWindup' | 'rush' | 'stunned' | 'shift' | 'summon';

/**
 * Level 1 boss: the ASWANG prototype, a heavy patroller. Phase 1 walks toward
 * the player keeping a stand-off and fires bursts. Phase 2 adds a rush: a
 * telegraphed charge across the arena that ends stunned against a wall (or
 * after a distance) with the weak point exposed for double damage. Phase 3
 * adds drone summons and a faster burst. Phase changes are a brief invulnerable
 * shift. Its own shots never hurt it; contact does the usual damage.
 */
export class Boss extends Enemy {
  private phaseIndex = 0;
  private cooldown: number = BOSS.shotCooldownTicks[0]!;
  private burstLeft = 0;
  private rushTimer: number = BOSS.rushEveryTicks;
  private summonTimer: number = BOSS.summonEveryTicks;
  private rushDir: 1 | -1 = -1;
  private pendingShift = false;
  private readonly fsm = new Fsm<State, EnemyCtx>(
    {
      dormant: {
        update: (ctx) => {
          this.facePlayer(ctx);
          return !ctx.player.dead && Math.abs(this.toPlayer(ctx)) <= BOSS.engageRange ? 'walk' : undefined;
        },
      },
      walk: {
        update: (ctx) => {
          const interrupt = this.interrupt();
          if (interrupt) return interrupt;
          this.facePlayer(ctx);
          if (this.phaseIndex >= 2 && this.summonTimer === 0 && ctx.countAlive('drone') < BOSS.summonMaxAlive) return 'summon';
          if (this.phaseIndex >= 1 && this.rushTimer === 0) return 'rushWindup';
          if (this.cooldown === 0) return 'shoot';
          const dist = Math.abs(this.toPlayer(ctx));
          if (dist > BOSS.standoff && this.grounded(ctx.cw)) this.walk(ctx.cw, this.facing, BOSS.walkSpeed);
          else this.vx = 0;
          return undefined;
        },
      },
      shoot: {
        enter: (ctx) => {
          this.vx = 0;
          this.burstLeft = BOSS.burstShots;
          this.facePlayer(ctx);
        },
        update: (ctx, ticks) => {
          const interrupt = this.interrupt();
          if (interrupt) return interrupt;
          const t = ticks - BOSS.shotWindupTicks;
          if (t >= 0 && t % BOSS.burstSpacingTicks === 0 && this.burstLeft > 0) {
            this.burstLeft--;
            const b = this.body;
            ctx.fire({ x: this.facing > 0 ? b.right : b.x, y: b.y + BOSS.muzzleY, vx: this.facing * BOSS.shotSpeed, vy: 0 });
          }
          if (this.burstLeft === 0 && t >= BOSS.burstSpacingTicks) {
            this.cooldown = BOSS.shotCooldownTicks[this.phaseIndex]!;
            return 'walk';
          }
          return undefined;
        },
      },
      rushWindup: {
        enter: (ctx) => {
          this.vx = 0;
          this.facePlayer(ctx);
          this.rushDir = this.facing;
        },
        update: (_ctx, ticks) => {
          const interrupt = this.interrupt();
          if (interrupt) return interrupt;
          return ticks >= BOSS.rushWindupTicks ? 'rush' : undefined;
        },
      },
      rush: {
        enter: () => {
          this.body.h = BOSS.rushHeight;
        },
        exit: () => {
          this.body.h = BOSS.height;
        },
        update: (ctx, ticks) => {
          if (this.pendingShift) return 'shift';
          // A rush stops at a ledge as well as a wall: the arena's pit edge is a wall to the boss.
          if (this.ledgeAhead(ctx.cw, this.rushDir, BOSS.rushSpeed * SIM_DT)) return 'stunned';
          const hitWall = this.walk(ctx.cw, this.rushDir, BOSS.rushSpeed);
          const b = this.body;
          const atEdge = this.rushDir > 0 ? b.right >= ctx.levelWidth : b.x <= 0;
          if (hitWall || atEdge || ticks >= BOSS.rushMaxTicks) return 'stunned';
          return undefined;
        },
      },
      stunned: {
        enter: () => {
          this.vx = 0;
          this.rushTimer = BOSS.rushEveryTicks;
        },
        update: (_ctx, ticks) => {
          if (this.pendingShift) return 'shift';
          return ticks >= BOSS.stunTicks ? 'walk' : undefined;
        },
      },
      shift: {
        enter: () => {
          this.pendingShift = false;
          this.vx = 0;
          this.phaseIndex++;
          this.cooldown = BOSS.shotCooldownTicks[this.phaseIndex]!;
          // The new phase opens with its new move: a rush right after the first shift, a summon after the second.
          this.rushTimer = this.phaseIndex === 1 ? BOSS.rushWindupTicks : BOSS.rushEveryTicks;
          this.summonTimer = this.phaseIndex === 2 ? BOSS.rushWindupTicks : BOSS.summonEveryTicks;
        },
        update: (_ctx, ticks) => (ticks >= BOSS.phaseShiftTicks ? 'walk' : undefined),
      },
      summon: {
        enter: (ctx) => {
          this.vx = 0;
          const b = this.body;
          const room = BOSS.summonMaxAlive - ctx.countAlive('drone');
          for (let i = 0; i < Math.min(BOSS.summonCount, room); i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const x = Math.min(Math.max(b.centerX + side * BOSS.summonOffset, BOSS.summonOffset), ctx.levelWidth - BOSS.summonOffset);
            ctx.summon('drone', x, b.y);
          }
          this.summonTimer = BOSS.summonEveryTicks;
        },
        update: (_ctx, ticks) => (ticks >= BOSS.shotWindupTicks ? 'walk' : undefined),
      },
    },
    'dormant',
  );

  constructor(id: number, x: number, y: number) {
    super(id, 'aswang', BOSS, x, y);
  }

  /** 1-based phase for the HUD and renderer. */
  override get phase(): number {
    return this.phaseIndex + 1;
  }

  override get hittable(): boolean {
    return this.alive && this.fsm.state !== 'shift' && this.fsm.state !== 'dormant';
  }

  /** The fight has started: the HUD shows the bar and the exit is watched. */
  get engaged(): boolean {
    return this.fsm.state !== 'dormant';
  }

  /** Double damage to the core while stunned after a rush. */
  protected override damageFor(damage: number, weakPoint: boolean): number {
    return weakPoint && this.fsm.state === 'stunned' ? damage * BOSS.weakPointMultiplier : damage;
  }

  /** The rect (in level px) a shot must cross to count as a weak-point hit. */
  weakPointRect(): { x: number; y: number; w: number; h: number } {
    const b = this.body;
    return { x: b.x, y: b.y + BOSS.weakPoint.y, w: b.w, h: BOSS.weakPoint.h };
  }

  get pose(): EnemyPose {
    if (!this.alive) return 'death';
    if (this.hurtTicks > 0 && this.fsm.state !== 'stunned' && this.fsm.state !== 'rush') return 'hurt';
    switch (this.fsm.state) {
      case 'dormant':
        return 'idle';
      case 'walk':
        return this.vx !== 0 ? 'move' : 'idle';
      case 'shoot':
      case 'summon':
        return 'shoot';
      case 'rushWindup':
        return 'windup';
      case 'rush':
        return 'rush';
      case 'stunned':
        return 'stunned';
      case 'shift':
        return 'shift';
    }
  }

  get state(): State {
    return this.fsm.state;
  }

  protected behave(ctx: EnemyCtx): void {
    // Attack timers run while the boss is acting; a rush, stun or shift is time off the clock.
    const s = this.fsm.state;
    if (s === 'walk' || s === 'shoot' || s === 'rushWindup' || s === 'summon') this.tickTimers();
    this.fsm.update(ctx);
    this.fall(ctx.cw);
  }

  protected override onHurt(): void {
    // Heavy: no knockback. Crossing a phase threshold queues the shift; the FSM takes it at the next safe point.
    const next = BOSS.phaseHp[this.phaseIndex];
    if (next !== undefined && this.health.hp <= next) this.pendingShift = true;
  }

  /** Interrupt walk/shoot/windup for a phase shift; the hurt flash never interrupts the boss. */
  private interrupt(): State | undefined {
    return this.pendingShift ? 'shift' : undefined;
  }

  private tickTimers(): void {
    if (this.cooldown > 0) this.cooldown--;
    if (this.phaseIndex >= 1 && this.rushTimer > 0) this.rushTimer--;
    if (this.phaseIndex >= 2 && this.summonTimer > 0) this.summonTimer--;
  }
}
