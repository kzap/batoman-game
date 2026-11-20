import { describe, expect, it } from 'vitest';
import type { EnemySpawnJson, LevelJson } from '@content/level';
import { NO_INPUT, type InputFrame } from '@core/sim/input';
import { spawnEnemy, type Drone, type Patroller, type Stealth, type Tikbalang } from '@game/enemies';
import { ProjectilePool } from '@game/projectiles';
import { BOSS, ENEMY, NOVA, PLAYER, PROJECTILE } from '@game/tuning';
import { World } from '@game/world';

/** A flat 2000 px arena with walls at both ends and a ledge-free floor at y=64. */
function arena(enemies: EnemySpawnJson[], extra: Partial<LevelJson> = {}): LevelJson {
  return {
    version: 1,
    id: 'arena',
    name: 'Arena',
    width: 2000,
    height: 600,
    tileSize: 32,
    spawn: { x: 200, y: 64 },
    exit: { x: 1936, y: 64, w: 64, h: 200 },
    solids: [
      { x: 0, y: 0, w: 2000, h: 64 },
      { x: 0, y: 64, w: 16, h: 536 },
      { x: 1984, y: 64, w: 16, h: 536 },
    ],
    oneWay: [],
    movingSolids: [],
    hazards: [],
    deathZones: [],
    checkpoints: [],
    enemies,
    ...extra,
  };
}

const run = (w: World, ticks: number, frame: InputFrame = NO_INPUT): void => {
  for (let i = 0; i < ticks; i++) w.step(frame);
};
const shots = (w: World) => [...w.projectiles.active()];
const enemyShots = (w: World) => shots(w).filter((p) => p.kind === 'enemy');

