import { describe, expect, it } from 'vitest';
import type { AtlasFrame, AtlasJson } from '@content/atlas';
import { SIGBIN } from '@game/tuning';
import type { EnemySnapshot, WorldSnapshot } from '@game/world';
import { EntityView } from '@render/entity-view';
import { enemyHurtTint, PRESENTATION } from '@render/motion';
import { PALETTE } from '@render/stage';
import { Mesh, MeshBasicMaterial, Texture } from 'three';

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

/** Atlas quads only. The diamond lives under `weak-point` and is not the lunge tint. */
function bodyMaterials(v: EntityView): MeshBasicMaterial[] {
  const found: MeshBasicMaterial[] = [];
  v.group.traverse((o) => {
    if (o.parent?.name === 'weak-point') return;
    if (!(o instanceof Mesh)) return;
    const mat = o.material;
    if (mat instanceof MeshBasicMaterial) found.push(mat);
  });
  return found;
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
    const idle = snap({ enemies: [sigbinEnemy('idle')] });
    v.present(idle, idle, 0);
    // The placeholder sheet is the only quad in this tint. The diamond never is.
    const body = bodyMaterials(v).filter((m) => m.color.getHex() === ENEMY_TINT);
    expect(body).toHaveLength(1);
    const sigbin = body[0]!;

    const flashOn = snap({ tick: 0, enemies: [sigbinEnemy('windup')] });
    v.present(idle, flashOn, 0);
    expect(sigbin.color.getHex()).toBe(enemyHurtTint(true, 0, false, ENEMY_TINT, PALETTE.neonMagenta));

    const offTick = PRESENTATION.hurtFlash.halfPeriodTicks;
    const flashOff = snap({ tick: offTick, enemies: [sigbinEnemy('windup')] });
    v.present(flashOn, flashOff, 0);
    expect(sigbin.color.getHex()).toBe(enemyHurtTint(true, offTick, false, ENEMY_TINT, PALETTE.neonMagenta));
    expect(sigbin.color.getHex()).toBe(ENEMY_TINT);

    v.setReduceMotion(true);
    v.present(flashOff, flashOff, 0);
    const steady = enemyHurtTint(true, offTick, true, ENEMY_TINT, PALETTE.neonMagenta);
    expect(sigbin.color.getHex()).toBe(steady);
    expect(sigbin.color.getHex()).not.toBe(PALETTE.neonMagenta);
    expect(sigbin.color.getHex()).not.toBe(ENEMY_TINT);
    v.dispose();
  });
});
