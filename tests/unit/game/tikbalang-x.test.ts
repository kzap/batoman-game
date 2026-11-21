import { describe, expect, it } from 'vitest';
import type { LevelJson } from '@content/level';
import { NO_INPUT, type InputFrame } from '@core/sim/input';
import type { TikbalangX } from '@game/enemies';
import { ENEMY_SHOT, PLAYER, TIKBALANG_X } from '@game/tuning';
import { World } from '@game/world';

const T = TIKBALANG_X;
const FLOOR = 576;

/** The last roof of Level 6: x 3648–4480, top at y 576, exit flush with the right edge. */
function arena(): LevelJson {
  return {
    version: 1,
    id: 'arena',
    name: 'Arena',
    width: 4480,
    height: 896,
    tileSize: 32,
    spawn: { x: 3800, y: FLOOR },
    exit: { x: 4416, y: FLOOR, w: 64, h: 320 },
    solids: [{ x: 3648, y: 0, w: 832, h: FLOOR }],
    oneWay: [],
    movingSolids: [],
    hazards: [],
    deathZones: [{ x: 3456, y: 0, w: 192, h: 32 }],
    checkpoints: [],
    enemies: [{ type: 'tikbalang-x', x: 4300, y: FLOOR }],
  };
}

function wake(): { w: World; b: TikbalangX } {
  const w = new World(arena(), 1);
  w.health.invuln = 100_000;
  const b = w.enemies[0] as unknown as TikbalangX;
  return { w, b };
}

function until(w: World, pred: () => boolean, max = 2000, frame: InputFrame = NO_INPUT): void {
  for (let i = 0; i < max && !pred(); i++) w.step(frame);
}