describe('Patroller', () => {
  it('walks between its patrol bounds and turns back at each end', () => {
    const w = new World(arena([{ type: 'patroller', x: 1000, y: 64, patrolDistance: 100 }]), 1);
    const e = w.enemies[0] as Patroller;
    // Faces left first; the player at 200 is out of sight range, so it just patrols.
    const seenX: number[] = [];
    for (let i = 0; i < 600; i++) {
      w.step();
      seenX.push(e.body.x);
    }
    expect(Math.min(...seenX)).toBeGreaterThanOrEqual(900 - 1);
    expect(Math.max(...seenX) + e.body.w).toBeLessThanOrEqual(1100 + 1);
    expect(new Set(seenX.map((x) => Math.sign(x - 1000))).size).toBeGreaterThan(1); // went both ways
    expect(e.pose).toMatch(/move|idle/);
  });

  it('turns round at a ledge instead of walking off', () => {
    const level = arena([{ type: 'patroller', x: 1000, y: 64, patrolDistance: 400 }], { solids: [{ x: 900, y: 0, w: 300, h: 64 }, { x: 0, y: 64, w: 16, h: 536 }] });
    const w = new World(level, 1);
    const e = w.enemies[0]!;
    run(w, 1200);
    expect(e.body.x).toBeGreaterThanOrEqual(900);
    expect(e.body.right).toBeLessThanOrEqual(1200);
    expect(e.alive).toBe(true);
  });

  it('turns round at a wall inside its patrol range', () => {
    const level = arena([{ type: 'patroller', x: 1000, y: 64, patrolDistance: 400 }], { solids: [{ x: 0, y: 0, w: 2000, h: 64 }, { x: 0, y: 64, w: 16, h: 536 }, { x: 900, y: 64, w: 32, h: 128 }] });
    const w = new World(level, 1);
    const e = w.enemies[0]!;
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      w.step();
      seen.add(e.facing);
    }
    expect(e.body.x).toBeGreaterThanOrEqual(932);
    expect(seen).toEqual(new Set([-1, 1]));
  });

  it('stops and fires a horizontal shot at a player it sees, after the wind-up', () => {
    const w = new World(arena([{ type: 'patroller', x: 500, y: 64, patrolDistance: 50 }]), 1);
    const e = w.enemies[0] as Patroller;
    // Player at 200 is 300 px to the left, within sight; the patroller starts facing left.
    let firedAt = -1;
    w.events.on('fire', (f) => {
      if (f.kind === 'enemy' && firedAt < 0) firedAt = w.currentTick;
    });
    run(w, ENEMY.patroller.shotWindupTicks + 3);
    expect(e.state).toBe('shoot');
    // Tick 1 spots the player, the shoot state starts on tick 2, the shot leaves `shotWindupTicks` later.
    expect(firedAt).toBe(ENEMY.patroller.shotWindupTicks + 2);
    const shot = enemyShots(w)[0]!;
    expect(shot.vx).toBeLessThan(0);
    expect(shot.vy).toBe(0);
    expect(shot.y).toBe(64 + ENEMY.patroller.muzzleY);
  });

  it('an enemy shot damages the player once and is consumed', () => {
    const w = new World(arena([{ type: 'patroller', x: 500, y: 64, patrolDistance: 50 }]), 1);
    let hurt = 0;
    w.events.on('hurt', () => hurt++);
    run(w, 240);
    expect(hurt).toBe(1);
    expect(w.health.hp).toBe(PLAYER.maxHp - 1);
    expect(enemyShots(w)).toHaveLength(0);
  });

  it('takes plasma hits: hurt reaction with knockback, then death after three, then removal', () => {
    const w = new World(arena([{ type: 'patroller', x: 400, y: 64, patrolDistance: 0 }]), 1);
    const e = w.enemies[0] as Patroller;
    const hits: number[] = [];
    const deaths: string[] = [];
    w.events.on('enemyHit', (h) => hits.push(h.damage));
    w.events.on('enemyDeath', (d) => deaths.push(d.type));
    const x0 = e.body.x;
    // Face right (player spawns facing right at 200; enemy at 400) and tap fire until dead.
    let ticks = 0;
    while (e.alive && ticks < 600) {
      w.step({ ...NO_INPUT, fire: ticks % 20 === 0 });
      ticks++;
      if (hits.length === 1 && e.alive) {
        expect(e.state === 'hurt' || e.hurtTicks > 0 || e.body.x >= x0).toBe(true);
      }
    }
    expect(hits).toEqual([1, 1, 1]);
    expect(deaths).toEqual(['patroller']);
    expect(e.pose).toBe('death');
    expect(e.body.x).toBeGreaterThan(x0); // knocked away from the shooter
    run(w, ENEMY.patroller.deathTicks + 1);
    expect(w.enemies).toHaveLength(0);
  });

  it('touching a live enemy hurts the player and knocks them away; a dead one does not', () => {
    const w = new World(arena([{ type: 'patroller', x: 224, y: 64, patrolDistance: 0 }]), 1);
    let hurt = 0;
    w.events.on('hurt', () => hurt++);
    w.step();
    expect(hurt).toBe(1);
    expect(w.player.vx).toBeLessThan(0);
    run(w, PLAYER.invulnTicks + 5);
    expect(hurt).toBeGreaterThanOrEqual(1);
    const e = w.enemies[0]!;
    e.hit(99, 1);
    expect(e.alive).toBe(false);
    const before = w.health.hp;
    w.player.body.place(e.body.x, 64);
    run(w, PLAYER.invulnTicks + 5);
    expect(w.health.hp).toBe(before);
  });
});

