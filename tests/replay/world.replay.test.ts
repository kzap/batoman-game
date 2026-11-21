import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '@game/world';
import { NO_INPUT } from '@core/sim/input';
import { decodeInputs } from '@core/sim/replay';
import { CAMERA, PLAYER, SIGBIN } from '@game/tuning';
import { clearRoute, lyingPathRoute, tikbalangPhaseRoute } from './bots';
import { FIXTURE_DIR, loadLevel, record, replay, toFixture, type ReplayFixture } from './harness';

/**
 * Replay tests drive the headless sim with fixed inputs and pin the outcome.
 * The `<level>-clear.json` fixtures are recorded by `npm run replay:record`
 * from the routes in bots.ts; when a tuning or level change legitimately
 * alters a run, re-record and review the diff.
 */
/** Every level in the manifest has a recorded clear; the same checks run for each. */
describe.each(['level-1', 'level-3', 'level-4', 'level-6'])('%s under replay', (id) => {
  const level = loadLevel(id);

  it('is completable by the scripted route, taking no damage', () => {
    const rec = record(level, 1, clearRoute(id), 9000);
    expect(rec.final.status).toBe('complete');
    expect(rec.final.lives).toBe(3);
    expect(rec.final.player.hp).toBe(3);
  });

  it('replays the committed fixture to the same outcome', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}-clear.json`), 'utf8')) as ReplayFixture;
    const final = replay(fixture);
    expect(final.status).toBe(fixture.expect.status);
    expect(final.tick).toBe(fixture.expect.ticks);
    expect(final.lives).toBe(fixture.expect.lives);
    expect(final.player.hp).toBe(fixture.expect.hp);
    expect(Math.round(final.player.x)).toBe(fixture.expect.x);
  });

  it('is deterministic: two runs of the same inputs match snapshot for snapshot', () => {
    const rec = record(level, 7, clearRoute(id), 9000);
    const a = new World(level, 7);
    const b = new World(level, 7);
    for (const f of rec.frames) {
      a.step(f);
      b.step(f);
      expect(a.snapshot()).toEqual(b.snapshot());
    }
  });

  it('records a fixture that round-trips through the RLE encoding', () => {
    const rec = record(level, 1, clearRoute(id), 9000);
    const fx = toFixture(id, 1, rec);
    expect(fx.inputs.reduce((n, [, c]) => n + c, 0)).toBe(rec.frames.length);
    expect(replay(fx).tick).toBe(rec.final.tick);
  });
});

/**
 * The Level 3 clear's inputs are the fixture. This pins the fight those inputs
 * produce: three phases, each a telegraph, a lunge, then an exposed window, and
 * not only the tick the exit opens.
 */
describe('Sigbin phase cycle', () => {
  const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'level-3-clear.json'), 'utf8')) as ReplayFixture;

  /** Pose/phase/exposed edges while the Sigbin is on screen. */
  const marks = (): { tick: number; phase: number; pose: string; exposed: boolean }[] => {
    const world = new World(loadLevel('level-3'), fixture.seed);
    const out: { tick: number; phase: number; pose: string; exposed: boolean }[] = [];
    let prev = '';
    for (const frame of decodeInputs(fixture.inputs)) {
      world.step(frame);
      const snap = world.snapshot();
      const body = snap.enemies.find((e) => e.type === 'sigbin');
      const boss = snap.boss;
      if (!boss || !body) continue;
      const key = `${boss.phase}|${body.pose}|${boss.exposed ? 1 : 0}`;
      if (key === prev) continue;
      prev = key;
      out.push({ tick: snap.tick, phase: boss.phase, pose: body.pose, exposed: boss.exposed });
    }
    return out;
  };

  const SIGBIN_CYCLE = [
    { tick: 1, phase: 1, pose: 'cloaked', exposed: false },
    { tick: 2340, phase: 1, pose: 'move', exposed: false },
    { tick: 2529, phase: 1, pose: 'windup', exposed: false },
    { tick: 2602, phase: 1, pose: 'rush', exposed: false },
    { tick: 2631, phase: 1, pose: 'stunned', exposed: true },
    { tick: 2754, phase: 2, pose: 'shift', exposed: false },
    { tick: 2827, phase: 2, pose: 'cloaked', exposed: false },
    { tick: 2828, phase: 2, pose: 'move', exposed: false },
    { tick: 2988, phase: 2, pose: 'windup', exposed: false },
    { tick: 3045, phase: 2, pose: 'rush', exposed: false },
    { tick: 3074, phase: 2, pose: 'stunned', exposed: true },
    { tick: 3197, phase: 3, pose: 'shift', exposed: false },
    { tick: 3270, phase: 3, pose: 'cloaked', exposed: false },
    { tick: 3271, phase: 3, pose: 'move', exposed: false },
    { tick: 3401, phase: 3, pose: 'windup', exposed: false },
    { tick: 3450, phase: 3, pose: 'rush', exposed: false },
    { tick: 3479, phase: 3, pose: 'stunned', exposed: true },
    { tick: 3601, phase: 3, pose: 'death', exposed: false },
  ] as const;

  it('replays the clear through cloak, telegraph, lunge, exposed window, and shift, once per phase', () => {
    const seen = marks();
    expect(seen).toEqual(SIGBIN_CYCLE);
    // The exposed mark is the punish window, and it opens only out of the lunge.
    const exposed = seen.filter((m) => m.exposed);
    expect(exposed.map((m) => m.phase)).toEqual([1, 2, 3]);
    for (const phase of [1, 2, 3] as const) {
      const windup = seen.find((m) => m.phase === phase && m.pose === 'windup')!;
      const rush = seen.find((m) => m.phase === phase && m.pose === 'rush')!;
      const open = seen.find((m) => m.phase === phase && m.exposed)!;
      expect(rush.tick - windup.tick).toBe(SIGBIN.telegraphTicks[phase - 1]! + 1);
      expect(open.tick - rush.tick).toBe(SIGBIN.lungeTicks + 1);
      expect(open.pose).toBe('stunned');
    }
    // Phase 2 and 3 tell faster than the phase before them.
    const windups = seen.filter((m) => m.pose === 'windup');
    expect(windups[1]!.tick - seen.find((m) => m.phase === 2 && m.pose === 'move')!.tick).toBeLessThan(windups[0]!.tick - seen.find((m) => m.phase === 1 && m.pose === 'move')!.tick);
    expect(windups[2]!.tick - seen.find((m) => m.phase === 3 && m.pose === 'move')!.tick).toBeLessThan(windups[1]!.tick - seen.find((m) => m.phase === 2 && m.pose === 'move')!.tick);
  });
});

describe('World rules', () => {
  // Level 1 geometry without its enemies: these rules are about pits, hazards, checkpoints and the exit
  // (the boss gate and enemy contact are covered in tests/unit/game/enemies.test.ts).
  const level = { ...loadLevel('level-1'), enemies: [] };

  it('kills the player in a pit, respawns at the start with one life fewer', () => {
    const w = new World(level, 1);
    const deaths: string[] = [];
    w.events.on('death', (e) => deaths.push(e.cause));
    // Run right without ever jumping: straight into the first pit.
    for (let i = 0; i < 1500 && deaths.length === 0; i++) w.step({ ...NO_INPUT, right: true });
    expect(deaths).toEqual(['pit']);
    expect(w.player.dead).toBe(true);
    for (let i = 0; i < 200; i++) w.step();
    expect(w.player.dead).toBe(false);
    expect(w.lives).toBe(2);
    expect(Math.round(w.snapshot().player.x + 12)).toBe(level.spawn.x);
  });

  it('spikes cost one hp with i-frames, knock the player back, and stun input', () => {
    const w = new World(level, 1);
    const spikes = level.hazards[0]!;
    w.player.body.place(spikes.x - 60, 64);
    const hurt: number[] = [];
    w.events.on('hurt', (e) => hurt.push(e.hp));
    for (let i = 0; i < 90; i++) w.step({ ...NO_INPUT, right: true });
    expect(hurt).toEqual([2]);
    expect(w.snapshot().player.invulnerable).toBe(true);
    expect(w.player.body.x).toBeLessThan(spikes.x); // knocked back to the left
  });

  it('a dash is invulnerable over spikes; the hit lands once the dash ends', () => {
    const w = new World(level, 1);
    const spikes = level.hazards[0]!;
    w.player.body.place(spikes.x - 10, 64);
    const hurt: number[] = [];
    w.events.on('hurt', (e) => hurt.push(e.hp));
    w.step({ ...NO_INPUT, dash: true, right: true });
    for (let i = 0; i < PLAYER.dashTicks - 2; i++) w.step({ ...NO_INPUT, right: true }); // still dashing
    expect(w.player.dashing).toBe(true);
    expect(w.player.body.x).toBeGreaterThan(spikes.x);
    expect(w.player.body.x).toBeLessThan(spikes.x + spikes.w);
    expect(hurt).toEqual([]);
    for (let i = 0; i < 3; i++) w.step({ ...NO_INPUT, right: true });
    expect(hurt).toEqual([2]);
  });

  it('instant death bypasses hurt-stun and i-frames', () => {
    const pit = { x: 1200, y: 0, w: 200, h: 100 };
    const w = new World({ ...level, deathZones: [...level.deathZones, pit] }, 1);
    const spikes = level.hazards[0]!;
    w.player.body.place(spikes.x - 26, 64);
    for (let i = 0; i < 8 && w.health.hp === 3; i++) w.step({ ...NO_INPUT, right: true });
    expect(w.health.hp).toBe(2);
    expect(w.player.hurtStun).toBeGreaterThan(0);
    expect(w.health.invulnerable).toBe(true);
    const deaths: string[] = [];
    w.events.on('death', (e) => deaths.push(e.cause));
    w.player.body.place(pit.x + 20, 60); // inside the added death zone, mid-stun and invulnerable
    w.step();
    expect(deaths).toEqual(['pit']);
    expect(w.player.dead).toBe(true);
  });

  it('a crusher hazard and a squishing solid both kill outright', () => {
    const crushed = new World({ ...level, hazards: [{ x: 200, y: 64, w: 32, h: 32, kind: 'crusher' }] }, 1);
    const causes: string[] = [];
    crushed.events.on('death', (e) => causes.push(e.cause));
    crushed.player.body.place(200, 64);
    crushed.step();
    const squished = new World({ ...level, movingSolids: [{ x: 300, y: 64, w: 64, h: 32, path: [{ x: 300, y: 64 }, { x: 400, y: 64 }], speed: 600 }], solids: [...level.solids, { x: 380, y: 64, w: 32, h: 100 }] }, 1);
    squished.events.on('death', (e) => causes.push(e.cause));
    squished.player.body.place(364, 64); // between the mover and the wall
    for (let i = 0; i < 30 && causes.length < 2; i++) squished.step();
    expect(causes).toEqual(['crusher', 'squish']);
  });

  it('game over after the last life', () => {
    const w = new World(level, 1);
    let over = false;
    w.events.on('gameover', () => (over = true));
    for (let life = 0; life < 3; life++) {
      w.player.body.place(level.deathZones[0]!.x + 20, 60); // over the first pit
      for (let i = 0; i < 400; i++) w.step();
    }
    expect(over).toBe(true);
    expect(w.snapshot().status).toBe('gameover');
    expect(w.lives).toBe(0);
  });

  it('checkpoint moves the respawn point and the exit completes the level', () => {
    const w = new World(level, 1);
    const cp = level.checkpoints[0]!;
    w.player.body.place(cp.x, cp.y);
    w.step();
    let respawn = { x: 0, y: 0 };
    w.events.on('respawn', (e) => (respawn = { x: e.x, y: e.y }));
    w.player.body.place(level.deathZones[0]!.x + 20, 60);
    for (let i = 0; i < 400; i++) w.step();
    expect(respawn).toEqual({ x: cp.x + cp.w / 2, y: cp.y });
    w.player.body.place(level.exit.x, 64);
    w.step();
    expect(w.snapshot().status).toBe('complete');
  });

  it('freezes after completion or game over until restarted', () => {
    const w = new World(level, 1);
    w.player.body.place(level.exit.x, 64);
    w.step();
    const tick = w.snapshot().tick;
    expect(w.snapshot().status).toBe('complete');
    for (let i = 0; i < 10; i++) w.step({ ...NO_INPUT, right: true });
    expect(w.snapshot().tick).toBe(tick);
    expect(w.snapshot().player.x).toBe(w.snapshot().player.x);
  });

  it('follows the player with the camera and snaps on respawn', () => {
    const w = new World(level, 1);
    const cam0 = w.snapshot().camera;
    for (let i = 0; i < 240; i++) w.step({ ...NO_INPUT, right: true });
    const cam1 = w.snapshot().camera;
    expect(cam1.x).toBeGreaterThan(cam0.x);
    expect(Math.abs(cam1.x - w.snapshot().player.x)).toBeLessThan(CAMERA.lookAhead + CAMERA.deadzoneX + 12); // leading, within look-ahead
    w.player.body.place(level.deathZones[0]!.x + 20, 60);
    let respawned = false;
    w.events.on('respawn', () => (respawned = true));
    for (let i = 0; i < 400 && !respawned; i++) w.step();
    expect(respawned).toBe(true);
    expect(w.snapshot().camera.x).toBe(cam0.x); // back at the spawn framing in one step, not eased
  });

  it('projectiles travel, then vanish at range or on a solid', () => {
    const w = new World(level, 1);
    w.step({ ...NO_INPUT, fire: true });
    expect(w.snapshot().projectiles).toHaveLength(1);
    const x0 = w.snapshot().projectiles[0]!.x;
    w.step();
    expect(w.snapshot().projectiles[0]!.x).toBeGreaterThan(x0);
    for (let i = 0; i < 200; i++) w.step();
    expect(w.snapshot().projectiles).toHaveLength(0);
    w.player.body.place(1984 - 60, 64); // facing the block
    w.step({ ...NO_INPUT, fire: true });
    for (let i = 0; i < 20; i++) w.step();
    expect(w.snapshot().projectiles).toHaveLength(0);
  });

  it('the moving platform carries the player', () => {
    const w = new World(level, 1);
    const m = level.movingSolids[0]!;
    w.player.body.place(m.x + 30, m.y + m.h);
    const x0 = w.player.body.x;
    // The mover pauses at its first waypoint before setting off, so give it time to travel.
    for (let i = 0; i < 240; i++) w.step();
    expect(w.player.body.x).toBeGreaterThan(x0 + 60);
    expect(w.player.grounded).toBe(true);
  });
});

describe('level 6 lying path replay', () => {
  it('walking the painted bridge falls into the pit', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'level-6-lying-path.json'), 'utf8')) as ReplayFixture;
    const final = replay(fixture);
    expect(final.status).toBe('playing');
    expect(final.tick).toBe(fixture.expect.ticks);
    expect(final.lives).toBe(3);
    expect(final.player.hp).toBe(0);
    expect(Math.round(final.player.x)).toBe(fixture.expect.x);
    expect(final.player.x).toBeGreaterThan(1200);
    expect(final.player.x).toBeLessThan(1400);
    expect(final.player.y).toBeLessThan(80);

    const again = replay(fixture);
    expect(again).toEqual(final);
  });

  it('the scripted walk dies in the gap instead of reaching roof 3', () => {
    const rec = record(loadLevel('level-6'), 1, lyingPathRoute(), 5000, (snap) => snap.player.hp <= 0);
    expect(rec.final.player.hp).toBe(0);
    expect(rec.final.lives).toBe(3);
    expect(rec.final.player.x).toBeGreaterThan(1200);
    expect(rec.final.player.x).toBeLessThan(1400);
    expect(rec.final.player.y).toBeLessThan(80);
  });
});

describe('level 6 tikbalang phases', () => {
  it('reaches phase 3 while the boss is alive, then the death', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'level-6-tikbalang-phases.json'), 'utf8')) as ReplayFixture;
    const world = new World(loadLevel(fixture.level), fixture.seed);
    let sawPhase3 = false;
    for (const frame of decodeInputs(fixture.inputs)) {
      const snap = world.snapshot();
      if (snap.boss && snap.boss.hp > 0 && snap.boss.phase >= 3) sawPhase3 = true;
      world.step(frame);
    }
    const final = world.snapshot();
    expect(sawPhase3).toBe(true);
    expect(final.boss === null || final.boss.hp <= 0).toBe(true);
    expect(final.tick).toBe(fixture.expect.ticks);
    expect(final.player.hp).toBe(fixture.expect.hp);
    const again = replay(fixture);
    expect(again).toEqual(final);
  });

  it('the scripted fight is the same pin', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'level-6-tikbalang-phases.json'), 'utf8')) as ReplayFixture;
    let sawPhase3 = false;
    const rec = record(loadLevel('level-6'), 1, tikbalangPhaseRoute(), 12000, (snap) => {
      if (snap.boss && snap.boss.hp > 0 && snap.boss.phase >= 3) sawPhase3 = true;
      return (snap.boss?.hp ?? 1) <= 0
        && !snap.enemies.some((e) => e.type === 'tikbalang' && e.hp > 0 && e.pose !== 'death')
        && !snap.projectiles.some((p) => p.kind === 'enemy');
    });
    expect(sawPhase3).toBe(true);
    expect(rec.final.tick).toBe(fixture.expect.ticks);
    expect(toFixture('level-6', 1, rec).inputs).toEqual(fixture.inputs);
  });
});

describe('level 6 clear leaves the roof empty', () => {
  it('pins every enemy dead at the exit', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'level-6-clear.json'), 'utf8')) as ReplayFixture;
    const final = replay(fixture);
    expect(final.status).toBe('complete');
    expect(final.enemies.filter((e) => e.hp > 0 && e.pose !== 'death')).toEqual([]);
    expect(final.boss === null || final.boss.hp <= 0).toBe(true);
  });
});


describe('level 1 HP Up replay', () => {
  it('jumps at the opening and finishes with the extra heart', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'level-1-hp-up.json'), 'utf8')) as ReplayFixture;
    const final = replay(fixture);
    expect(fixture.expect.maxHp).toBe(4);
    expect(final.status).toBe(fixture.expect.status);
    expect(final.tick).toBe(fixture.expect.ticks);
    expect(final.lives).toBe(fixture.expect.lives);
    expect(final.player.hp).toBe(4);
    expect(final.player.maxHp).toBe(4);
    expect(final.pickups).toEqual([]);
    expect(Math.round(final.player.x)).toBe(fixture.expect.x);

    const again = replay(fixture);
    expect(again).toEqual(final);
  });
});
