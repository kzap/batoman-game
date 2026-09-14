import { overlaps } from '@core/math/aabb';
import { SIM_DT } from '@core/sim/clock';
import { CollisionWorld, type Body, type Solid } from '@core/sim/collision';
import { EventBus } from '@core/sim/events';
import { InputEdges, NO_INPUT, type InputFrame } from '@core/sim/input';
import { Rng } from '@core/sim/rng';
import type { LevelJson, MovingSolidJson, Rect } from '@content/level';

const overlapsRect = (b: Body, r: Rect): boolean => overlaps(b, r);
import { Health } from './health';
import { Player, type PlayerPose } from './player';
import { PLAYER, PROJECTILE } from './tuning';

/** Events the sim announces; audio and effects subscribe in later phases. */
export interface WorldEvents extends Record<string, unknown> {
  tick: { tick: number };
  jump: { wall: boolean };
  land: Record<string, never>;
  dash: Record<string, never>;
  fire: { x: number; y: number; dir: 1 | -1 };
  hurt: { hp: number };
  death: { cause: DeathCause };
  respawn: { x: number; y: number; lives: number };
  checkpoint: { id: number };
  complete: { tick: number };
  gameover: Record<string, never>;
}

export type DeathCause = 'pit' | 'crusher' | 'squish' | 'damage';
export type WorldStatus = 'playing' | 'complete' | 'gameover';

export interface PlayerSnapshot {
  /** Exact position including sub-pixel remainders; feet at (x + w/2, y). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly facing: 1 | -1;
  readonly pose: PlayerPose;
  readonly hp: number;
  readonly invulnerable: boolean;
}

export interface ProjectileSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly dir: 1 | -1;
}

export interface SolidSnapshot extends Rect {
  readonly id: number;
}

/**
 * Snapshot of everything the renderer needs. The renderer reads snapshots;
 * it never reaches into the World. Two consecutive snapshots are interpolated
 * for smooth motion between fixed ticks.
 */
export interface WorldSnapshot {
  readonly tick: number;
  readonly status: WorldStatus;
  readonly lives: number;
  readonly player: PlayerSnapshot;
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly movingSolids: readonly SolidSnapshot[];
}

interface Projectile {
  readonly id: number;
  x: number;
  y: number;
  readonly dir: 1 | -1;
  travelled: number;
}

interface Mover {
  readonly solid: Solid;
  readonly spec: MovingSolidJson;
  /** Index of the waypoint being approached. */
  target: number;
  step: 1 | -1;
  pause: number;
  /** Exact position; the solid holds the rounded one. */
  fx: number;
  fy: number;
}

/**
 * The gameplay simulation for one level: collision world, player, projectiles,
 * moving solids, hazards, checkpoints and the exit. Deterministic given the
 * level, seed and input sequence; `step` runs exactly one 120 Hz tick.
 */
export class World {
  readonly events = new EventBus<WorldEvents>();
  readonly rng: Rng;
  readonly collision = new CollisionWorld();
  readonly player: Player;
  readonly health = new Health(PLAYER.maxHp, PLAYER.invulnTicks);
  lives: number = PLAYER.lives;
  status: WorldStatus = 'playing';

  private tick = 0;
  private readonly input = new InputEdges();
  private readonly movers: Mover[] = [];
  private readonly projectiles: Projectile[] = [];
  private nextProjectileId = 1;
  private respawnAt = { x: 0, y: 0 };
  private respawnIn = 0;
  private checkpointId = -1;

  constructor(
    readonly level: LevelJson,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
    for (const r of level.solids) this.collision.addSolid(r);
    for (const r of level.oneWay) this.collision.addSolid(r, true);
    for (const m of level.movingSolids) {
      const solid = this.collision.addSolid(m);
      this.movers.push({ solid, spec: m, target: 1, step: 1, pause: 0, fx: m.x, fy: m.y });
    }
    this.respawnAt = { ...level.spawn };
    this.player = new Player(level.spawn.x - PLAYER.width / 2, level.spawn.y);
  }

  get currentTick(): number {
    return this.tick;
  }

  step(frame: InputFrame = NO_INPUT): void {
    this.tick += 1;
    this.input.update(this.status === 'playing' ? frame : NO_INPUT);
    this.health.tick();

    this.updateMovers();
    if (this.player.dead) {
      this.updateRespawn();
    } else {
      this.updatePlayer();
      this.checkZones();
    }
    this.updateProjectiles();
    this.events.emit('tick', { tick: this.tick });
  }

  private updatePlayer(): void {
    const a = this.player.update(this.input, this.collision);
    if (a.jumped) this.events.emit('jump', { wall: a.wallJumped });
    if (a.landed) this.events.emit('land', {});
    if (a.dashed) this.events.emit('dash', {});
    if (a.fired) this.fire();
  }

