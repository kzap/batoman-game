import { overlaps } from '@core/math/aabb';
import { SIM_DT } from '@core/sim/clock';
import { CollisionWorld, type Solid } from '@core/sim/collision';
import { EventBus } from '@core/sim/events';
import { InputEdges, NO_INPUT, type InputFrame } from '@core/sim/input';
import { Rng } from '@core/sim/rng';
import type { AABB } from '@core/math/aabb';
import type { EnemyType, LevelJson, MovingSolidJson, Rect } from '@content/level';
import { CameraController, type CameraSnapshot, type CameraTarget } from './camera';
import { Boss, spawnEnemy, type Enemy, type EnemyCtx, type EnemySnapshot, type ShotRequest } from './enemies';
import { Health } from './health';
import { Player, type PlayerPose } from './player';
import { advanceProjectile, ProjectilePool, projectileBox, type Projectile, type ProjectileKind, type ProjectileSnapshot } from './projectiles';
import { BOSS, CAMERA, ENEMY, ENEMY_SHOT, NOVA, PLAYER, PROJECTILE } from './tuning';

const overlapsRect = (b: AABB, r: Rect): boolean => overlaps(b, r);

/** Events the sim announces; audio and effects subscribe to them. Positions are level px. */
export interface WorldEvents extends Record<string, unknown> {
  tick: { tick: number };
  jump: { wall: boolean };
  land: Record<string, never>;
  dash: Record<string, never>;
  fire: { x: number; y: number; dir: 1 | -1; kind: ProjectileKind };
  hurt: { hp: number };
  death: { cause: DeathCause };
  respawn: { x: number; y: number; lives: number };
  checkpoint: { id: number };
  complete: { tick: number };
  gameover: Record<string, never>;
  /** A shot ended against a solid or ran out of range. */
  shotEnd: { x: number; y: number; kind: ProjectileKind; hitSolid: boolean };
  /** `dir` is the shot's travel direction, so sparks fly on from the impact. */
  enemyHit: { id: number; type: EnemyType; x: number; y: number; dir: 1 | -1; damage: number; weakPoint: boolean };
  enemyDeath: { id: number; type: EnemyType; x: number; y: number };
  bossPhase: { phase: number; x: number; y: number };
  bossDefeated: { x: number; y: number };
}

export type { EnemySnapshot, ProjectileKind, ProjectileSnapshot };

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
  /** Fired recently; the renderer overlays the shooting clip on idle/run. */
  readonly shooting: boolean;
  readonly hp: number;
  readonly invulnerable: boolean;
  /** Nova charge 0..1 while fire is held. */
  readonly charge: number;
}

export interface BossSnapshot {
  /** False while the boss waits for the player to reach the arena; the HUD hides the bar. */
  readonly engaged: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly phase: number;
  /** Weak point rect in level px, for the renderer's core glow. */
  readonly weakPoint: Rect;
  /** Double-damage window open (stunned after a rush). */
  readonly exposed: boolean;
}

export interface SolidSnapshot extends Rect {
  readonly id: number;
  /** Prop frame from the level JSON, passed through for the renderer. */
  readonly prop: string | undefined;
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
  readonly enemies: readonly EnemySnapshot[];
  /** Present while the level's boss is alive or dying. */
  readonly boss: BossSnapshot | null;
  readonly movingSolids: readonly SolidSnapshot[];
  readonly camera: CameraSnapshot;
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
 * The gameplay simulation for one level: collision world, player, enemies,
 * projectiles, moving solids, hazards, checkpoints and the exit. Deterministic
 * given the level, seed and input sequence; `step` runs exactly one 120 Hz tick.
 * While a boss is alive the exit is inert.
 */
export class World {
  readonly events = new EventBus<WorldEvents>();
  readonly rng: Rng;
  readonly collision = new CollisionWorld();
  readonly player: Player;
  readonly health = new Health(PLAYER.maxHp, PLAYER.invulnTicks);
  readonly camera: CameraController;
  lives: number = PLAYER.lives;
  status: WorldStatus = 'playing';

