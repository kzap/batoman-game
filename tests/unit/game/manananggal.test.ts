import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { overlaps } from '@core/math/aabb';
import { NO_INPUT, type InputFrame } from '@core/sim/input';
import { parseLevel, type LevelJson } from '@content/level';
import { Manananggal } from '@game/enemies';
import { MANANANGGAL, PLAYER } from '@game/tuning';
import { World } from '@game/world';

const M = MANANANGGAL;
/** Roof feet. The planted half lands on the floor at y = 64 via `perchDy`. */
const ROOF = 640;
const SPAWN_X = 700;

function tower(): LevelJson {
  return {
    version: 1,
    id: 'tower',
    name: 'Tower',
    width: 1400,
    height: 900,
    tileSize: 32,
    spawn: { x: 80, y: 64 },
    exit: { x: 1200, y: ROOF, w: 64, h: 128 },
    solids: [
      { x: 0, y: 0, w: 1400, h: 64 },
      { x: 520, y: ROOF - 64, w: 700, h: 64 },
    ],
    oneWay: [],
    movingSolids: [],
    hazards: [],
    deathZones: [],
    checkpoints: [],
    enemies: [{ type: 'manananggal', x: SPAWN_X, y: ROOF }],
  };
}

/** Production roof: spawn (1280, 1408), tower solid from x 1152, lip at x 1584. Other foes removed. */
function roof(): LevelJson {
  const raw: unknown = JSON.parse(readFileSync(new URL('../../../src/content/levels/level-4.json', import.meta.url), 'utf8'));
  const level = parseLevel(raw, 'level-4');
  return { ...level, enemies: level.enemies.filter((e) => e.type === 'manananggal'), hazards: [] };
}

const step = (w: World, n: number, frame: InputFrame = NO_INPUT): void => {
  for (let i = 0; i < n; i++) w.step(frame);
};

const HOLD_JUMP: InputFrame = { ...NO_INPUT, jump: true };

function boss(w: World): Manananggal {
  const b = w.enemies[0];
  if (!(b instanceof Manananggal)) throw new Error('expected the manananggal');
  return b;
}

/** Stand on the roof, close enough to wake the fight, clear of the body. */
function wake(w: World): Manananggal {
  w.player.body.place(600, ROOF);
  w.step();
  return boss(w);
}

function until(w: World, pred: () => boolean, max: number): void {
  for (let i = 0; i < max && !pred(); i++) w.step();
}

