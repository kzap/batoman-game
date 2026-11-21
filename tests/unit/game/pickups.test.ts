import { describe, expect, it } from 'vitest';
import level1 from '@content/levels/level-1.json';
import { parseLevel, type LevelJson, type PickupJson } from '@content/level';
import { NO_INPUT, type InputFrame } from '@core/sim/input';
import { applyPickup } from '@game/pickups';
import { Health } from '@game/health';
import { PICKUP, PLAYER } from '@game/tuning';
import { World } from '@game/world';

const JUMP: InputFrame = { ...NO_INPUT, jump: true };

function flat(pickups: readonly PickupJson[] | undefined, extra: Partial<LevelJson> = {}): LevelJson {
  return {
    version: 1,
    id: 'pickups',
    name: 'Pickups',
    width: 800,
    height: 400,
    tileSize: 32,
    spawn: { x: 100, y: 64 },
    exit: { x: 720, y: 0, w: 64, h: 400 },
    solids: [{ x: 0, y: 0, w: 800, h: 64 }],
    oneWay: [],
    movingSolids: [],
    hazards: [],
    deathZones: [],
    checkpoints: [],
    enemies: [],
    ...extra,
    ...(pickups === undefined ? {} : { pickups }),
  };
}

/** Sits inside the standing body at the spawn (feet 100, 64; body 24 x 48). */
const IN_BODY: PickupJson = { kind: 'hp-up', x: 90, y: 80, w: 16, h: 16 };
/** Above the head (top of the standing body is 112). A jump reaches it; walking does not. */
const ABOVE: PickupJson = { kind: 'hp-up', x: 92, y: 128, w: 16, h: 16 };

const kinds = (w: World): string[] => {
  const got: string[] = [];
  w.events.on('pickup', (e) => got.push(e.kind));
  return got;
};