describe('Drone', () => {
  it('hovers above its ground reference until the player is in range, then dives to chest height and shoots', () => {
    const w = new World(arena([{ type: 'drone', x: 1200, y: 64, patrolDistance: 100 }]), 1);
    const d = w.enemies[0] as Drone;
    const fired: { vx: number; vy: number }[] = [];
    w.projectiles.snapshot(); // pool exists before the first shot
    const origSpawn = w.projectiles.spawn.bind(w.projectiles);
    w.projectiles.spawn = (spec) => {
      if (spec.kind === 'enemy') fired.push({ vx: spec.vx, vy: spec.vy });
      return origSpawn(spec);
    };
    w.step();
    expect(d.state).toBe('hover');
    expect(d.body.y + d.body.h / 2).toBeGreaterThan(64 + ENEMY.drone.hoverHeight - 10);
    // Bring the player close.
    w.player.body.place(1000, 64);
    run(w, 400);
    expect(['chase', 'shoot', 'hurt']).toContain(d.state);
    const centre = d.body.y + d.body.h / 2;
    expect(Math.abs(centre - (64 + ENEMY.drone.chaseHeight))).toBeLessThan(12);
    // It keeps a stand-off on one side and has fired aimed shots.
    expect(Math.abs(d.body.centerX - w.player.body.centerX)).toBeGreaterThan(ENEMY.drone.chaseStandoff - 20);
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.every((f) => f.vy !== 0 || Math.abs(f.vx) > 0)).toBe(true);
  });

  it('loses interest and climbs back to its hover height when the player leaves', () => {
    const w = new World(arena([{ type: 'drone', x: 1200, y: 64, patrolDistance: 100 }]), 1);
    const d = w.enemies[0] as Drone;
    w.player.body.place(1000, 64);
    run(w, 200);
    expect(d.state).not.toBe('hover');
    w.player.body.place(100, 64); // well past loseRange from wherever the chase left the drone
    run(w, ENEMY.drone.shotWindupTicks * 2 + 2); // a shot or hurt in progress finishes first
    expect(d.state).toBe('hover');
    run(w, 300);
    expect(d.body.y + d.body.h / 2).toBeGreaterThan(64 + ENEMY.drone.hoverHeight - ENEMY.drone.bobAmplitude - 2);
  });

  it('ignores a player on another storey: only a target within sightHeight starts the chase', () => {
    // A ledge well above the drone's hover height, inside its horizontal sight range.
    const ledgeY = 64 + ENEMY.drone.hoverHeight + ENEMY.drone.sightHeight + 40;
    const w = new World(arena([{ type: 'drone', x: 1200, y: 64, patrolDistance: 100 }], { oneWay: [{ x: 900, y: ledgeY - 8, w: 200, h: 8 }] }), 1);
    const d = w.enemies[0] as Drone;
    w.player.body.place(1000, ledgeY);
    run(w, 200);
    expect(d.state).toBe('hover');
    w.player.body.place(1000, 64);
    run(w, 200);
    expect(d.state).not.toBe('hover');
  });

  it('dies to two plasma hits', () => {
    const w = new World(arena([{ type: 'drone', x: 300, y: 64, patrolDistance: 0 }]), 1);
    const d = w.enemies[0]!;
    // Move the drone down into the line of fire and shoot.
    d.body.place(300, 64 + PROJECTILE.muzzleY - d.body.h / 2);
    w.step({ ...NO_INPUT, fire: true });
    run(w, 20);
    w.step({ ...NO_INPUT, fire: true });
    run(w, 20);
    expect(d.alive).toBe(false);
  });
});

