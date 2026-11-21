import type { AABB } from '@core/math/aabb';
import { approach, clamp } from '@core/math/vec2';
import { SIM_DT } from '@core/sim/clock';
import { Body } from '@core/sim/collision';
import { Fsm } from '@core/sim/fsm';
import type { Rect } from '@content/level';
import { MANANANGGAL } from '../tuning';
import { BossUnit, PhaseGate, coreRect, exposedMultiplier, exposedOnlyDamage } from './boss-kit';
import type { EnemyCtx, EnemyPose, HurtPart, Hurtbox } from './enemy';

type State =
  | 'dormant'
  | 'perch'
  | 'windup'
  | 'commit'
  | 'sweep'
  | 'exposed'
  | 'shift'
  | 'hover'
  | 'diveWindup'
  | 'dive'
  | 'return'
  | 'baseTell'
  | 'punish';

const M = MANANANGGAL;

/**
 * Level 4 boss. Phase 1 is the whole body on the roof: a wind-up, then a low
 * sweep a jump clears, then a core window. Phase 2 splits. The lower half
 * stays on the balcony the climb already passed, and shots on the flyer do
 * not stick — it returns to the shaft. Phase 3 is the flyer alone. The exit
 * stays shut through the death clip.
 *
 * No rng. Every timer is a tick count from `MANANANGGAL`.
 */
export class Manananggal extends BossUnit {
  private readonly phases = new PhaseGate(M.phaseHp);
  private readonly homeX: number;
  private readonly homeY: number;
  private readonly perchX: number;
  private readonly perchY: number;
  private readonly anchorX: number;
  private readonly anchorY: number;
  readonly base: Body;
  private baseActive = false;
  private forceReturn = false;
  private opening = true;
  private seenTick = 0;
  private idleLeft = 0;
  private diveY = 0;
  private diveDir: 1 | -1 = -1;
  private diveStartX = 0;
  private diveTargetX = 0;
  private readonly fsm: Fsm<State, EnemyCtx>;