describe('Manananggal-7', () => {
  it('sleeps off the roof storey, sweeps a shadow, and marks the perch before the fight', () => {
    const w = new World(tower(), 1);
    const b = boss(w);
    expect(w.exitOpen).toBe(false);
    w.player.body.place(SPAWN_X, ROOF - M.storeyBand - 40);
    step(w, 30);
    expect(b.state).toBe('dormant');
    expect(b.hittable).toBe(false);
    const first = w.snapshot().boss!;
    expect(first.engaged).toBe(false);
    expect(first.shadow).not.toBeNull();
    expect(first.perch).toEqual({ x: b.base.x, y: b.base.y, w: b.base.w, h: M.perchMarkH });
    expect(first.planted).toBeNull();
    expect(first.label).toBe('MANANANGGAL-7');
    step(w, 40);
    const later = w.snapshot().boss!.shadow!;
    expect(later.x).toBeGreaterThan(first.shadow!.x);
    // The shadow is a hint, not a hit. Standing in it does nothing.
    w.player.body.place(first.shadow!.x, first.shadow!.y);
    const hp = w.health.hp;
    step(w, 10);
    expect(w.health.hp).toBe(hp);
    expect(b.state).toBe('dormant');
  });

  it('wakes only on the roof, telegraphs, and the sweep is low enough to jump', () => {
    const w = new World(tower(), 1);
    const b = wake(w);
    expect(b.state).toBe('perch');
    expect(b.engaged).toBe(true);
    until(w, () => b.state === 'windup', 40);
    expect(b.state).toBe('windup');
    // Overlap during the tell does not hurt.
    w.player.body.place(b.body.x, b.body.y);
    const hp = w.health.hp;
    w.step();
    expect(b.state).toBe('windup');
    expect(w.health.hp).toBe(hp);
    expect(b.contactBoxes()).toHaveLength(0);
    until(w, () => b.state === 'sweep', M.windupTicks + 5);
    expect(b.state).toBe('sweep');
    expect(b.body.h).toBe(M.sweepHeight);
    const standing = { x: b.body.x, y: b.body.y, w: PLAYER.width, h: PLAYER.height };
    const jumped = { x: b.body.x, y: b.body.y + M.sweepHeight, w: PLAYER.width, h: PLAYER.height };
    expect(overlaps(standing, b.body)).toBe(true);
    expect(overlaps(jumped, b.body)).toBe(false);
  });

  it('hits a player who stands in the sweep', () => {
    const w = new World(tower(), 1);
    const b = wake(w);
    until(w, () => b.state === 'sweep', M.idleTicks + M.windupTicks + 5);
    // Hold the feet on the roof, in the path, and do not jump.
    for (let i = 0; i < M.sweepMaxTicks && w.health.hp === PLAYER.maxHp; i++) {
      w.player.body.place(600, ROOF);
      w.step();
    }
    expect(w.health.hp).toBeLessThan(PLAYER.maxHp);
  });

  it('splits at the first threshold, and the flyer does not keep phase-2 damage', () => {
    const w = new World(tower(), 1);
    const b = wake(w);
    const phases: number[] = [];
    w.events.on('bossPhase', (p) => phases.push(p.phase));
    while (b.health.hp > M.phaseHp[0]!) b.hit(1, -1);
    expect(b.health.hp).toBe(M.phaseHp[0]);
    // A further hit does not skip the phase.
    expect(b.hit(5, -1)).toBe(0);
    w.step();
    expect(b.state).toBe('shift');
    expect(b.hittable).toBe(false);
    expect(b.hit(5, -1)).toBe(0);
    step(w, M.phaseShiftTicks + 2);
    expect(phases).toEqual([2]);
    expect(b.phase).toBe(2);
    expect(b.body.h).toBe(M.flyerHeight);
    expect(b.plantedRect()).toEqual({ x: b.base.x, y: b.base.y, w: b.base.w, h: b.base.h });
    expect(b.base.y).toBe(ROOF + M.perchDy);
    const hp = b.health.hp;
    expect(b.hit(5, 1, true, 'body')).toBe(0);
    expect(b.health.hp).toBe(hp);
    w.step();
    // The opening hover is the climb. A shot does not send it home yet.
    expect(b.state).toBe('hover');
  });

  it('opens the conduit only after the tell, and only the conduit counts', () => {
    const w = new World(tower(), 1);
    w.health.invuln = 100_000;
    const b = wake(w);
    while (b.health.hp > M.phaseHp[0]!) b.hit(1, -1);
    w.step();
    until(w, () => b.state === 'punish', M.phaseShiftTicks + M.openingHoverTicks + M.diveWindupTicks + M.diveTicks + M.returnMaxTicks + M.baseTellTicks + 30);
    expect(b.state).toBe('punish');
    expect(b.exposed).toBe(true);
    expect(w.snapshot().boss!.weakPoint).toEqual(b.weakPointRect());
    const hp = b.health.hp;
    expect(b.hit(1, 1, false, 'planted')).toBe(0);
    expect(b.hit(1, 1, true, 'body')).toBe(0);
    expect(b.hit(1, 1, true, 'planted')).toBe(M.coreMultiplier);
    expect(b.health.hp).toBe(hp - M.coreMultiplier);
    // Cannot fall through into phase 3's pool.
    b.health.hp = M.phaseHp[1]! + 1;
    b.hit(5, 1, true, 'planted');
    expect(b.health.hp).toBe(M.phaseHp[1]);
  });

  it('phase 3 is the flyer alone, and the exit waits out the death clip', () => {
    const w = new World(tower(), 1);
    w.health.invuln = 100_000;
    const b = wake(w);
    while (b.health.hp > M.phaseHp[0]!) b.hit(1, -1);
    w.step();
    until(w, () => b.state === 'punish' && b.phase === 2, 1200);
    while (b.health.hp > M.phaseHp[1]!) {
      if (b.state !== 'punish') until(w, () => b.state === 'punish' || b.phase === 3, 800);
      if (b.phase === 3) break;
      b.hit(M.coreMultiplier, 1, true, 'planted');
    }
    w.step();
    until(w, () => b.phase === 3 && b.state !== 'shift', M.phaseShiftTicks + 5);
    expect(b.phase).toBe(3);
    expect(b.plantedRect()).toBeNull();
    expect(b.contactBoxes().some((box) => box === b.base)).toBe(false);
    const hp = b.health.hp;
    expect(b.hit(1, 1, true, 'body')).toBe(0);
    expect(b.health.hp).toBe(hp);
    until(w, () => b.state === 'punish', 600);
    expect(b.state).toBe('punish');
    expect(b.hit(1, 1, true, 'body')).toBe(M.coreMultiplier);
    // Direct hits skip the world's projectile event. The exit rule is what this test pins.
    while (b.alive) {
      if (b.state !== 'punish') until(w, () => b.state === 'punish' || !b.alive, 600);
      if (!b.alive) break;
      b.hit(M.coreMultiplier, 1, true, 'body');
    }
    expect(b.alive).toBe(false);
    expect(w.exitOpen).toBe(false);
    expect(w.snapshot().boss).not.toBeNull();
    step(w, M.deathTicks - 1);
    expect(w.exitOpen).toBe(false);
    expect(w.boss).not.toBeNull();
    step(w, 2);
    expect(w.boss).toBeNull();
    expect(w.exitOpen).toBe(true);
  });

  it('a plasma shot in phase 2 hits the conduit and passes through the flyer', () => {
    const w = new World(tower(), 1);
    w.health.invuln = 100_000;
    const b = wake(w);
    while (b.health.hp > M.phaseHp[0]!) b.hit(1, -1);
    w.step();
    until(w, () => b.state === 'punish' && b.phase === 2, 1200);
    // Stand on the lower floor, to the left of the planted half, and tap.
    w.player.body.place(b.base.x - 80, b.base.y);
    w.player.facing = 1;
    const hp = b.health.hp;
    w.step({ ...NO_INPUT, fire: true });
    step(w, 40);
    expect(b.health.hp).toBeLessThan(hp);
    expect(b.phase).toBe(2);
  });

  it('marks the last commitTicks of the sweep tell, and only that beat is the jump', () => {
    const count = new World(tower(), 1);
    const counted = wake(count);
    until(count, () => counted.state === 'windup', 40);
    let wind = 0;
    let commit = 0;
    while (counted.state === 'windup' || counted.state === 'commit') {
      if (counted.pose === 'windup') wind++;
      else if (counted.pose === 'commit') commit++;
      count.step();
    }
    // The sweep still starts on the same tick as the old tell. The entering
    // frame counts with the wind-up; the last `commitTicks` frames are the beat.
    expect(wind).toBe(M.windupTicks - M.commitTicks + 1);
    expect(commit).toBe(M.commitTicks);
    expect(counted.state).toBe('sweep');
    expect(counted.pose).toBe('rush');

    // Jumping on the first wind-up frame lands as the sweep arrives.
    const early = new World(tower(), 1);
    const earlyBoss = wake(early);
    until(early, () => earlyBoss.state === 'windup', 40);
    // 70 px past the body: the sweep arrives as a jump from the first wind-up frame lands,
    // and a jump that starts on `commit` is still above the 44 px body.
    const gap = 70;
    early.player.body.place(earlyBoss.body.right + gap, ROOF);
    for (let i = 0; i < M.windupTicks + M.sweepMaxTicks && early.health.hp === PLAYER.maxHp; i++) early.step(HOLD_JUMP);
    expect(early.health.hp).toBeLessThan(PLAYER.maxHp);

    // The same jump, started when the pose flips to commit, clears the body.
    const late = new World(tower(), 1);
    const lateBoss = wake(late);
    until(late, () => lateBoss.pose === 'commit', M.idleTicks + M.windupTicks);
    late.player.body.place(lateBoss.body.right + gap, ROOF);
    const hp = late.health.hp;
    for (let i = 0; i < M.commitTicks + M.sweepMaxTicks + 40; i++) late.step(HOLD_JUMP);
    expect(late.health.hp).toBe(hp);
    expect(lateBoss.state === 'exposed' || lateBoss.state === 'sweep').toBe(true);
  });

  it('a phase-2 body shot sends the flyer home, and returnMaxTicks opens the window if it has not arrived', () => {
    const w = new World(tower(), 1);
    w.health.invuln = 100_000;
    const b = wake(w);
    const anchorX = SPAWN_X + M.anchorDx;
    const far = 1100;
    while (b.health.hp > M.phaseHp[0]!) b.hit(1, -1);
    w.step();
    for (let i = 0; i < M.phaseShiftTicks + M.openingHoverTicks + 20 && b.state !== 'diveWindup'; i++) {
      w.player.body.place(far, ROOF);
      w.step();
    }
    expect(b.state).toBe('diveWindup');
    expect(b.hit(1, 1, true, 'body')).toBe(0);
    w.step();
    expect(b.state).toBe('return');
    let quick = 0;
    while (b.state === 'return' && quick < 10) {
      w.player.body.place(far, ROOF);
      w.step();
      quick++;
    }
    expect(b.state).toBe('baseTell');
    expect(quick).toBeLessThan(M.returnMaxTicks);

    for (let i = 0; i < 2500 && b.state !== 'return'; i++) {
      w.player.body.place(far, ROOF);
      w.step();
    }
    expect(b.state).toBe('return');
    expect(Math.abs(b.body.centerX - anchorX)).toBeGreaterThan((M.returnSpeed * M.returnMaxTicks) / 120);
    for (let i = 0; i < M.returnMaxTicks; i++) {
      expect(b.state).toBe('return');
      w.player.body.place(far, ROOF);
      w.step();
    }
    // The next update is the one that sees `ticks == returnMaxTicks`.
    w.step();
    expect(b.state).toBe('baseTell');
    expect(Math.abs(b.body.centerX - anchorX)).toBeGreaterThan(64);
  });

  it('a player camping the level-4 roof at (1300, 1408) is hit in phase 2 and phase 3', () => {
    const w = new World(roof(), 1);
    w.player.body.place(1300, 1408);
    w.step();
    const b = boss(w);
    while (b.health.hp > M.phaseHp[0]!) b.hit(1, -1);
    w.step();
    until(w, () => b.phase === 2 && b.state !== 'shift', M.phaseShiftTicks + 5);

    let diveRight = 0;
    for (let i = 0; i < M.openingHoverTicks + M.diveWindupTicks + M.diveTicks + 30 && w.health.hp === PLAYER.maxHp; i++) {
      w.player.body.place(1300, 1408);
      w.health.invuln = 0;
      w.step();
      if (b.state === 'dive') diveRight = Math.max(diveRight, b.body.right);
    }
    expect(w.health.hp).toBeLessThan(PLAYER.maxHp);
    expect(b.phase).toBe(2);
    expect(b.alive).toBe(true);
    // The dive crossed onto the roof. A tick cap that stops in the shaft fails this.
    expect(diveRight).toBeGreaterThan(1300);

    w.health.hp = PLAYER.maxHp;
    w.health.invuln = 100_000;
    while (b.health.hp > M.phaseHp[1]!) {
      w.player.body.place(1300, 1408);
      if (b.state === 'punish') b.hit(M.coreMultiplier, 1, true, 'planted');
      else w.step();
    }
    w.step();
    until(w, () => b.phase === 3 && b.state !== 'shift', M.phaseShiftTicks + 5);
    expect(b.phase).toBe(3);

    w.health.hp = PLAYER.maxHp;
    w.health.invuln = 0;
    diveRight = 0;
    for (let i = 0; i < M.hoverTicks + M.diveWindupTicks + M.diveTicks + 80 && w.health.hp === PLAYER.maxHp; i++) {
      w.player.body.place(1300, 1408);
      w.health.invuln = 0;
      w.step();
      if (b.state === 'dive') diveRight = Math.max(diveRight, b.body.right);
    }
    // Standing on the roof is not a safe win: the dive lands while the flyer is still alive.
    expect(w.health.hp).toBeLessThan(PLAYER.maxHp);
    expect(b.phase).toBe(3);
    expect(b.alive).toBe(true);
    expect(diveRight).toBeGreaterThan(1300);
  });

  it('knockback at the roof lip stops on the parapet instead of dropping off', () => {
    const w = new World(roof(), 1);
    w.player.body.place(1560, 1408);
    w.step();
    expect(w.player.grounded).toBe(true);
    w.player.knockback(1, w.collision);
    step(w, 80);
    expect(w.player.dead).toBe(false);
    expect(w.player.body.y).toBe(1408);
    expect(w.player.body.right).toBeLessThanOrEqual(1584);
  });
});