describe('Stealth', () => {
  it('is cloaked and unhittable until the player comes close, then decloaks, chases and shoots', () => {
    const w = new World(arena([{ type: 'stealth', x: 900, y: 64 }]), 1);
    const s = w.enemies[0] as Stealth;
    w.step();
    expect(s.state).toBe('cloaked');
    expect(s.alpha).toBe(ENEMY.stealth.cloakedAlpha);
    expect(s.hittable).toBe(false);
    expect(s.hit(1, 1)).toBe(0);
    w.player.body.place(900 - ENEMY.stealth.ambushRange + 10, 64);
    w.step();
    expect(s.state).toBe('decloak');
    run(w, ENEMY.stealth.decloakTicks + 1);
    expect(s.alpha).toBe(1);
    expect(s.hittable).toBe(true);
    let fired = 0;
    w.events.on('fire', (f) => {
      if (f.kind === 'enemy') fired++;
    });
    run(w, 200);
    expect(fired).toBeGreaterThan(0);
  });

  it('re-cloaks when the player gets far away', () => {
    const w = new World(arena([{ type: 'stealth', x: 900, y: 64 }]), 1);
    const s = w.enemies[0] as Stealth;
    w.player.body.place(800, 64);
    run(w, ENEMY.stealth.decloakTicks + 2);
    expect(s.state).not.toBe('cloaked');
    w.player.body.place(200, 64);
    run(w, 60);
    expect(s.state).toBe('cloaked');
  });

  it('stays cloaked while the player is on a storey above it, even within ambush range', () => {
    const ledgeY = 64 + ENEMY.stealth.sightHeight + 40;
    const w = new World(arena([{ type: 'stealth', x: 900, y: 64 }], { oneWay: [{ x: 800, y: ledgeY - 8, w: 200, h: 8 }] }), 1);
    const s = w.enemies[0] as Stealth;
    w.player.body.place(880, ledgeY);
    run(w, 60);
    expect(s.state).toBe('cloaked');
    w.player.body.place(880, 64);
    w.step();
    expect(s.state).toBe('decloak');
  });
});

