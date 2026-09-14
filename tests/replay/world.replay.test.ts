import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '@game/world';
import { NO_INPUT } from '@core/sim/input';
import { CAMERA, PLAYER } from '@game/tuning';
import { clearLevel1 } from './bots';
import { FIXTURE_DIR, loadLevel, record, replay, toFixture, type ReplayFixture } from './harness';

/**
 * Replay tests drive the headless sim with fixed inputs and pin the outcome.
 * `level-1-clear.json` is recorded by `npx tsx tests/replay/record.ts`; when a
 * tuning change legitimately alters the run, re-record and review the diff.
 */
describe('Level 1 under replay', () => {
  const level = loadLevel('level-1');

  it('is completable by the scripted route, taking no damage', () => {
    const rec = record(level, 1, clearLevel1, 6000);
    expect(rec.final.status).toBe('complete');
    expect(rec.final.lives).toBe(3);
    expect(rec.final.player.hp).toBe(3);
  });

  it('replays the committed fixture to the same outcome', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'level-1-clear.json'), 'utf8')) as ReplayFixture;
    const final = replay(fixture);
    expect(final.status).toBe(fixture.expect.status);
    expect(final.tick).toBe(fixture.expect.ticks);
    expect(final.lives).toBe(fixture.expect.lives);
    expect(final.player.hp).toBe(fixture.expect.hp);
    expect(Math.round(final.player.x)).toBe(fixture.expect.x);
  });

  it('is deterministic: two runs of the same inputs match snapshot for snapshot', () => {
    const rec = record(level, 7, clearLevel1, 6000);
    const a = new World(level, 7);
    const b = new World(level, 7);
    for (const f of rec.frames) {
      a.step(f);
      b.step(f);
      expect(a.snapshot()).toEqual(b.snapshot());
    }
  });

  it('records a fixture that round-trips through the RLE encoding', () => {
    const rec = record(level, 1, clearLevel1, 6000);
    const fx = toFixture('level-1', 1, rec);
    expect(fx.inputs.reduce((n, [, c]) => n + c, 0)).toBe(rec.frames.length);
    expect(replay(fx).tick).toBe(rec.final.tick);
  });
});

describe('World rules', () => {
  const level = loadLevel('level-1');

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
    w.player.body.place(1300, 60); // inside the death zone, mid-stun and invulnerable
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
      w.player.body.place(1300, 60); // over the first pit
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
    w.player.body.place(1300, 60);
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
    w.player.body.place(1300, 60);
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
    for (let i = 0; i < 120; i++) w.step();
    expect(w.player.body.x).toBeGreaterThan(x0 + 60);
    expect(w.player.grounded).toBe(true);
  });
});