  constructor(id: number, x: number, y: number) {
    super(id, 'manananggal', M, x, y);
    this.homeX = x;
    this.homeY = y;
    this.perchX = x + M.perchDx;
    this.perchY = y + M.perchDy;
    this.anchorX = x + M.anchorDx;
    this.anchorY = y + M.anchorDy;
    this.base = new Body(Math.round(this.perchX - M.baseWidth / 2), Math.round(this.perchY), M.baseWidth, M.baseHeight);
    this.fsm = new Fsm<State, EnemyCtx>(
      {
        dormant: {
          update: (ctx) => {
            this.facePlayer(ctx);
            return this.onPerch(ctx) ? 'perch' : undefined;
          },
        },
        perch: {
          enter: () => {
            this.vx = 0;
            this.idleLeft = M.idleTicks;
            this.body.h = M.height;
          },
          update: (ctx) => {
            if (this.phases.pending) return 'shift';
            this.facePlayer(ctx);
            if (this.idleLeft > 0) {
              this.idleLeft--;
              return undefined;
            }
            return 'windup';
          },
        },
        windup: {
          enter: (ctx) => {
            this.vx = 0;
            this.facePlayer(ctx);
          },
          update: (ctx, ticks) => {
            if (this.phases.pending) return 'shift';
            this.facePlayer(ctx);
            return ticks >= M.windupTicks - M.commitTicks ? 'commit' : undefined;
          },
        },
        commit: {
          enter: (ctx) => {
            this.vx = 0;
            this.facePlayer(ctx);
          },
          update: (ctx, ticks) => {
            if (this.phases.pending) return 'shift';
            this.facePlayer(ctx);
            // `ticks` counts finished updates. Leaving at commitTicks - 1 makes
            // the pose last commitTicks snapshots and keeps the sweep on the
            // same tick as the old 48-tick tell.
            return ticks >= M.commitTicks - 1 ? 'sweep' : undefined;
          },
        },
        sweep: {
          enter: (ctx) => {
            this.facePlayer(ctx);
            this.diveDir = this.facing;
            this.body.h = M.sweepHeight;
          },
          exit: () => {
            this.body.h = M.height;
            this.vx = 0;
          },
          update: (ctx, ticks) => {
            const done = this.phases.pending ? 'shift' : 'exposed';
            if (ticks >= M.sweepMaxTicks || this.ledgeAhead(ctx.cw, this.diveDir, M.sweepSpeed * SIM_DT)) return done;
            if (this.walk(ctx.cw, this.diveDir, M.sweepSpeed)) return done;
            return undefined;
          },
        },
        exposed: {
          enter: () => {
            this.vx = 0;
          },
          update: (_ctx, ticks) => {
            if (this.phases.pending) return 'shift';
            return ticks >= M.exposedTicks ? 'perch' : undefined;
          },
        },
        shift: {
          enter: () => {
            this.vx = 0;
            this.forceReturn = false;
            this.phases.commit();
            this.body.h = M.flyerHeight;
            if (this.phases.phase === 2) {
              this.body.place(this.anchorX - this.body.w / 2, this.anchorY);
              this.baseActive = true;
              this.opening = true;
            } else {
              this.baseActive = false;
            }
          },
          update: (_ctx, ticks) => (ticks >= M.phaseShiftTicks ? 'hover' : undefined),
        },
        hover: {
          update: (ctx, ticks) => {
            if (this.phases.pending) return 'shift';
            if (this.forceReturn && !this.opening) return 'return';
            const arrived = this.flyToward(ctx, this.anchorX, this.anchorFeetCenter(), M.returnSpeed);
            const need = this.opening ? M.openingHoverTicks : M.hoverTicks;
            if (arrived && ticks >= need) {
              this.opening = false;
              return 'diveWindup';
            }
            return undefined;
          },
        },
        diveWindup: {
          enter: (ctx) => {
            this.vx = 0;
            this.diveDir = ctx.player.body.centerX < this.body.centerX ? -1 : 1;
            this.facing = this.diveDir;
            this.diveY = Math.max(0, Math.round(ctx.player.body.y));
            this.diveTargetX = ctx.player.body.centerX;
          },
          update: (ctx, ticks) => {
            if (this.phases.pending) return 'shift';
            if (this.forceReturn) return 'return';
            this.flyToward(ctx, this.anchorX, this.anchorFeetCenter(), M.returnSpeed);
            this.facing = this.diveDir;
            return ticks >= M.diveWindupTicks ? 'dive' : undefined;
          },
        },
        dive: {
          enter: () => {
            this.body.h = M.diveHeight;
            this.body.place(this.body.x, this.diveY);
            this.diveStartX = this.body.x;
            this.facing = this.diveDir;
          },
          exit: () => {
            this.body.h = M.flyerHeight;
            this.vx = 0;
          },
          update: (ctx, ticks) => {
            this.facing = this.diveDir;
            const blocked = this.walk(ctx.cw, this.diveDir, M.diveSpeed);
            this.clampX(ctx);
            const traveled = this.diveDir > 0 ? this.body.x - this.diveStartX : this.diveStartX - this.body.x;
            const goal = Math.abs(this.diveTargetX - (this.diveStartX + this.body.w / 2)) + M.divePast;
            // A lip wall stops the body. End once the leading edge has reached the locked player.
            const leading = this.diveDir > 0 ? this.body.right : this.body.x;
            const reached = this.diveDir > 0 ? leading >= this.diveTargetX : leading <= this.diveTargetX;
            if (traveled >= goal || (blocked && reached) || ticks >= M.diveTicks) {
              if (this.phases.pending) return 'shift';
              return this.phases.index === 1 ? 'return' : 'punish';
            }
            return undefined;
          },
        },
        return: {
          enter: () => {
            this.forceReturn = false;
            this.vx = 0;
          },
          update: (ctx, ticks) => {
            if (this.phases.pending) return 'shift';
            const arrived = this.flyToward(ctx, this.anchorX, this.anchorFeetCenter(), M.returnSpeed);
            if (arrived || ticks >= M.returnMaxTicks) return this.phases.index === 1 ? 'baseTell' : 'hover';
            return undefined;
          },
        },
        baseTell: {
          enter: () => {
            this.vx = 0;
          },
          update: (ctx, ticks) => {
            if (this.phases.pending) return 'shift';
            this.flyToward(ctx, this.anchorX, this.anchorFeetCenter(), M.returnSpeed);
            if (ticks === M.baseTellTicks - 1) this.fireBase(ctx);
            return ticks >= M.baseTellTicks ? 'punish' : undefined;
          },
        },
        punish: {
          enter: (ctx) => {
            this.vx = 0;
            this.facePlayer(ctx);
          },
          update: (ctx, ticks) => {
            if (this.phases.pending) return 'shift';
            if (this.phases.index === 1) this.flyToward(ctx, this.anchorX, this.anchorFeetCenter(), M.returnSpeed);
            return ticks >= M.punishTicks ? 'hover' : undefined;
          },
        },
      },
      'dormant',
    );
  }