describe('Boss', () => {
  const bossArena = () => arena([{ type: 'aswang', x: 1500, y: 64 }]);

  it('sleeps until the player is near, then keeps the exit shut and fires bursts of three in phase 1', () => {
    const w = new World(bossArena(), 1);
    const b = w.boss!;
    expect(w.exitOpen).toBe(false);
    w.step();
    expect(b.state).toBe('dormant');
    expect(b.hittable).toBe(false);
    expect(w.snapshot().boss!.engaged).toBe(false);
    w.player.body.place(1500 - BOSS.standoff - 100, 64);
    w.step();
    expect(b.engaged).toBe(true);
    let fired = 0;
    w.events.on('fire', (f) => {
      if (f.kind === 'enemy') fired++;
    });
    run(w, BOSS.shotCooldownTicks[0]! + BOSS.shotWindupTicks + BOSS.burstShots * BOSS.burstSpacingTicks + 5);
    expect(fired).toBe(BOSS.burstShots);
    expect(b.phase).toBe(1);
    // Exit does nothing while the boss lives.
    w.player.body.place(1940, 64);
    w.step();
    expect(w.status).toBe('playing');
  });

  it('shifts phase at the hp thresholds, is invulnerable during the shift, and rushes in phase 2', () => {
    const w = new World(bossArena(), 1);
    const b = w.boss!;
    const phases: number[] = [];
    w.events.on('bossPhase', (p) => phases.push(p.phase));
    w.player.body.place(1100, 64);
    w.step(); // engage
    // Shoot it down to the first threshold.
    while (b.health.hp > BOSS.phaseHp[0]!) b.hit(1, 1);
    w.step();
    w.step();
    expect(b.state).toBe('shift');
    expect(b.hittable).toBe(false);
    expect(b.hit(5, 1)).toBe(0);
    run(w, BOSS.phaseShiftTicks + 2);
    expect(phases).toEqual([2]);
    expect(b.phase).toBe(2);
    // Phase 2 opens with a rush: windup, charge, then stunned against the far wall.
    run(w, BOSS.rushWindupTicks + 2);
    expect(['rush', 'rushWindup']).toContain(b.state);
    let sawRush = false;
    for (let i = 0; i < BOSS.rushMaxTicks + BOSS.rushWindupTicks + 10 && b.state !== 'stunned'; i++) {
      if (b.state === 'rush') {
        sawRush = true;
        expect(b.body.h).toBe(BOSS.rushHeight);
      }
      w.step();
    }
    expect(sawRush).toBe(true);
    expect(b.state).toBe('stunned');
    expect(b.body.h).toBe(BOSS.height); // the collider drops to rushHeight only for the rush itself
    expect(w.snapshot().boss!.exposed).toBe(true);
    // Weak-point hits count double while stunned; body hits do not.
    const hp = b.health.hp;
    expect(b.hit(1, 1, true)).toBe(BOSS.weakPointMultiplier);
    expect(b.hit(1, 1, false)).toBe(1);
    expect(b.health.hp).toBe(hp - BOSS.weakPointMultiplier - 1);
  });

  it('summons drones in phase 3 up to the cap, and its death opens the exit', () => {
    const w = new World(bossArena(), 1);
    const b = w.boss!;
    // Untouchable player: a death would respawn the level with a fresh boss (see the respawn test below).
    w.health.invuln = 100_000;
    w.player.body.place(1100, 64);
    w.step(); // engage
    while (b.health.hp > BOSS.phaseHp[1]!) {
      b.hit(1, 1);
      run(w, BOSS.phaseShiftTicks + 3);
    }
    run(w, BOSS.phaseShiftTicks + 3);
    expect(b.phase).toBe(3);
    // Phase 3 opens with a summon.
    run(w, BOSS.rushWindupTicks + BOSS.shotWindupTicks + 5);
    const drones = () => w.enemies.filter((e) => e.type === 'drone' && e.alive);
    expect(drones().length).toBe(BOSS.summonCount);
    // Kill one; the next summon tops up to the cap instead of adding a full pair.
    drones()[0]!.hit(99, 1);
    run(w, ENEMY.drone.deathTicks + BOSS.summonEveryTicks + BOSS.shotWindupTicks + 5);
    expect(drones().length).toBe(BOSS.summonMaxAlive);
    // Phase 3 fires on the short cooldown.
    const shots: number[] = [];
    w.events.on('fire', (f) => {
      if (f.kind === 'enemy') shots.push(w.currentTick);
    });
    run(w, BOSS.shotCooldownTicks[2]! * 3);
    expect(shots.length).toBeGreaterThanOrEqual(BOSS.burstShots * 2);
    let defeated = false;
    w.events.on('bossDefeated', () => (defeated = true));
    // Kill it through the world so the events fire: keep facing it (it rushes about) and tap fire.
    for (let i = 0; i < 1500 && b.alive; i++) {
      w.player.facing = b.body.centerX > w.player.body.centerX ? 1 : -1;
      w.step({ ...NO_INPUT, fire: i % 12 === 0 });
    }
    expect(b.alive).toBe(false);
    expect(defeated).toBe(true);
    expect(w.exitOpen).toBe(true);
    expect(w.snapshot().boss).not.toBeNull(); // still shown while dying
    run(w, BOSS.deathTicks + 2);
    expect(w.snapshot().boss).toBeNull();
  });
});

describe('Respawn', () => {
  it('a player death respawns every enemy fresh, boss included', () => {
    const w = new World(arena([{ type: 'aswang', x: 1500, y: 64 }, { type: 'patroller', x: 900, y: 64, patrolDistance: 0 }]), 1);
    const boss = w.boss!;
    const patroller = w.enemies[1]!;
    patroller.hit(99, 1);
    boss.hit(5, 1);
    w.player.body.place(1000, -200); // below the level: dies in the pit
    run(w, PLAYER.respawnTicks + 5);
    expect(w.lives).toBe(2);
    expect(w.boss).not.toBe(boss);
    expect(w.boss!.health.hp).toBe(BOSS.hp);
    expect(w.enemies.filter((e) => e.type === 'patroller' && e.alive)).toHaveLength(1);
  });
});