  private fire(): void {
    const b = this.player.body;
    const dir = this.player.facing;
    const x = dir > 0 ? b.right : b.x - PROJECTILE.width;
    const y = b.y + PROJECTILE.muzzleY - PROJECTILE.height / 2;
    this.projectiles.push({ id: this.nextProjectileId++, x, y, dir, travelled: 0 });
    this.events.emit('fire', { x, y, dir });
  }

  private updateProjectiles(): void {
    const dist = PROJECTILE.speed * SIM_DT;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.x += p.dir * dist;
      p.travelled += dist;
      const box = { x: Math.round(p.x), y: Math.round(p.y), w: PROJECTILE.width, h: PROJECTILE.height };
      const offLevel = p.x < -PROJECTILE.width || p.x > this.level.width;
      if (p.travelled >= PROJECTILE.range || offLevel || this.collision.solidAt(box)) this.projectiles.splice(i, 1);
    }
  }

  private updateMovers(): void {
    const riders = this.player.dead ? [] : [this.player.body];
    for (const m of this.movers) {
      if (m.pause > 0) {
        m.pause--;
        continue;
      }
      const path = m.spec.path;
      const goal = path[m.target]!;
      const dx = goal.x - m.fx;
      const dy = goal.y - m.fy;
      // sqrt, not Math.hypot: hypot is not correctly rounded and differs between JS engines.
      const len = Math.sqrt(dx * dx + dy * dy);
      const stepLen = m.spec.speed * SIM_DT;
      if (len <= stepLen) {
        m.fx = goal.x;
        m.fy = goal.y;
        m.pause = m.spec.pause ?? 0;
        // Ping-pong along the path.
        if (m.target + m.step < 0 || m.target + m.step >= path.length) m.step = -m.step as 1 | -1;
        m.target += m.step;
      } else {
        m.fx += (dx / len) * stepLen;
        m.fy += (dy / len) * stepLen;
      }
      const ix = Math.round(m.fx) - m.solid.x;
      const iy = Math.round(m.fy) - m.solid.y;
      this.collision.moveSolid(m.solid, ix, iy, riders, () => this.die('squish'));
    }
  }

  private checkZones(): void {
    const b = this.player.body;
    if (b.top < 0) return this.die('pit');
    for (const z of this.level.deathZones) if (overlapsRect(b, z)) return this.die('pit');
    for (const h of this.level.hazards) {
      if (!overlapsRect(b, h)) continue;
      if (h.kind === 'crusher') return this.die('crusher');
      this.damage(1, b.centerX < h.x + h.w / 2 ? -1 : 1);
      if (this.player.dead) return;
    }
    for (const c of this.level.checkpoints) {
      if (c.id !== this.checkpointId && overlapsRect(b, c)) {
        this.checkpointId = c.id;
        this.respawnAt = { x: c.x + c.w / 2, y: c.y };
        this.events.emit('checkpoint', { id: c.id });
      }
    }
    if (overlapsRect(b, this.level.exit)) {
      this.status = 'complete';
      this.events.emit('complete', { tick: this.tick });
    }
  }

  /** Damage from a hazard or enemy; `dir` is the knockback direction. Respects i-frames and the dash. */
  damage(amount: number, dir: 1 | -1): boolean {
    if (this.player.dead || this.player.invulnerable) return false;
    if (!this.health.hit(amount)) return false;
    if (this.health.alive) {
      this.player.knockback(dir, this.collision);
      this.events.emit('hurt', { hp: this.health.hp });
    } else {
      this.die('damage');
    }
    return true;
  }

  private die(cause: DeathCause): void {
    if (this.player.dead) return;
    this.health.kill();
    this.player.kill();
    this.projectiles.length = 0;
    this.respawnIn = PLAYER.respawnTicks;
    this.events.emit('death', { cause });
  }

  private updateRespawn(): void {
    if (this.respawnIn > 0) this.respawnIn--;
    if (this.respawnIn > 0) return;
    if (this.lives <= 1) {
      this.lives = 0;
      this.status = 'gameover';
      this.events.emit('gameover', {});
      return;
    }
    this.lives--;
    this.health.reset();
    this.player.respawn(this.respawnAt.x - PLAYER.width / 2, this.respawnAt.y);
    this.events.emit('respawn', { ...this.respawnAt, lives: this.lives });
  }

  snapshot(): WorldSnapshot {
    const b = this.player.body;
    return {
      tick: this.tick,
      status: this.status,
      lives: this.lives,
      player: {
        x: b.exactX,
        y: b.exactY,
        w: b.w,
        h: b.h,
        facing: this.player.facing,
        pose: this.player.pose,
        hp: this.health.hp,
        invulnerable: this.health.invulnerable || this.player.invulnerable,
      },
      projectiles: this.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, dir: p.dir })),
      movingSolids: this.movers.map((m) => ({ id: m.solid.id, x: m.solid.x, y: m.solid.y, w: m.solid.w, h: m.solid.h })),
    };
  }
}