describe('Tikbalang-X', () => {
  it('stays dormant until the player is close, and the exit stays shut', () => {
    const { w, b } = wake();
    expect(b.state).toBe('dormant');
    expect(w.exitOpen).toBe(false);
    w.player.body.place(200, 64);
    w.step();
    expect(b.state).toBe('dormant');
    w.player.body.place(4430, FLOOR);
    w.step();
    expect(w.status).toBe('playing');
  });

  it('walks each state: wind-up, run, shot, warp, stumble', () => {
    const { w, b } = wake();
    w.player.body.place(4200, FLOOR);
    w.step();
    expect(b.state).toBe('runWindup');
    expect(b.engaged).toBe(true);
    until(w, () => b.state === 'run');
    expect(b.state).toBe('run');
    expect(b.harmsOnContact).toBe(true);
    until(w, () => b.state === 'shotWindup');
    expect(b.state).toBe('shotWindup');
    const shots: string[] = [];
    w.events.on('fire', (e) => shots.push(e.kind));
    until(w, () => b.state === 'warpWindup');
    expect(shots).toEqual(['enemy']);
    expect(b.state).toBe('warpWindup');
    expect(b.hittable).toBe(false);
    const from = { x: b.body.x, y: b.body.y };
    until(w, () => b.state === 'warp');
    expect(b.state).toBe('warp');
    const ghost = w.snapshot().boss?.afterimage;
    expect(ghost).toMatchObject({ x: from.x, y: from.y, w: T.width, h: T.height, alpha: T.afterimageAlpha });
    expect(b.body.x).not.toBe(from.x);
    expect(b.hit(5, 1, true)).toBe(0);
    expect(b.health.hp).toBe(T.hp);
    w.projectiles.spawn({
      kind: 'plasma',
      x: from.x + T.width / 2,
      y: from.y + T.muzzleY,
      vx: 1,
      vy: 0,
      w: 12,
      h: 6,
      damage: 1,
      range: 40,
      pierce: false,
    });
    w.step();
    expect(b.health.hp).toBe(T.hp);
    until(w, () => b.state === 'stumble');
    expect(b.state).toBe('stumble');
    expect(b.exposed).toBe(true);
    expect(w.snapshot().boss?.exposed).toBe(true);
    expect(w.snapshot().boss?.afterimage).toBeNull();
    const hp = b.health.hp;
    expect(b.hit(1, 1, false)).toBe(0);
    expect(b.hit(1, 1, true)).toBe(T.weakPointMultiplier);
    expect(b.health.hp).toBe(hp - T.weakPointMultiplier);
  });

  it('shifts at each threshold, ignores hits during the shift, and dies into an open exit', () => {
    const { w, b } = wake();
    w.player.body.place(4200, FLOOR);
    w.step();
    const phases: number[] = [];
    w.events.on('bossPhase', (p) => phases.push(p.phase));
    until(w, () => b.state === 'stumble');
    while (b.health.hp > T.phaseHp[0]!) b.hit(1, 1, true);
    w.step();
    until(w, () => b.state === 'shift' || b.state === 'runWindup');
    expect(b.state).toBe('shift');
    expect(b.hit(5, 1, true)).toBe(0);
    until(w, () => b.phase === 2 && b.state === 'shotWindup');
    expect(phases).toEqual([2]);
    expect(b.state).toBe('shotWindup');

    until(w, () => b.state === 'stumble');
    while (b.health.hp > T.phaseHp[1]!) b.hit(1, 1, true);
    w.step();
    until(w, () => b.phase === 3);
    expect(b.phase).toBe(3);

    until(w, () => b.state === 'stumble');
    b.hit(T.hp, 1, true);
    expect(b.alive).toBe(false);
    w.step();
    expect(w.exitOpen).toBe(true);
    w.player.body.place(4430, FLOOR);
    w.step();
    expect(w.status).toBe('complete');
  });

  it('reaches both roof ends in every phase, over more than one cycle', () => {
    const { w, b } = wake();
    w.health.invuln = 100_000;
    w.player.body.place(4000, FLOOR);
    const visits = [0, 1, 2, 3].map(() => ({ left: 0, right: 0 }));
    let atLeft = false;
    let atRight = false;
    for (let i = 0; i < 30_000 && (visits[3]!.left < 2 || visits[3]!.right < 2); i++) {
      w.step();
      expect(b.body.right).toBeLessThanOrEqual(T.doorX);
      const phase = b.phase;
      const nearLeft = Math.abs(b.body.centerX - T.leftFeet) <= 8;
      const nearRight = Math.abs(b.body.centerX - T.rightFeet) <= 8;
      if (nearLeft && !atLeft) visits[phase]!.left++;
      if (nearRight && !atRight) visits[phase]!.right++;
      atLeft = nearLeft;
      atRight = nearRight;
      if (b.state === 'stumble' && visits[phase]!.left >= 2 && visits[phase]!.right >= 2) {
        const next = phase === 1 ? T.phaseHp[0]! : phase === 2 ? T.phaseHp[1]! : 0;
        if (next > 0) while (b.health.hp > next) b.hit(1, 1, true);
      }
    }
    for (const phase of [1, 2, 3]) {
      expect(visits[phase]!.left).toBeGreaterThanOrEqual(2);
      expect(visits[phase]!.right).toBeGreaterThanOrEqual(2);
    }
  });

  it('a stationary player at the left camp takes damage in phase 2 and phase 3', () => {
    for (const x of [3660, 3740]) {
      for (const phase of [2, 3] as const) {
        const { w, b } = wake();
        w.health.invuln = 100_000;
        w.player.body.place(4000, FLOOR);
        w.step();
        until(w, () => b.state === 'stumble');
        while (b.health.hp > T.phaseHp[0]!) b.hit(1, 1, true);
        w.step();
        until(w, () => b.phase === 2);
        if (phase === 3) {
          until(w, () => b.state === 'stumble');
          while (b.health.hp > T.phaseHp[1]!) b.hit(1, 1, true);
          w.step();
          until(w, () => b.phase === 3);
        }
        expect(b.phase).toBe(phase);
        w.health.invuln = 0;
        w.health.hp = PLAYER.maxHp;
        w.player.body.place(x, FLOOR);
        let hurt = false;
        w.events.on('hurt', () => (hurt = true));
        for (let i = 0; i < 4000 && !hurt; i++) w.step();
        expect(hurt).toBe(true);
        expect(b.phase).toBe(phase);
      }
    }
  });

  it('run contact on the left lip cannot knock the player into the pit', () => {
    for (const x of [3648, 3660, 3680]) {
      const { w } = wake();
      w.health.invuln = 0;
      w.player.body.place(x, FLOOR);
      const deaths: string[] = [];
      w.events.on('death', (e) => deaths.push(e.cause));
      let hurt = false;
      w.events.on('hurt', () => (hurt = true));
      for (let i = 0; i < 4000 && !hurt; i++) w.step();
      expect(hurt).toBe(true);
      for (let i = 0; i < 180; i++) {
        w.step();
        expect(w.player.body.x).toBeGreaterThanOrEqual(3648);
        expect(w.player.body.y).toBeGreaterThanOrEqual(FLOOR);
        expect(deaths).not.toContain('pit');
      }
    }
  });

  it('the exit door stops a player short of the exit while the boss is alive', () => {
    const { w, b } = wake();
    w.health.invuln = 100_000;
    w.health.hp = 99;
    w.player.body.place(4200, FLOOR);
    const right: InputFrame = { ...NO_INPUT, right: true };
    let maxX = w.player.body.x;
    for (let i = 0; i < 800; i++) {
      w.step(right);
      maxX = Math.max(maxX, w.player.body.x);
      expect(w.status).toBe('playing');
      expect(w.player.body.x).toBeLessThanOrEqual(4392);
    }
    expect(b.alive).toBe(true);
    expect(w.exitOpen).toBe(false);
    expect(maxX).toBeGreaterThan(4300);
  });

  it('a jump started on the first phase-3 run tell clears the body', () => {
    const { w, b } = wake();
    w.player.body.place(4200, FLOOR);
    w.step();
    until(w, () => b.state === 'stumble');
    while (b.health.hp > T.phaseHp[0]!) b.hit(1, 1, true);
    w.step();
    until(w, () => b.phase === 2 && b.state === 'stumble');
    while (b.health.hp > T.phaseHp[1]!) b.hit(1, 1, true);
    w.step();
    until(w, () => b.phase === 3 && b.state === 'runWindup');
    expect(b.phase).toBe(3);
    const tell = T.runWindupTicks[2]!;
    expect(tell).toBeGreaterThanOrEqual(24);
    // The wait stopped on the transition into the tell, before its first update. Hold jump until the run starts.
    w.player.vy = 0;
    for (let i = 0; i < tell + 2 && b.state === 'runWindup'; i++) w.step({ ...NO_INPUT, jump: true });
    expect(b.state).toBe('run');
    expect(w.player.body.y).toBeGreaterThan(FLOOR + T.height);
  });

  it('a crouch still overlaps the shot by at least 4 px', () => {
    const { w, b } = wake();
    w.health.invuln = 0;
    w.player.body.place(4200, FLOOR);
    w.step({ ...NO_INPUT, down: true });
    expect(w.player.body.h).toBe(PLAYER.crouchHeight);
    const crouched: InputFrame = { ...NO_INPUT, down: true };
    until(w, () => b.state === 'shotWindup', 2000, crouched);
    const before = w.snapshot().projectiles.length;
    until(w, () => w.snapshot().projectiles.length > before, 2000, crouched);
    const shot = w.snapshot().projectiles.find((p) => p.kind === 'enemy')!;
    const shotBottom = shot.y - ENEMY_SHOT.height / 2;
    const overlap = Math.min(w.player.body.y + w.player.body.h, shot.y + ENEMY_SHOT.height / 2) - Math.max(w.player.body.y, shotBottom);
    expect(overlap).toBeGreaterThanOrEqual(4);
    const hp = w.health.hp;
    until(w, () => w.health.hp < hp, 800, crouched);
    expect(w.health.hp).toBeLessThan(hp);
  });
});