describe('Tikbalang', () => {
  const T = ENEMY.tikbalang;

  const until = (w: World, pred: () => boolean, max = 800): number => {
    let n = 0;
    for (; n < max && !pred(); n++) w.step();
    return n;
  };

  it('spawns from a level entry instead of being dropped as data', () => {
    const e = spawnEnemy(1, { type: 'tikbalang', x: 4100, y: 576 });
    expect(e).not.toBeNull();
    expect(e!.type).toBe('tikbalang');
    expect(e!.body.y).toBe(576);
    const level = arena([{ type: 'tikbalang', x: 4100, y: 576 }]);
    expect(new World(level, 1).enemies.map((en) => en.type)).toEqual(['tikbalang']);
  });

  it('patrols in bursts between its bounds and turns at a ledge or a wall', () => {
    const w = new World(arena([{ type: 'tikbalang', x: 1000, y: 64, patrolDistance: 100 }]), 1);
    const e = w.enemies[0] as Tikbalang;
    const speeds = new Set<number>();
    const xs: number[] = [];
    for (let i = 0; i < T.burstTicks + T.pauseTicks + 10; i++) {
      w.step();
      speeds.add(e.vx === 0 ? 0 : 1);
      xs.push(e.body.x);
    }
    expect(e.state).toBe('patrol');
    expect(speeds).toEqual(new Set([0, 1])); // a burst and a pause
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(900 - 1);
    expect(Math.max(...xs) + e.body.w).toBeLessThanOrEqual(1100 + 1);

    const ledge = arena([{ type: 'tikbalang', x: 1000, y: 64, patrolDistance: 400 }], {
      solids: [
        { x: 900, y: 0, w: 300, h: 64 },
        { x: 0, y: 64, w: 16, h: 536 },
      ],
    });
    const onLedge = new World(ledge, 1);
    run(onLedge, 1500);
    const body = onLedge.enemies[0]!.body;
    expect(body.x).toBeGreaterThanOrEqual(900);
    expect(body.right).toBeLessThanOrEqual(1200);

    const walled = arena([{ type: 'tikbalang', x: 1000, y: 64, patrolDistance: 400 }], {
      solids: [
        { x: 0, y: 0, w: 2000, h: 64 },
        { x: 0, y: 64, w: 16, h: 536 },
        { x: 900, y: 64, w: 32, h: 128 },
      ],
    });
    const byWall = new World(walled, 1);
    const horse = byWall.enemies[0]!;
    const facings = new Set<number>();
    for (let i = 0; i < 500; i++) {
      byWall.step();
      facings.add(horse.facing);
    }
    expect(horse.body.x).toBeGreaterThanOrEqual(932);
    expect(facings).toEqual(new Set([-1, 1]));
  });

  it('ignores a player on another storey and a dead one', () => {
    const high = 64 + T.sightHeight + 40;
    const w = new World(arena([{ type: 'tikbalang', x: 800, y: 64, patrolDistance: 40 }], { oneWay: [{ x: 700, y: high - 8, w: 200, h: 8 }] }), 1);
    const e = w.enemies[0] as Tikbalang;
    w.player.body.place(760, high);
    run(w, 40);
    expect(e.state).toBe('patrol');

    const pit = new World(arena([{ type: 'tikbalang', x: 800, y: 64 }], { deathZones: [{ x: 180, y: 0, w: 80, h: 400 }] }), 1);
    const dead = pit.enemies[0] as Tikbalang;
    pit.player.body.place(200, 64);
    pit.step();
    expect(pit.player.dead).toBe(true);
    pit.player.body.place(700, 64);
    run(pit, 30);
    expect(dead.state).toBe('patrol');
  });

  it('burst-runs to a standoff, rears, then lunges low; a standing player is hit and a jumped one is not', () => {
    const w = new World(arena([{ type: 'tikbalang', x: 1100, y: 64, patrolDistance: 20 }]), 1);
    const e = w.enemies[0] as Tikbalang;
    w.player.body.place(780, 64);
    until(w, () => e.state === 'burst');
    const chaseStart = e.body.x;
    let sawRun = false;
    until(w, () => {
      if (e.pose === 'move') sawRun = true;
      return e.state === 'stomp';
    });
    expect(sawRun).toBe(true);
    expect(e.body.x).toBeLessThan(chaseStart);
    expect(e.state).toBe('stomp');
    expect(e.pose).toBe('shoot');
    expect(e.body.h).toBe(T.height);
    const gap = e.body.x - w.player.body.right;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(T.standoff + Math.ceil(T.burstSpeed / 120) + 1);

    // The tick that entered `stomp` only ran `enter`; the lunge starts windupTicks updates later.
    const windupLeft = until(w, () => e.pose === 'rush');
    expect(windupLeft).toBe(T.windupTicks + 1);
    expect(e.body.h).toBe(T.lungeHeight);

    let hurt = 0;
    w.events.on('hurt', () => hurt++);
    until(w, () => e.state !== 'stomp', T.lungeTicks + 5);
    expect(hurt).toBe(1);
    expect(w.health.hp).toBe(PLAYER.maxHp - 1);
    // It stays crouched until it has backed out of the player's column.
    until(w, () => e.body.h === T.height, 40);
    expect(e.body.h).toBe(T.height);
    expect(hurt).toBe(1);

    // Same approach, but the player is standing just above the lunge.
    // Above the standing body, not merely the lunge: the horse stands back up where it connected.
    const deck = 64 + T.height + 8;
    const high = new World(
      arena([{ type: 'tikbalang', x: 1000, y: 64, patrolDistance: 20 }], { oneWay: [{ x: 640, y: deck - 8, w: 220, h: 8 }] }),
      1,
    );
    const h = high.enemies[0] as Tikbalang;
    high.player.body.place(760, deck);
    until(high, () => h.state === 'stomp');
    until(high, () => h.state !== 'stomp', T.windupTicks + T.lungeTicks + 5);
    until(high, () => h.body.h === T.height, 40);
    expect(high.health.hp).toBe(PLAYER.maxHp);
    expect(h.body.h).toBe(T.height);
  });

  it('does not cancel a stomp when shot, and waits out the recovery before the next one', () => {
    const w = new World(arena([{ type: 'tikbalang', x: 1000, y: 64, patrolDistance: 20 }]), 1);
    const e = w.enemies[0] as Tikbalang;
    w.player.body.place(780, 64);
    until(w, () => e.state === 'stomp');
    expect(e.hit(1, -1)).toBe(1);
    expect(e.health.hp).toBe(T.hp - 1);
    expect(e.state).toBe('stomp');
    until(w, () => e.pose === 'rush');
    expect(e.state).toBe('stomp');
    until(w, () => e.state === 'burst', T.lungeTicks + 5);
    expect(e.state).toBe('burst');
    let waited = 0;
    until(w, () => {
      waited++;
      return e.state === 'stomp';
    }, T.recoverTicks + 80);
    expect(e.state).toBe('stomp');
    // Backing out to the standoff spends part of the wait; it still does not chain.
    expect(waited).toBeGreaterThan(T.recoverTicks / 2);
  });

  it('gives up the chase off the storey or past lose range, and only a patrol flinches', () => {
    const ledgeY = 64 + T.sightHeight + 40;
    const w = new World(arena([{ type: 'tikbalang', x: 1000, y: 64, patrolDistance: 40 }], { oneWay: [{ x: 700, y: ledgeY - 8, w: 200, h: 8 }] }), 1);
    const e = w.enemies[0] as Tikbalang;
    w.step(); // player still at the spawn, well outside sight
    expect(e.state).toBe('patrol');
    const x = e.body.x;
    e.hit(1, 1);
    w.step();
    expect(e.state).toBe('hurt');
    w.step();
    expect(e.body.x).toBeGreaterThan(x);

    w.player.body.place(800, 64);
    until(w, () => e.state === 'burst');
    expect(e.hit(1, 1)).toBe(1);
    w.step();
    expect(e.state).toBe('burst');
    w.player.body.place(100, 64);
    run(w, T.hurtTicks + 8); // a hit still owed from the chase plays out once the chase ends
    expect(e.state).toBe('patrol');

    w.player.body.place(800, 64);
    until(w, () => e.state === 'burst');
    w.player.body.place(800, ledgeY);
    run(w, 8);
    expect(e.state).toBe('patrol');
  });

  it('stops a lunge at a ledge instead of falling, and dies to the last point of damage', () => {
    const ledge = arena([{ type: 'tikbalang', x: 1200, y: 64, patrolDistance: 20 }], {
      solids: [
        { x: 1000, y: 0, w: 600, h: 64 },
        { x: 760, y: 0, w: 160, h: 64 },
      ],
    });
    const w = new World(ledge, 1);
    const e = w.enemies[0] as Tikbalang;
    // The player is across a gap. Chasing them would mean stepping off the lip.
    w.player.body.place(800, 64);
    run(w, 500);
    expect(e.body.x).toBeGreaterThanOrEqual(1000);
    expect(e.body.y).toBe(64);
    expect(e.alive).toBe(true);

    const open = new World(arena([{ type: 'tikbalang', x: 900, y: 64, patrolDistance: 20 }]), 1);
    const horse = open.enemies[0] as Tikbalang;
    open.player.body.place(700, 64);
    until(open, () => horse.state === 'burst');
    while (horse.alive) horse.hit(1, -1);
    expect(horse.pose).toBe('death');
    expect(horse.body.h).toBe(T.height);
    run(open, T.deathTicks + 1);
    expect(open.enemies).toHaveLength(0);
  });
});