  private tick = 0;
  private readonly input = new InputEdges();
  private readonly movers: Mover[] = [];
  readonly projectiles = new ProjectilePool();
  readonly enemies: Enemy[] = [];
  private nextEnemyId = 1;
  /** Boss phase seen last tick; a change emits `bossPhase`. */
  private bossPhaseSeen = 1;
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
    this.camera = new CameraController(level.width, level.height, level.spawn);
    this.spawnEnemies();
  }

  /** Enemies start fresh at level start and after every respawn. */
  private spawnEnemies(): void {
    this.enemies.length = 0;
    this.bossPhaseSeen = 1;
    for (const spec of this.level.enemies) {
      const e = spawnEnemy(this.nextEnemyId, spec);
      if (e) {
        this.enemies.push(e);
        this.nextEnemyId++;
      }
    }
  }

  get boss(): Boss | null {
    return this.enemies.find((e): e is Boss => e instanceof Boss) ?? null;
  }

  /** The exit works only once any boss is dead. */
  get exitOpen(): boolean {
    const boss = this.boss;
    return boss === null || !boss.alive;
  }

  private cameraTarget(): CameraTarget {
    const p = this.player;
    return { x: p.body.centerX, y: p.body.y, facing: p.facing, moving: Math.abs(p.vx) > PLAYER.stillSpeed, grounded: p.grounded };
  }

  get currentTick(): number {
    return this.tick;
  }

  /** One tick. After completion or game over the world is frozen; the app restarts it. */
  step(frame: InputFrame = NO_INPUT): void {
    if (this.status !== 'playing') return;
    this.tick += 1;
    this.input.update(frame);
    this.health.tick();

    this.updateMovers();
    if (this.player.dead) {
      this.updateRespawn();
    } else {
      this.updatePlayer();
      this.checkZones();
    }
    this.updateEnemies();
    this.updateProjectiles();
    this.camera.update(this.cameraTarget(), this.rng);
    this.events.emit('tick', { tick: this.tick });
  }

  private updatePlayer(): void {
    const a = this.player.update(this.input, this.collision);
    if (a.jumped) this.events.emit('jump', { wall: a.wallJumped });
    if (a.landed) this.events.emit('land', {});
    if (a.dashed) this.events.emit('dash', {});
    if (a.fired) this.fire('plasma');
    if (a.novaFired) this.fire('nova');
  }

  private fire(kind: 'plasma' | 'nova'): void {
    const b = this.player.body;
    const dir = this.player.facing;
    const t = kind === 'nova' ? NOVA : PROJECTILE;
    // The shot leaves just outside the body at muzzle height; positions are centres.
    const x = dir > 0 ? b.right + t.width / 2 : b.x - t.width / 2;
    const y = b.y + PROJECTILE.muzzleY;
    this.projectiles.spawn({ kind, x, y, vx: dir * t.speed, vy: 0, w: t.width, h: t.height, damage: t.damage, range: t.range, pierce: kind === 'nova' });
    this.events.emit('fire', { x, y, dir, kind });
  }

  private enemyCtx(): EnemyCtx {
    return {
      cw: this.collision,
      player: this.player,
      tick: this.tick,
      levelWidth: this.level.width,
      fire: (s: ShotRequest) => this.enemyFire(s),
      summon: (type, x, y) => this.summon(type, x, y),
      countAlive: (type) => this.enemies.filter((e) => e.type === type && e.alive).length,
    };
  }

  private enemyFire(s: ShotRequest): void {
    this.projectiles.spawn({ kind: 'enemy', x: s.x, y: s.y, vx: s.vx, vy: s.vy, w: ENEMY_SHOT.width, h: ENEMY_SHOT.height, damage: ENEMY_SHOT.damage, range: ENEMY_SHOT.range });
    this.events.emit('fire', { x: s.x, y: s.y, dir: s.vx < 0 ? -1 : 1, kind: 'enemy' });
  }

  private summon(type: EnemyType, x: number, y: number): void {
    const e = spawnEnemy(this.nextEnemyId, { type, x, y });
    if (!e) return;
    this.nextEnemyId++;
    this.enemies.push(e);
  }

