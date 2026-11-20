import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLevel } from '@content/level';
import { NO_INPUT, type InputFrame } from '@core/sim/input';
import { Sigbin } from '@game/enemies';
import { dropCore, exposedMultiplier, exposedOnlyDamage, PhaseGate } from '@game/enemies/boss-kit';
import { PLAYER, PROJECTILE, SIGBIN } from '@game/tuning';
import { World } from '@game/world';
import type { LevelJson, EnemySpawnJson } from '@content/level';

/** A flat arena. The boss stands at centre x=1500; the player spawn is far to the left. */
function arena(enemies: EnemySpawnJson[], extra: Partial<LevelJson> = {}): LevelJson {
  return {
    version: 1,
    id: 'arena',
    name: 'Arena',
    width: 2000,
    height: 800,
    tileSize: 32,
    spawn: { x: 200, y: 64 },
    exit: { x: 1900, y: 64, w: 64, h: 400 },
    solids: [
      { x: 0, y: 0, w: 2000, h: 64 },
      { x: 0, y: 64, w: 16, h: 736 },
      { x: 1984, y: 64, w: 16, h: 736 },
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

/** Steps until `pred`, returning how many steps that took. */
function until(w: World, pred: () => boolean, cap = 4000): number {
  let n = 0;
  while (!pred() && n < cap) {
    w.step();
    n++;
  }
  return n;
}

function sigbinWorld(): { w: World; s: Sigbin } {
  const w = new World(arena([{ type: 'sigbin', x: 1500, y: 64 }]), 1);
  const s = w.boss;
  if (!(s instanceof Sigbin)) throw new Error('expected a sigbin');
  return { w, s };
}

/** Stand the player close enough to engage, on the boss's floor, facing right (the default). */
function engage(w: World): void {
  w.player.body.place(1100, 64);
  w.step();
}

describe('boss kit', () => {
  it('advances one phase per committed shift and only queues when the current threshold is crossed', () => {
    const gate = new PhaseGate([12, 6]);
    expect(gate.phase).toBe(1);
    gate.note(13);
    expect(gate.pending).toBe(false);
    gate.note(12);
    expect(gate.pending).toBe(true);
    gate.commit();
    expect(gate.phase).toBe(2);
    expect(gate.pending).toBe(false);
    gate.note(6);
    gate.commit();
    expect(gate.phase).toBe(3);
  });

  it('splits the ASWANG double-damage rule from the Sigbin exposed-only rule', () => {
    expect(exposedMultiplier(1, false, true, 2)).toBe(1);
    expect(exposedMultiplier(1, true, false, 2)).toBe(1);
    expect(exposedMultiplier(1, true, true, 2)).toBe(2);
    expect(exposedOnlyDamage(3, false, true, 2)).toBe(0);
    expect(exposedOnlyDamage(3, true, false, 2)).toBe(0);
    expect(exposedOnlyDamage(3, true, true, 2)).toBe(6);
  });

  it('drops a core from the spine to the shot line in whole pixels', () => {
    expect(dropCore(SIGBIN.weakPointRaised, SIGBIN.weakPoint, 0, SIGBIN.coreSettleTicks)).toEqual(SIGBIN.weakPointRaised);
    expect(dropCore(SIGBIN.weakPointRaised, SIGBIN.weakPoint, SIGBIN.coreSettleTicks, SIGBIN.coreSettleTicks)).toEqual(SIGBIN.weakPoint);
    const mid = dropCore(SIGBIN.weakPointRaised, SIGBIN.weakPoint, SIGBIN.coreSettleTicks / 2, SIGBIN.coreSettleTicks);
    expect(mid.y).toBeGreaterThan(SIGBIN.weakPoint.y);
    expect(mid.y).toBeLessThan(SIGBIN.weakPointRaised.y);
  });
});

describe('Sigbin', () => {
  it('stands at half the camera height and stays dormant, cloaked and unhittable until the player is near on its storey', () => {
    const { w, s } = sigbinWorld();
    expect(s.body.h).toBe(SIGBIN.height);
    expect(SIGBIN.height).toBe(188);
    expect(w.exitOpen).toBe(false);
    w.step();
    expect(s.state).toBe('dormant');
    expect(s.engaged).toBe(false);
    expect(s.hittable).toBe(false);
    expect(s.alpha).toBeGreaterThanOrEqual(SIGBIN.cloakedAlpha);
    expect(s.alpha).toBeLessThanOrEqual(SIGBIN.shimmerAlpha);
    expect(s.hit(5, 1, true)).toBe(0);
    expect(w.snapshot().boss).toMatchObject({ engaged: false, exposed: false, label: 'SIGBIN UNIT', hp: SIGBIN.hp, maxHp: SIGBIN.hp });
    // Same horizontal range, one storey up: still dormant.
    const ledgeY = 64 + SIGBIN.sightHeight + 40;
    const above = new World(arena([{ type: 'sigbin', x: 1500, y: 64 }], { oneWay: [{ x: 1000, y: ledgeY - 8, w: 200, h: 8 }] }), 1);
    above.player.body.place(1100, ledgeY);
    run(above, 30);
    expect(above.boss!.state).toBe('dormant');
  });

  it('shimmers while cloaked, walks backward, and leaves prints that point the wrong way', () => {
    const { w, s } = sigbinWorld();
    engage(w);
    expect(s.state).toBe('cloak');
    const alphas = new Set<number>();
    let sawPrint = false;
    for (let i = 0; i < SIGBIN.shimmerPeriod; i++) {
      const x0 = s.body.centerX;
      w.step();
      alphas.add(s.alpha);
      expect(s.alpha).toBeGreaterThanOrEqual(SIGBIN.cloakedAlpha);
      expect(s.alpha).toBeLessThanOrEqual(SIGBIN.shimmerAlpha);
      // Stalking toward the rear pocket, which is to the player's left, so travel is left and the head points right.
      if (s.body.centerX < x0) expect(s.facing).toBe(1);
      const prints = w.snapshot().boss!.tells;
      for (const p of prints) {
        sawPrint = true;
        expect(p.kind).toBe('footprint');
        expect(p.dir).toBe(1);
        expect(p.age).toBeGreaterThanOrEqual(0);
      }
    }
    expect(alphas.size).toBeGreaterThan(1);
    expect(sawPrint).toBe(true);
    // A print fades. Age it out without caring where the stalk has got to.
    run(w, SIGBIN.footprintLife + 2);
    const aged = w.snapshot().boss!.tells.filter((p) => p.age >= SIGBIN.footprintLife);
    expect(aged).toEqual([]);
  });

  it('telegraphs when it reaches the pocket, before the give-up timer', () => {
    const { w, s } = sigbinWorld();
    engage(w);
    const n = until(w, () => s.state === 'telegraph');
    expect(n).toBeLessThan(SIGBIN.stalkMaxTicks[0]!);
    expect(n).toBeGreaterThan(10);
    // The pocket is on the boss's side of the player, and the stalk stops there.
    const playerMid = 1100 + PLAYER.width / 2;
    expect(Math.abs(s.body.centerX - (playerMid + SIGBIN.rearOffset))).toBeLessThanOrEqual(SIGBIN.rearSlack + 1);
  });

  it('telegraphs for the phase length, decloaking, then lunges a fixed distance and opens the core', () => {
    const { w, s } = sigbinWorld();
    engage(w);
    // Pull the player out of reach so the stalk cannot arrive and the give-up timer is what fires.
    w.player.body.place(80, 64);
    const cloakTicks = until(w, () => s.state === 'telegraph');
    // The entering tick does not run the new state's update, and the update that
    // sees `ticks === limit` is the one that leaves. Cloak therefore lasts limit + 1 ticks.
    expect(cloakTicks).toBe(SIGBIN.stalkMaxTicks[0]! + 1);
    expect(s.pose).toBe('windup');
    expect(s.hittable).toBe(false);
    const alpha0 = s.alpha;
    run(w, Math.floor(SIGBIN.telegraphTicks[0]! / 2));
    expect(s.state).toBe('telegraph');
    expect(s.alpha).toBeGreaterThan(alpha0);
    const x0 = s.body.centerX;
    const toLunge = until(w, () => s.state === 'lunge');
    expect(toLunge).toBe(SIGBIN.telegraphTicks[0]! - Math.floor(SIGBIN.telegraphTicks[0]! / 2) + 1);
    expect(s.pose).toBe('rush');
    expect(s.alpha).toBe(1);
    expect(s.hittable).toBe(true);
    // The strike is solid but not punishable.
    expect(s.hit(1, 1, true)).toBe(0);
    expect(s.health.hp).toBe(SIGBIN.hp);
    const toRecover = until(w, () => s.state === 'recover');
    expect(toRecover).toBe(SIGBIN.lungeTicks + 1);
    const travelled = Math.abs(s.body.centerX - x0);
    expect(travelled).toBeGreaterThan(SIGBIN.lungeSpeed * (SIGBIN.lungeTicks - 1) * (1 / 120) - 2);
    expect(travelled).toBeLessThan(SIGBIN.lungeSpeed * SIGBIN.lungeTicks * (1 / 120) + 2);
    expect(s.exposed).toBe(true);
    expect(s.pose).toBe('stunned');
    expect(w.snapshot().boss!.exposed).toBe(true);
    // The core starts on the spine, above a standing shot.
    expect(s.weakPointRect().y).toBe(s.body.y + SIGBIN.weakPointRaised.y);
  });

  it('takes damage only on the settled weak point, and a standing shot misses while the core is still on the spine', () => {
    const { w, s } = sigbinWorld();
    engage(w);
    until(w, () => s.state === 'recover');
    // A body hit during the window is nothing. Only the core counts, and only while it is open.
    expect(s.hit(1, 1, false)).toBe(0);
    expect(s.health.hp).toBe(SIGBIN.hp);
    const muzzleTop = s.body.y + PROJECTILE.muzzleY + PROJECTILE.height / 2;
    const muzzleBot = s.body.y + PROJECTILE.muzzleY - PROJECTILE.height / 2;
    expect(s.weakPointRect().y).toBeGreaterThan(muzzleTop);
    // Standing plasma, just clear of the body. It is inside the wide torso while the core is still dropping.
    w.player.facing = 1;
    w.player.body.place(s.body.x - 80, s.body.y);
    w.step({ ...NO_INPUT, fire: true });
    expect(s.health.hp).toBe(SIGBIN.hp);
    let connectedAt = -1;
    for (let i = 0; i < 80 && s.health.hp === SIGBIN.hp; i++) {
      w.step();
      if (s.health.hp < SIGBIN.hp) connectedAt = i;
    }
    expect(connectedAt).toBeGreaterThan(10);
    const core = s.weakPointRect();
    expect(core.y).toBeLessThan(muzzleTop);
    expect(core.y + core.h).toBeGreaterThan(muzzleBot);
    expect(s.health.hp).toBe(SIGBIN.hp - PROJECTILE.damage * SIGBIN.weakPointMultiplier);
    // Once it has rested, the rect is the standing shot line.
    run(w, SIGBIN.coreSettleTicks);
    expect(s.weakPointRect().y).toBe(s.body.y + SIGBIN.weakPoint.y);
  });

  it('shifts phase at the hp thresholds, is invulnerable during the shift, and telegraphs faster in the next phase', () => {
    const { w, s } = sigbinWorld();
    const phases: number[] = [];
    w.events.on('bossPhase', (p) => phases.push(p.phase));
    engage(w);
    until(w, () => s.state === 'recover');
    run(w, SIGBIN.coreSettleTicks);
    // One punish of 6 (a core hit of 3, doubled) crosses the first threshold exactly.
    expect(s.hit(3, 1, true)).toBe(6);
    expect(s.health.hp).toBe(SIGBIN.phaseHp[0]);
    w.step();
    expect(s.state).toBe('shift');
    expect(s.hittable).toBe(false);
    expect(s.hit(5, 1, true)).toBe(0);
    expect(s.phase).toBe(2);
    const toCloak = until(w, () => s.state === 'cloak');
    expect(phases).toEqual([2]);
    expect(toCloak).toBe(SIGBIN.phaseShiftTicks + 1);
    // It backs off before the next tell, so the lunge does not start in the player's face.
    const toTelegraph = until(w, () => s.state === 'telegraph');
    expect(toTelegraph).toBeGreaterThan(0);
    const phase2Telegraph = until(w, () => s.state !== 'telegraph');
    expect(phase2Telegraph).toBe(SIGBIN.telegraphTicks[1]! + 1);
    expect(s.state).toBe('lunge');
    // And phase 3 is faster again.
    until(w, () => s.state === 'recover');
    run(w, SIGBIN.coreSettleTicks);
    expect(s.hit(3, 1, true)).toBe(6);
    w.step();
    expect(s.phase).toBe(3);
    expect(s.state).toBe('shift');
    until(w, () => s.state === 'telegraph');
    const phase3Telegraph = until(w, () => s.state !== 'telegraph');
    expect(phase3Telegraph).toBe(SIGBIN.telegraphTicks[2]! + 1);
    expect(SIGBIN.telegraphTicks[2]).toBeLessThan(SIGBIN.telegraphTicks[1]!);
  });

  it('dies from a core hit, which opens the exit and fires bossDefeated, and the bar stays up through the death clip', () => {
    const { w, s } = sigbinWorld();
    let defeated = false;
    w.events.on('bossDefeated', () => (defeated = true));
    engage(w);
    until(w, () => s.exposed);
    run(w, SIGBIN.coreSettleTicks);
    expect(s.weakPointRect().y).toBe(s.body.y + SIGBIN.weakPoint.y);
    // Leave a killing blow of hp without going through hit(), so the phase shift is not queued early.
    s.health.hp = PROJECTILE.damage * SIGBIN.weakPointMultiplier;
    w.player.facing = 1;
    w.player.body.place(s.body.x - 80, s.body.y);
    w.step({ ...NO_INPUT, fire: true });
    run(w, 30);
    expect(s.alive).toBe(false);
    expect(s.exposed).toBe(false);
    expect(defeated).toBe(true);
    expect(w.exitOpen).toBe(true);
    expect(w.snapshot().boss).not.toBeNull();
    expect(w.snapshot().boss!.hp).toBe(0);
    w.player.body.place(1900, 64);
    w.step();
    expect(w.status).toBe('complete');
  });

  it('replays two runs to the same snapshots, prints included', () => {
    const play = (): ReturnType<World['snapshot']>[] => {
      const { w, s } = sigbinWorld();
      const snaps = [];
      engage(w);
      until(w, () => s.state === 'recover');
      for (let i = 0; i < 50; i++) {
        w.step();
        snaps.push(w.snapshot());
      }
      return snaps;
    };
    expect(play()).toEqual(play());
  });

  it('is the Level 3 boss, and the gallery exit stays shut while it lives', () => {
    const level = parseLevel(JSON.parse(readFileSync(resolve('src/content/levels/level-3.json'), 'utf8')), 'level-3');
    const placed = level.enemies.find((e) => e.type === 'sigbin');
    expect(placed).toEqual({ type: 'sigbin', x: 3424, y: 768 });
    const w = new World(level, 1);
    expect(w.boss).toBeInstanceOf(Sigbin);
    expect(w.boss!.body.h).toBe(188);
    expect(w.exitOpen).toBe(false);
    w.player.body.place(level.exit.x, level.exit.y);
    w.step();
    expect(w.status).toBe('playing');
  });
});