describe('Projectiles', () => {
  it('a tap fires plasma at once; holding past the charge time and releasing fires a nova that pierces', () => {
    const w = new World(arena([{ type: 'patroller', x: 500, y: 64, patrolDistance: 0 }, { type: 'patroller', x: 560, y: 64, patrolDistance: 0 }]), 1);
    const kinds: string[] = [];
    w.events.on('fire', (f) => {
      if (f.kind !== 'enemy') kinds.push(f.kind);
    });
    run(w, NOVA.chargeTicks + 4, { ...NO_INPUT, fire: true });
    expect(kinds).toEqual(['plasma']);
    expect(w.snapshot().player.charge).toBe(1);
    w.step(); // release
    expect(kinds).toEqual(['plasma', 'nova']);
    const hits: number[] = [];
    w.events.on('enemyHit', (h) => hits.push(h.damage));
    run(w, 90);
    expect(hits.filter((d) => d === NOVA.damage).length).toBe(2); // both enemies, one shot
  });

  it('a short hold does not fire a nova', () => {
    const w = new World(arena([]), 1);
    const kinds: string[] = [];
    w.events.on('fire', (f) => kinds.push(f.kind));
    run(w, NOVA.chargeTicks - 10, { ...NO_INPUT, fire: true });
    w.step();
    expect(kinds).toEqual(['plasma']);
  });

  it('the pool recycles slots and reports impacts', () => {
    const pool = new ProjectilePool(2);
    const spec = { kind: 'plasma' as const, x: 0, y: 0, vx: 100, vy: 0, w: 4, h: 4, damage: 1, range: 100 };
    const a = pool.spawn(spec);
    const b = pool.spawn(spec);
    const c = pool.spawn(spec); // full: recycles the oldest (a)
    expect(c).toBe(a);
    expect(pool.activeCount).toBe(2);
    pool.release(b);
    expect(pool.activeCount).toBe(1);
    expect(pool.snapshot().map((p) => p.id)).toEqual([c.id]);
    const w = new World(arena([]), 1);
    const ends: boolean[] = [];
    w.events.on('shotEnd', (e) => ends.push(e.hitSolid));
    w.player.body.place(1900, 64); // wall at 1984 is 60 px away
    w.step({ ...NO_INPUT, fire: true });
    run(w, 30);
    expect(ends).toEqual([true]);
  });
});