  override get label(): string {
    return 'MANANANGGAL-7';
  }

  override get phase(): number {
    return this.phases.phase;
  }

  override get engaged(): boolean {
    return this.fsm.state !== 'dormant';
  }

  /** The conduit or the chest core is taking damage this tick. */
  override get exposed(): boolean {
    return this.fsm.state === 'exposed' || this.fsm.state === 'punish';
  }

  override get state(): State {
    return this.fsm.state;
  }

  /** The door waits until the death clip has finished and the body is gone. */
  override get releasesExit(): boolean {
    return this.gone;
  }

  override get hittable(): boolean {
    return this.alive && this.fsm.state !== 'shift' && this.fsm.state !== 'dormant';
  }

  override hurtboxes(): readonly Hurtbox[] {
    const flyer: Hurtbox = {
      id: 'body',
      box: this.body,
      core: this.phases.index === 1 ? null : this.flyerCore(),
    };
    if (!this.baseActive) return [flyer];
    // The planted half is first so a dive that overlaps it does not swallow the shot.
    return [{ id: 'planted', box: this.base, core: this.conduitBox() }, flyer];
  }

  override contactBoxes(): readonly AABB[] {
    if (!this.alive) return [];
    // Only the committed passes bite. The planted half's threat is its shot, so
    // crossing the balcony to reach the conduit is not itself damage.
    if (this.fsm.state === 'sweep' || this.fsm.state === 'dive') return [this.body];
    return [];
  }

  override weakPointRect(): Rect {
    if (this.baseActive && this.phases.index === 1) return this.conduitBox();
    return this.flyerCore();
  }

  override shadowRect(): Rect | null {
    if (this.engaged) return null;
    const span = M.shadowX1 - M.shadowX0;
    const x = M.shadowX0 + Math.floor(((this.seenTick % M.shadowPeriod) * span) / M.shadowPeriod);
    return { x, y: M.shadowY, w: M.shadowW, h: M.shadowH };
  }

  override perchRect(): Rect {
    return { x: this.base.x, y: this.base.y, w: this.base.w, h: M.perchMarkH };
  }

  override plantedRect(): Rect | null {
    if (!this.baseActive) return null;
    return { x: this.base.x, y: this.base.y, w: this.base.w, h: this.base.h };
  }

  override hit(damage: number, dir: 1 | -1, weakPoint = false, part: HurtPart = 'body'): number {
    if (!this.hittable) return 0;
    // Phase 2: the flyer does not stay dead. A shot sends it back to the shaft.
    if (this.phases.index === 1 && part === 'body') {
      // The opening hover is the climb back down. A shot then does not pull the flyer home early.
      if (!this.opening) this.forceReturn = true;
      return 0;
    }
    return super.hit(damage, dir, weakPoint);
  }