  private updateEnemies(): void {
    const ctx = this.enemyCtx();
    for (const e of this.enemies) {
      e.update(ctx);
      if (e instanceof Boss && e.phase !== this.bossPhaseSeen) {
        this.bossPhaseSeen = e.phase;
        this.events.emit('bossPhase', { phase: e.phase, x: e.body.centerX, y: e.body.y + e.body.h / 2 });
      }
      // Touching a live, visible enemy hurts; knockback away from its centre.
      if (e.hittable && !this.player.dead && overlaps(this.player.body, e.body)) {
        this.damage(ENEMY.contactDamage, this.player.body.centerX < e.body.centerX ? -1 : 1);
      }
    }
    // Finished dying, or fell out of the level (a pushed drone, a mis-tuned patrol): drop it.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!;
      if (e.gone || e.body.top < 0) this.enemies.splice(i, 1);
    }
  }

  private updateProjectiles(): void {
    for (const p of this.projectiles.active()) {
      advanceProjectile(p);
      const box = projectileBox(p);
      const offLevel = p.x < -p.w || p.x > this.level.width + p.w || p.y < -p.h || p.y > this.level.height + p.h;
      const hitSolid = this.collision.solidAt(box) !== null;
      if (p.travelled >= p.range || offLevel || hitSolid) {
        this.projectiles.release(p);
        if (!offLevel) this.events.emit('shotEnd', { x: p.x, y: p.y, kind: p.kind, hitSolid });
        continue;
      }
      if (p.kind === 'enemy') {
        if (!this.player.dead && overlaps(box, this.player.body) && this.damage(p.damage, p.vx < 0 ? -1 : 1)) this.projectiles.release(p);
      } else this.hitEnemies(p, box);
    }
  }

  /** A player shot against every hittable enemy it overlaps; plasma stops at the first, nova carries on. */
  private hitEnemies(p: Projectile, box: AABB): void {
    for (const e of this.enemies) {
      if (!e.hittable || !overlaps(box, e.body) || p.hitIds.includes(e.id)) continue;
      const weakPoint = e instanceof Boss && overlaps(box, e.weakPointRect());
      const dir: 1 | -1 = p.vx < 0 ? -1 : 1;
      const dealt = e.hit(p.damage, dir, weakPoint);
      if (dealt === 0) continue;
      this.events.emit('enemyHit', { id: e.id, type: e.type, x: p.x, y: p.y, dir, damage: dealt, weakPoint });
      if (!e.alive) {
        const centre = { x: e.body.centerX, y: e.body.y + e.body.h / 2 };
        this.events.emit('enemyDeath', { id: e.id, type: e.type, ...centre });
        if (e instanceof Boss) {
          this.camera.shake(CAMERA.deathShake.amplitude, CAMERA.deathShake.ticks);
          this.events.emit('bossDefeated', centre);
        }
      }
      p.hitIds.push(e.id);
      if (!p.pierce) {
        this.projectiles.release(p);
        return;
      }
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
    if (this.exitOpen && overlapsRect(b, this.level.exit)) {
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
      this.camera.shake(CAMERA.hurtShake.amplitude, CAMERA.hurtShake.ticks);
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
    this.projectiles.clear();
    this.respawnIn = PLAYER.respawnTicks;
    this.camera.shake(CAMERA.deathShake.amplitude, CAMERA.deathShake.ticks);
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
    this.spawnEnemies();
    this.player.respawn(this.respawnAt.x - PLAYER.width / 2, this.respawnAt.y);
    this.camera.snapTo(this.cameraTarget());
    this.events.emit('respawn', { ...this.respawnAt, lives: this.lives });
  }

  private bossSnapshot(): BossSnapshot | null {
    const boss = this.boss;
    if (!boss) return null;
    return { engaged: boss.engaged, hp: boss.health.hp, maxHp: BOSS.hp, phase: boss.phase, weakPoint: boss.weakPointRect(), exposed: boss.state === 'stunned' };
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
        shooting: this.player.shooting,
        invulnerable: this.health.invulnerable || this.player.invulnerable,
        charge: this.player.charge,
      },
      projectiles: this.projectiles.snapshot(),
      enemies: this.enemies.map((e) => e.snapshot()),
      boss: this.bossSnapshot(),
      movingSolids: this.movers.map((m) => ({ id: m.solid.id, x: m.solid.x, y: m.solid.y, w: m.solid.w, h: m.solid.h, prop: m.spec.prop })),
      camera: this.camera.snapshot(),
    };
  }
}
