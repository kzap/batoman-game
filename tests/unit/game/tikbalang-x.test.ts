import { describe, expect, it } from 'vitest';
import type { LevelJson } from '@content/level';
import { TIKBALANG_X } from '@game/tuning';
import type { TikbalangX } from '@game/enemies';
import { World } from '@game/world';

const T = TIKBALANG_X;

function arena(): LevelJson {
  return {
    version: 1,
    id: 'arena',
    name: 'Arena',
    width: 2000,
    height: 600,
    tileSize: 32,
    spawn: { x: 200, y: 64 },
    exit: { x: 1900, y: 64, w: 64, h: 200 },
    solids: [{ x: 0, y: 0, w: 2000, h: 64 }],
    oneWay: [],
    movingSolids: [],
    hazards: [],
    deathZones: [],
    checkpoints: [],
    enemies: [{ type: 'tikbalang-x', x: 1200, y: 64 }],
  };
}

function wake(): { w: World; b: TikbalangX } {
  const w = new World(arena(), 1);
  w.health.invuln = 100_000;
  const b = w.enemies[0] as unknown as TikbalangX;
  return { w, b };
}

function until(w: World, pred: () => boolean, max = 900): void {
  for (let i = 0; i < max && !pred(); i++) w.step();
}

describe('Tikbalang-X', () => {
  it('stays dormant until the player is close, and the exit stays shut', () => {
    const { w, b } = wake();
    expect(b.state).toBe('dormant');
    expect(w.exitOpen).toBe(false);
    w.player.body.place(200, 64);
    w.step();
    expect(b.state).toBe('dormant');
    w.player.body.place(1900, 64);
    w.step();
    expect(w.status).toBe('playing');
  });

  it('walks each state: wind-up, run, shot, warp, stumble', () => {
    const { w, b } = wake();
    w.player.body.place(900, 64);
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
    w.player.body.place(900, 64);
    w.step();
    const phases: number[] = [];
    w.events.on('bossPhase', (p) => phases.push(p.phase));
    until(w, () => b.state === 'stumble');
    while (b.health.hp > T.phaseHp[0]!) b.hit(1, 1, true);
    w.step();
    until(w, () => b.state === 'shift' || b.state === 'runWindup');
    expect(b.state).toBe('shift');
    expect(b.hit(5, 1, true)).toBe(0);
    until(w, () => b.phase === 2 && b.state === 'warpWindup');
    expect(phases).toEqual([2]);
    expect(b.state).toBe('warpWindup');

    until(w, () => b.state === 'stumble');
    while (b.health.hp > T.phaseHp[1]!) b.hit(1, 1, true);
    w.step();
    until(w, () => b.phase === 3);
    expect(b.phase).toBe(3);

    until(w, () => b.state === 'stumble');
    let defeated = false;
    w.events.on('bossDefeated', () => (defeated = true));
    const core = b.weakPointRect();
    w.projectiles.spawn({
      kind: 'nova',
      x: core.x + core.w / 2,
      y: core.y + core.h / 2,
      vx: 0,
      vy: 0,
      w: core.w,
      h: core.h,
      damage: T.hp,
      range: 8,
      pierce: true,
    });
    w.step();
    expect(b.alive).toBe(false);
    expect(defeated).toBe(true);
    expect(w.exitOpen).toBe(true);
    w.player.body.place(1900, 64);
    w.step();
    expect(w.status).toBe('complete');
  });
});
