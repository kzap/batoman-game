import { describe, expect, it } from 'vitest';
import type { AtlasFrame, AtlasJson } from '@content/atlas';
import { SIGBIN } from '@game/tuning';
import type { EnemySnapshot, WorldSnapshot } from '@game/world';
import { EntityView } from '@render/entity-view';
import { enemyHurtTint } from '@render/motion';
import { PALETTE } from '@render/stage';
import { Texture } from 'three';

/** Placeholder tint from ENEMY_LOOK.sigbin. */
const ENEMY_TINT = 0x1a1224;

const frame = (): AtlasFrame => ({ x: 0, y: 0, w: 8, h: 8, pivot: { x: 4, y: 8 } });
const anim = (prefix: string, n: number, fps = 8) => ({ fps, loop: true, frames: Array.from({ length: n }, (_, i) => `${prefix}${i}`) });

function atlas(animations: AtlasJson['animations']): AtlasJson {
  const frames: Record<string, AtlasFrame> = {};
  for (const a of Object.values(animations)) for (const name of a.frames) frames[name] = frame();
  return { version: 1, image: 't.webp', width: 32, height: 32, scale: 1, frames, animations };
}

const batoman = atlas({
  idle: anim('i', 2),
  run: anim('r', 4),
  shoot: anim('s', 2),
  shoot_run: anim('sr', 2),
  hurt: anim('h', 2),
  jump: anim('j', 9),
  orb: anim('o', 1),
});

const patroller = atlas({
  idle: anim('pi', 2),
  move: anim('pm', 2),
  shoot: anim('ps', 2),
  hurt: anim('ph', 2),
  death: anim('pd', 2),
});

function view(): EntityView {
  const texture = new Texture();
  return new EntityView({
    batoman: { json: batoman, texture },
    enemies: new Map([['patroller', { json: patroller, texture }]]),
    levelArt: null,
  });
}

function snap(extra: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    tick: 0,
    status: 'playing',
    lives: 3,
    player: { x: 0, y: 64, w: 24, h: 48, facing: 1, pose: 'idle', shooting: false, hp: 3, invulnerable: false, charge: 0 },
    projectiles: [],
    enemies: [],
    boss: null,
    movingSolids: [],
    camera: { x: 0, y: 0, shakeX: 0, shakeY: 0 },
    ...extra,
  };
}

const sigbinEnemy = (pose: EnemySnapshot['pose']): EnemySnapshot => ({
  id: 1,
  type: 'sigbin',
  x: 100,
  y: 64,
  w: SIGBIN.width,
  h: SIGBIN.height,
  facing: -1,
  pose,
  hp: SIGBIN.hp,
  maxHp: SIGBIN.hp,
  alpha: 1,
  flash: 0,
  phase: 1,
});

describe('Sigbin view', () => {
  it('allocates one footprint slot per tuning cap, not a hardcoded pool', () => {
    const v = view();
    const prints = v.group.children.filter((c) => c.name === 'footprint');
    expect(prints).toHaveLength(SIGBIN.footprintCap);
    v.dispose();
  });

  it('draws the colour-blind-safe diamond on the Sigbin while the core is exposed', () => {
    const v = view();
    const boss = {
      engaged: true,
      hp: 12,
      maxHp: SIGBIN.hp,
      phase: 1,
      label: SIGBIN.label,
      weakPoint: { x: 100, y: 90, w: SIGBIN.width, h: SIGBIN.weakPoint.h },
      exposed: true,
      tells: [],
    };
    const s = snap({ boss, enemies: [sigbinEnemy('stunned')] });
    v.present(s, s, 0);
    expect(v.weakPointCue).toEqual({ shape: 'diamond', ring: 'white', pulsing: true });
    const hidden = snap({ boss: { ...boss, exposed: false } });
    v.present(s, hidden, 0);
    expect(v.weakPointCue).toBeNull();
    v.dispose();
  });

  it('tints the lunge through enemyHurtTint, so reduce-motion does not strobe', () => {
    const v = view();
    const s = snap({ enemies: [sigbinEnemy('windup')] });
    v.present(s, s, 0);
    const tint = enemyHurtTint(true, 0, false, ENEMY_TINT, PALETTE.neonMagenta);
    const colors: number[] = [];
    v.group.traverse((o) => {
      const mesh = o as { material?: { color?: { getHex: () => number } } };
      const hex = mesh.material?.color?.getHex?.();
      if (hex !== undefined) colors.push(hex);
    });
    expect(colors).toContain(tint);
    v.setReduceMotion(true);
    v.present(s, { ...s, tick: 1 }, 0);
    const steady = enemyHurtTint(true, 1, true, ENEMY_TINT, PALETTE.neonMagenta);
    const reduced: number[] = [];
    v.group.traverse((o) => {
      const mesh = o as { material?: { color?: { getHex: () => number } } };
      const hex = mesh.material?.color?.getHex?.();
      if (hex !== undefined) reduced.push(hex);
    });
    expect(reduced).toContain(steady);
    expect(steady).not.toBe(PALETTE.neonMagenta);
    v.dispose();
  });
});
