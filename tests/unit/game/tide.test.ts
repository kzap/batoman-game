import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levelProblems, parseLevel, type LevelJson } from '@content/level';
import { tideTop } from '@game/tide';
import { PLAYER, TIDE, TIDE_PERIOD_TICKS } from '@game/tuning';
import { World } from '@game/world';
import { clearRoute } from '../../replay/bots';
import { record } from '../../replay/harness';

function level5(): LevelJson {
  const json: unknown = JSON.parse(readFileSync(new URL('../../../src/content/levels/level-5.json', import.meta.url), 'utf8'));
  return parseLevel(json, 'level-5');
}

/** Geometry only: tide and checkpoint rules, not the room fights. */
function quiet(): World {
  return new World({ ...level5(), enemies: [] }, 1);
}

describe('tideTop', () => {
  it('follows TIDE rise, hold, and fall, then repeats', () => {
    expect(TIDE_PERIOD_TICKS).toBe(TIDE.riseTicks + TIDE.holdTicks + TIDE.fallTicks);
    expect(tideTop(0)).toBe(TIDE.lowTop);
    expect(tideTop(TIDE.riseTicks - 1)).toBe(TIDE.highTop);
    expect(tideTop(TIDE.riseTicks)).toBe(TIDE.highTop);
    expect(tideTop(TIDE.riseTicks + TIDE.holdTicks - 1)).toBe(TIDE.highTop);
    expect(tideTop(TIDE.riseTicks + TIDE.holdTicks)).toBe(TIDE.highTop);
    expect(tideTop(TIDE_PERIOD_TICKS - 1)).toBe(TIDE.lowTop);
    expect(tideTop(TIDE_PERIOD_TICKS)).toBe(TIDE.lowTop);
    expect(tideTop(TIDE_PERIOD_TICKS + TIDE.riseTicks - 1)).toBe(TIDE.highTop);
  });

  it('never leaves the provisional band', () => {
    for (let t = 0; t < TIDE_PERIOD_TICKS * 2; t++) {
      const y = tideTop(t);
      expect(y).toBeGreaterThanOrEqual(TIDE.lowTop);
      expect(y).toBeLessThanOrEqual(TIDE.highTop);
    }
  });
});

describe('level 5 tide and checkpoints', () => {
  it('validates and keeps spawn and checkpoints above the high-water mark', () => {
    const level = level5();
    expect(levelProblems(level)).toEqual([]);
    expect(level.id).toBe('level-5');
    expect(level.spawn.y).toBeGreaterThan(TIDE.highTop);
    for (const c of level.checkpoints) expect(c.y).toBeGreaterThan(TIDE.highTop);
    expect(level.checkpoints).toHaveLength(3);
    const bossFeetX = 3408;
    const cp3 = level.checkpoints[2]!;
    expect(bossFeetX - (cp3.x + cp3.w / 2)).toBeGreaterThan(560);
    expect(level.enemies.map((e) => e.type)).toEqual(['patroller', 'stealth']);
    expect(level.tideVolumes).toEqual([
      { x: 512, y: 0, w: 384, h: 600 },
      { x: 1920, y: 0, w: 2176, h: 600 },
    ]);
    expect(level.deathZones).toContainEqual({ x: 1664, y: 0, w: 256, h: 32 });
    expect(level.deathZones).toContainEqual({ x: 2304, y: 0, w: 128, h: 64 });
  });

  it('kills on the low street at high tide and leaves the high path dry', () => {
    const w = quiet();
    const deaths: string[] = [];
    w.events.on('death', (e) => deaths.push(e.cause));
    // Stand on the bridge over the low street while the surface climbs and holds.
    w.player.body.place(700 - PLAYER.width / 2, 640);
    for (let i = 0; i < TIDE.riseTicks + TIDE.holdTicks; i++) w.step();
    expect(deaths).toEqual([]);
    expect(w.snapshot().tide[0]!.h).toBe(TIDE.highTop);
    // Drop onto the low street while the mark still holds.
    w.player.body.place(700 - PLAYER.width / 2, 576);
    w.step();
    expect(deaths).toEqual(['pit']);
    expect(w.player.dead).toBe(true);
  });

  it('leaves the low street dry at low tide', () => {
    const w = quiet();
    const deaths: string[] = [];
    w.events.on('death', (e) => deaths.push(e.cause));
    // After a full period the surface is back at lowTop.
    for (let i = 0; i < TIDE_PERIOD_TICKS; i++) w.step();
    expect(tideTop(w.currentTick)).toBe(TIDE.lowTop);
    w.player.body.place(700 - PLAYER.width / 2, 576);
    w.step();
    expect(deaths).toEqual([]);
    expect(w.player.dead).toBe(false);
  });

  it('a shaft pit death respawns at checkpoint 2 with the usual contract', () => {
    const w = quiet();
    const cp2 = level5().checkpoints[1]!;
    w.player.body.place(cp2.x, cp2.y);
    w.step();
    expect(w.snapshot().lives).toBe(PLAYER.lives);
    const respawn: { x: number; y: number; lives: number }[] = [];
    w.events.on('respawn', (e) => respawn.push({ x: e.x, y: e.y, lives: e.lives }));
    w.player.body.place(1664 + 40, 16);
    w.step();
    expect(w.player.dead).toBe(true);
    for (let i = 0; i < PLAYER.respawnTicks + 2; i++) w.step();
    expect(respawn).toEqual([{ x: cp2.x + cp2.w / 2, y: cp2.y, lives: PLAYER.lives - 1 }]);
    expect(w.health.hp).toBe(PLAYER.maxHp);
    expect(w.lives).toBe(PLAYER.lives - 1);
    expect(w.snapshot().enemies).toHaveLength(0); // quiet() stripped them; rebuild still runs
  });

  it('rebuilds enemies on a checkpoint respawn and keeps the exit open with no boss', () => {
    const level = level5();
    const w = new World(level, 1);
    const cp1 = level.checkpoints[0]!;
    w.player.body.place(cp1.x, cp1.y);
    w.step();
    expect(w.snapshot().enemies).toHaveLength(2);
    const patroller = w.enemies.find((e) => e.type === 'patroller')!;
    patroller.hit(99, 1, false);
    expect(patroller.alive).toBe(false);
    w.player.body.place(512 + 40, 16); // inside the room-1 tide column at any tide height
    w.step();
    expect(w.player.dead).toBe(true);
    for (let i = 0; i < PLAYER.respawnTicks + 2; i++) w.step();
    expect(w.snapshot().enemies.some((e) => e.type === 'patroller' && e.hp > 0)).toBe(true);
    expect(w.exitOpen).toBe(true);
    w.player.body.place(level.exit.x, level.exit.y);
    w.step();
    expect(w.snapshot().status).toBe('complete');
  });

  it('is completable by the scripted route without pinning ticks (pending #67)', () => {
    const rec = record(level5(), 1, clearRoute('level-5'), 6000);
    expect(rec.final.status).toBe('complete');
    expect(rec.final.lives).toBe(PLAYER.lives);
    expect(rec.final.player.hp).toBe(PLAYER.maxHp);
    expect(rec.final.tick).toBeGreaterThanOrEqual(1500);
    expect(rec.final.tick).toBeLessThanOrEqual(4500);
  });
});