  protected override damageFor(damage: number, weakPoint: boolean): number {
    const raw =
      this.phases.index === 0
        ? exposedMultiplier(damage, this.fsm.state === 'exposed', weakPoint, M.coreMultiplier)
        : exposedOnlyDamage(damage, this.fsm.state === 'punish', weakPoint, M.coreMultiplier);
    if (raw <= 0 || this.phases.index >= 2) return raw;
    const floor = M.phaseHp[this.phases.index] ?? 0;
    return Math.min(raw, Math.max(0, this.health.hp - floor));
  }

  get pose(): EnemyPose {
    if (!this.alive) return 'death';
    switch (this.fsm.state) {
      case 'dormant':
        return 'idle';
      case 'perch':
      case 'hover':
      case 'return':
        return this.vx !== 0 ? 'move' : 'idle';
      case 'windup':
      case 'diveWindup':
        return 'windup';
      case 'commit':
        return 'commit';
      case 'baseTell':
        return 'shoot';
      case 'sweep':
      case 'dive':
        return 'rush';
      case 'exposed':
      case 'punish':
        return 'stunned';
      case 'shift':
        return 'shift';
    }
  }

  protected behave(ctx: EnemyCtx): void {
    this.seenTick = ctx.tick;
    const flying = this.phases.index > 0;
    this.fsm.update(ctx);
    if (!flying && this.fsm.state !== 'shift') this.fall(ctx.cw);
  }

  protected override onHurt(): void {
    this.phases.note(this.health.hp);
  }

  /**
   * On the roof and close enough. Feet above the roof (still jumping up onto it)
   * do not start the tell, so the wind-up begins once he has landed.
   */
  private onPerch(ctx: EnemyCtx): boolean {
    if (ctx.player.dead || !ctx.player.grounded) return false;
    const dy = ctx.player.body.y - this.homeY;
    if (dy < -M.storeyBand || dy > 4) return false;
    return Math.abs(ctx.player.body.centerX - this.homeX) <= M.engageRange;
  }

  private flyerCore(): Rect {
    return coreRect(this.body, M.core);
  }

  private conduitBox(): Rect {
    return coreRect(this.base, M.conduit);
  }

  private anchorFeetCenter(): number {
    return this.anchorY + this.body.h / 2;
  }

  private fireBase(ctx: EnemyCtx): void {
    const b = this.base;
    const dir: 1 | -1 = ctx.player.body.centerX < b.centerX ? -1 : 1;
    this.facing = dir;
    ctx.fire({ x: dir > 0 ? b.right : b.x, y: b.y + M.baseMuzzleY, vx: dir * M.baseShotSpeed, vy: 0 });
  }

  private clampX(ctx: EnemyCtx): void {
    if (this.body.x < 0) this.body.place(0, this.body.y);
    else if (this.body.right > ctx.levelWidth) this.body.place(ctx.levelWidth - this.body.w, this.body.y);
  }

  /** Move the centre toward a point. One-ways do not catch a flyer. True when it has arrived. */
  private flyToward(ctx: EnemyCtx, cx: number, cy: number, speed: number): boolean {
    const b = this.body;
    const step = speed * SIM_DT;
    const nx = approach(b.centerX, clamp(cx, b.w / 2, ctx.levelWidth - b.w / 2), step);
    const ny = approach(b.y + b.h / 2, cy, step);
    const dx = nx - b.centerX;
    this.vx = dx / SIM_DT;
    ctx.cw.moveX(b, dx, () => {
      this.vx = 0;
    });
    ctx.cw.moveY(b, ny - (b.y + b.h / 2), () => undefined, { ignoreOneWay: true });
    return Math.abs(cx - b.centerX) <= step * 2 && Math.abs(cy - (b.y + b.h / 2)) <= step * 2;
  }
}