describe('HP Up', () => {
  it('at full HP raises max and current by the tuning amount, once', () => {
    const w = new World(flat([IN_BODY]), 1);
    const got = kinds(w);
    expect(w.snapshot().pickups).toHaveLength(1);
    w.step();
    expect(got).toEqual(['hp-up']);
    expect(w.health.max).toBe(PLAYER.maxHp + PICKUP.hpUp.hearts);
    expect(w.health.hp).toBe(w.health.max);
    expect(w.snapshot().player.maxHp).toBe(w.health.max);
    expect(w.snapshot().pickups).toEqual([]);
    for (let i = 0; i < 20; i++) w.step();
    expect(got).toEqual(['hp-up']);
    expect(w.health.max).toBe(PLAYER.maxHp + PICKUP.hpUp.hearts);
  });

  it('heals one and raises the cap when HP is not full, including during i-frames', () => {
    const w = new World(flat([IN_BODY]), 1);
    expect(w.damage(1, 1)).toBe(true);
    expect(w.health.hp).toBe(2);
    expect(w.health.invulnerable).toBe(true);
    w.player.body.place(IN_BODY.x, IN_BODY.y);
    w.step();
    expect(w.health.max).toBe(4);
    expect(w.health.hp).toBe(3);
  });

  it('collects two hearts in one tick', () => {
    const w = new World(flat([IN_BODY, { ...IN_BODY, x: 96 }]), 1);
    const got = kinds(w);
    w.step();
    expect(got).toEqual(['hp-up', 'hp-up']);
    expect(w.health.max).toBe(PLAYER.maxHp + 2 * PICKUP.hpUp.hearts);
    expect(w.health.hp).toBe(w.health.max);
  });

  it('a jump collects a heart above the head; standing and walking do not', () => {
    const standing = new World(flat([ABOVE]), 1);
    for (let i = 0; i < 20; i++) standing.step();
    for (let i = 0; i < 40; i++) standing.step({ ...NO_INPUT, right: true });
    expect(standing.health.max).toBe(PLAYER.maxHp);
    expect(standing.snapshot().pickups).toHaveLength(1);

    const jumping = new World(flat([ABOVE]), 1);
    const got = kinds(jumping);
    for (let i = 0; i < 30 && jumping.health.max === PLAYER.maxHp; i++) jumping.step(JUMP);
    expect(got).toEqual(['hp-up']);
    expect(jumping.health.hp).toBe(PLAYER.maxHp + PICKUP.hpUp.hearts);
    expect(jumping.snapshot().pickups).toEqual([]);
  });

  it('a dead player does not collect, and the heart is still there after respawn', () => {
    const pit = { x: 300, y: 64, w: 48, h: 80 };
    const heart: PickupJson = { kind: 'hp-up', x: 308, y: 80, w: 16, h: 16 };
    const w = new World(flat([heart], { deathZones: [pit] }), 1);
    const got = kinds(w);
    w.player.body.place(pit.x + 4, 64);
    w.step();
    expect(w.player.dead).toBe(true);
    expect(got).toEqual([]);
    expect(w.health.max).toBe(PLAYER.maxHp);
    expect(w.snapshot().pickups).toHaveLength(1);
    for (let i = 0; i < PLAYER.respawnTicks + 5; i++) w.step();
    expect(w.player.dead).toBe(false);
    expect(w.health.max).toBe(PLAYER.maxHp);
    expect(w.health.hp).toBe(PLAYER.maxHp);
    expect(w.snapshot().pickups).toHaveLength(1);
    expect(got).toEqual([]);
  });

  it('the heart and the raised cap both survive a checkpoint respawn', () => {
    const pit = { x: 500, y: 64, w: 48, h: 80 };
    const checkpoint = { id: 1, x: 200, y: 64, w: 32, h: 96 };
    const w = new World(flat([IN_BODY], { deathZones: [pit], checkpoints: [checkpoint] }), 1);
    w.step();
    expect(w.health.max).toBe(4);
    w.player.body.place(checkpoint.x, checkpoint.y);
    w.step();
    const respawn: { x: number; y: number }[] = [];
    w.events.on('respawn', (e) => respawn.push({ x: e.x, y: e.y }));
    w.player.body.place(pit.x + 4, 64);
    for (let i = 0; i < PLAYER.respawnTicks + 5; i++) w.step();
    expect(w.player.dead).toBe(false);
    expect(respawn).toEqual([{ x: checkpoint.x + checkpoint.w / 2, y: checkpoint.y }]);
    expect(w.health.max).toBe(4);
    expect(w.health.hp).toBe(4);
    expect(w.lives).toBe(2);
    expect(w.snapshot().pickups).toEqual([]);
    expect(w.snapshot().player.hp).toBe(4);
    expect(w.snapshot().player.maxHp).toBe(4);
  });

  it('applyPickup refuses a dead body and does not change the cap', () => {
    const health = new Health(PLAYER.maxHp, PLAYER.invulnTicks);
    health.kill();
    expect(applyPickup('hp-up', { health })).toBe(false);
    expect(health.max).toBe(PLAYER.maxHp);
    expect(health.hp).toBe(0);
  });
});

describe('Level 1 HP Up', () => {
  const level = parseLevel(level1);

  it('sits above the opening, so a walk misses it and a jump takes it once', () => {
    expect(level.pickups).toEqual([{ kind: 'hp-up', x: 92, y: 128, w: 16, h: 16 }]);

    const walking = new World(level, 1);
    for (let i = 0; i < 30; i++) walking.step({ ...NO_INPUT, right: true });
    expect(walking.health.max).toBe(PLAYER.maxHp);
    expect(walking.snapshot().pickups).toHaveLength(1);

    const jumping = new World(level, 1);
    const got = kinds(jumping);
    for (let i = 0; i < 30 && jumping.health.max === PLAYER.maxHp; i++) jumping.step(JUMP);
    expect(got).toEqual(['hp-up']);
    expect(jumping.health.hp).toBe(PLAYER.maxHp + PICKUP.hpUp.hearts);
    expect(jumping.health.max).toBe(jumping.health.hp);
    expect(jumping.snapshot().pickups).toEqual([]);
    for (let i = 0; i < 20; i++) jumping.step(JUMP);
    expect(got).toEqual(['hp-up']);
  });
});
