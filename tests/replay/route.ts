import { NO_INPUT, type InputFrame } from '@core/sim/input';
import type { Player } from '@game/player';
import { BOSS, NOVA, PLAYER, PROJECTILE } from '@game/tuning';
import type { EnemySnapshot, WorldSnapshot } from '@game/world';
import type { Policy } from './harness';

/**
 * A small language for scripted level routes. A route is a list of steps run
 * in order; each step supplies the input every tick until its `done`
 * condition fires, then the next step takes over. Steps read the live world,
 * so a route adapts to the exact tick things happen; only the inputs it
 * produces are recorded into the fixture.
 */

export interface Ctx {
  readonly snap: WorldSnapshot;
  readonly p: Player;
  readonly x: number;
  readonly right: number;
  readonly y: number;
  readonly grounded: boolean;
  readonly rising: boolean;
  readonly tick: number;
}

export interface Step {
  readonly name: string;
  /** Input for this tick. */
  input(c: Ctx): Partial<InputFrame>;
  /** True once the step has finished; the next step starts on the following tick. */
  done(c: Ctx): boolean;
}

type Dir = 1 | -1;

const dirInput = (dir: Dir): Partial<InputFrame> => (dir > 0 ? { right: true } : { left: true });
const past = (c: Ctx, dir: Dir, x: number): boolean => (dir > 0 ? c.x >= x : c.right <= x);

/** Hold a direction until the body's leading edge passes `x` (its left edge for right runs, right edge for left runs). */
export const run = (dir: Dir, untilX: number): Step => ({
  name: `run ${dir > 0 ? 'right' : 'left'} to ${untilX}`,
  // Holding jump while rising keeps a jump at full height without cutting it short.
  input: (c) => ({ ...dirInput(dir), jump: c.rising }),
  done: (c) => past(c, dir, untilX),
});

/** Wait, standing still, until a condition holds. */
export const waitUntil = (name: string, pred: (c: Ctx) => boolean): Step => ({
  name: `wait ${name}`,
  input: () => ({}),
  done: pred,
});

/** Press jump once and hold the direction until back on the ground. */
export function jump(dir: Dir): Step {
  let pressed = false;
  let left = false;
  return {
    name: `jump ${dir > 0 ? 'right' : 'left'}`,
    input: (c) => {
      const press = !pressed;
      pressed = true;
      if (!c.grounded) left = true;
      return { ...dirInput(dir), jump: press || c.rising };
    },
    done: (c) => left && c.grounded,
  };
}

/** Jump, then dash mid-air once the rise slows, holding the direction until landing. Clears gaps a jump cannot. */
export function dashJump(dir: Dir): Step {
  let pressed = false;
  let dashed = false;
  let left = false;
  return {
    name: `dash-jump ${dir > 0 ? 'right' : 'left'}`,
    input: (c) => {
      const press = !pressed;
      pressed = true;
      if (!c.grounded) left = true;
      // Dash at the apex: the dash freezes vertical speed, so the higher it starts the longer the glide.
      const dashNow = left && !dashed && c.p.vy <= 0;
      if (dashNow) dashed = true;
      return { ...dirInput(dir), jump: press || (c.rising && !dashed), dash: dashNow };
    },
    done: (c) => left && dashed && c.grounded && !c.p.dashing,
  };
}

/** Drop through the one-way platform underfoot (down + jump) and land below. */
export function dropThrough(): Step {
  let pressed = false;
  let left = false;
  const startY = { y: NaN };
  return {
    name: 'drop through',
    input: (c) => {
      if (Number.isNaN(startY.y)) startY.y = c.y;
      const press = !pressed;
      pressed = true;
      if (!c.grounded) left = true;
      return { down: press, jump: press };
    },
    done: (c) => left && c.grounded && c.y < startY.y,
  };
}

/** Wait until a moving solid's min corner is within `tol` of the given coordinates (either or both). */
export const waitMover = (index: number, at: { x?: number; y?: number }, tol = 4): Step =>
  waitUntil(`mover ${index} at ${JSON.stringify(at)}`, (c) => {
    const m = c.snap.movingSolids[index];
    if (!m) return false;
    const xOk = at.x === undefined || Math.abs(m.x - at.x) <= tol;
    const yOk = at.y === undefined || Math.abs(m.y - at.y) <= tol;
    return xOk && yOk;
  });

/**
 * Wait until a moving solid is descending and within `within` px above `y`, its
 * lower stop: it is about to settle and pause there, so a walk onto it now lands
 * inside the pause instead of on a platform already leaving.
 */
export function waitMoverSettling(index: number, y: number, within = 4): Step {
  let prevY = -Infinity;
  return waitUntil(`mover ${index} settling at ${y}`, (c) => {
    const m = c.snap.movingSolids[index];
    if (!m) return false;
    const descending = m.y < prevY;
    prevY = m.y;
    return descending && m.y >= y && m.y - y <= within;
  });
}

/** Ride whatever is underfoot until the body's x passes `untilX` (the platform carries the player). */
export const ride = (dir: Dir, untilX: number): Step => ({
  name: `ride to ${untilX}`,
  input: () => ({}),
  done: (c) => past(c, dir, untilX),
});

/**
 * Climb a shaft by wall kicks: jump at the wall on `dir`, and each time the body
 * touches a wall kick off it toward the other one. Done when standing at or above
 * `untilY` (a one-way rung across the shaft top catches the last kick).
 */
export function wallClimb(dir: Dir, untilY: number): Step {
  let toward = dir;
  let heldJump = false;
  return {
    name: `wall-climb to ${untilY}`,
    input: (c) => {
      let jump: boolean;
      if (c.grounded) {
        // On the floor (or a ledge partway up): jump at the `dir` wall to start or restart the climb.
        toward = dir;
        jump = !heldJump;
      } else if (c.p.wallDir !== 0 && !heldJump) {
        // Touching a wall with the button up: kick. The kick itself flips the direction.
        toward = -c.p.wallDir as Dir;
        jump = true;
      } else if (c.p.wallDir !== 0) {
        // Still holding from the last press: release for a tick so the next press registers.
        jump = false;
      } else {
        // Hold jump through the rise for full height.
        jump = c.rising;
      }
      heldJump = jump;
      return { ...dirInput(toward), jump };
    },
    done: (c) => c.grounded && c.y >= untilY,
  };
}

/** Tap fire once (for the shooting pose in replays), then move on immediately. */
export const fire = (): Step => ({ name: 'fire', input: () => ({ fire: true }), done: () => true });

// ---- Combat -----------------------------------------------------------------

/** Ticks between plasma taps; the cooldown is 10, so 12 keeps every tap a real shot. */
const TAP_EVERY = 12;
/** An enemy shot this many seconds from arriving at body height is jumped: late enough that a whole burst passes under one jump. */
const SHOT_ALARM_S = 0.16;
/** A rushing boss this many seconds away is jumped: the body is above its lowered collider from 0.13 s to 0.47 s into the jump. */
const RUSH_ALARM_S = 0.2;
/** Room to keep from the boss while it winds up a rush, so the jump over it has time to rise. */
const RUSH_ROOM_PX = 150;
const SHOT_H = 10;
/**
 * Enemies further than this above or below the feet are on another storey and not this fight's business:
 * the enemies' own `sightHeight` (128) plus a rung of slack, so a drone diving toward us still counts.
 */
const FIGHT_BAND = 160;

/** `e` overlaps the span from the player's near edge to `untilX` on the `dir` side. */
const spansAhead = (c: Ctx, e: EnemySnapshot, untilX: number, dir: Dir): boolean =>
  dir > 0 ? e.x + e.w > c.x && e.x < untilX : e.x < c.right && e.x + e.w > untilX;

/** Enemies alive between the player and `untilX`, on the `dir` side, within a storey of the feet. */
const foesAhead = (c: Ctx, untilX: number, dir: Dir): EnemySnapshot[] =>
  c.snap.enemies.filter((e) => e.pose !== 'death' && Math.abs(e.y - c.y) <= FIGHT_BAND && spansAhead(c, e, untilX, dir));

/** A grounded plasma tap would cross this enemy's body (the shot is `PROJECTILE.height` tall around the muzzle line). */
const inLine = (c: Ctx, e: EnemySnapshot): boolean => {
  const y = c.y + PROJECTILE.muzzleY;
  const half = PROJECTILE.height / 2;
  return y + half > e.y && y - half < e.y + e.h;
};

/** One tick of the direction key when not already facing `x`; the body barely moves but turns to shoot that way. */
const faceToward = (c: Ctx, x: number): Partial<InputFrame> => {
  const right = x > c.x + PLAYER.width / 2;
  return right === c.p.facing > 0 ? {} : right ? { right: true } : { left: true };
};

/** An enemy shot about to reach the standing body. */
const shotIncoming = (c: Ctx): boolean =>
  c.snap.projectiles.some((p) => {
    if (p.kind !== 'enemy' || p.vx === 0) return false;
    const gap = p.vx > 0 ? c.x - p.x : p.x - c.right;
    const soon = gap > 0 && gap / Math.abs(p.vx) < SHOT_ALARM_S;
    return soon && p.y + SHOT_H > c.y && p.y - SHOT_H < c.y + PLAYER.height;
  });

/**
 * Stand and shoot everything between here and `untilX` (to the right, or to
 * the left with `dir` -1): tap fire whenever a live enemy is in the line of
 * fire, jump incoming shots, otherwise wait (drones dive, cloaked ambushers
 * decloak). Done when nothing is left ahead.
 */
export function fight(untilX: number, dir: Dir = 1): Step {
  let sinceTap = TAP_EVERY;
  let airborne = false;
  return {
    name: `fight to ${untilX}`,
    input: (c) => {
      sinceTap++;
      const foes = foesAhead(c, untilX, dir);
      const target = foes.find((e) => e.alpha >= 1 && inLine(c, e));
      if (shotIncoming(c) && c.grounded) {
        airborne = true;
        return { jump: true };
      }
      if (airborne && !c.grounded) return { jump: c.rising };
      airborne = false;
      if (target && sinceTap >= TAP_EVERY) {
        sinceTap = 0;
        return { ...faceToward(c, target.x + target.w / 2), fire: true };
      }
      return {};
    },
    // Wait for stray shots to land too: an enemy's last shot can outlive it.
    done: (c) => foesAhead(c, untilX, dir).length === 0 && !c.snap.projectiles.some((p) => p.kind === 'enemy'),
  };
}

/**
 * The Level 1 boss: hold position, jump its shots, jump over a rush (the boss
 * drops low while rushing), tap plasma while it is hittable, and charge a nova
 * while it is stunned so the weak point takes the big hit.
 */
export function bossFight(): Step {
  let sinceTap = TAP_EVERY;
  let charging = 0;
  let airborne = false;
  return {
    name: 'boss fight',
    input: (c) => {
      sinceTap++;
      const boss = c.snap.boss;
      const body = c.snap.enemies.find((e) => e.type === 'aswang');
      if (!boss || !body || boss.hp <= 0) return {};
      const dx = body.x + body.w / 2 - (c.x + PLAYER.width / 2);
      // A rush coming at us: jump so the apex is over the lowered body.
      const gap = dx > 0 ? body.x - c.right : c.x - (body.x + body.w);
      if (body.pose === 'rush' && c.grounded && gap > 0 && gap / BOSS.rushSpeed < RUSH_ALARM_S) {
        airborne = true;
        return { jump: true };
      }
      // Winding up next to us: back off so the jump has room to rise.
      if (body.pose === 'windup' && gap < RUSH_ROOM_PX) return dx > 0 ? { left: true } : { right: true };
      if (shotIncoming(c) && c.grounded && charging === 0) {
        airborne = true;
        return { jump: true };
      }
      if (airborne && !c.grounded) return { jump: c.rising };
      airborne = false;
      // Stunned: charge and release a nova at the exposed core.
      if (boss.exposed && charging < NOVA.chargeTicks + 2) {
        charging++;
        return { fire: charging <= NOVA.chargeTicks + 1 };
      }
      if (charging > 0) charging = 0;
      // Face the boss only as a one-tick nudge, so the body does not walk into it.
      const nudge = faceToward(c, body.x + body.w / 2);
      if (body.alpha >= 1 && body.pose !== 'shift' && body.pose !== 'rush' && sinceTap >= TAP_EVERY) {
        sinceTap = 0;
        return { ...nudge, fire: true };
      }
      return nudge;
    },
    done: (c) => c.snap.boss === null || c.snap.boss.hp <= 0,
  };
}

/** Turn a step list into a policy. Once the list is exhausted the policy runs right, which reaches most exits. */
export function route(steps: readonly Step[], onStep?: (step: Step, c: Ctx) => void): Policy {
  let i = 0;
  return (world, snap) => {
    const p = world.player;
    const b = p.body;
    const c: Ctx = { snap, p, x: b.x, right: b.right, y: b.y, grounded: p.grounded, rising: p.vy > 0, tick: snap.tick };
    const step = steps[i];
    if (!step) return { ...NO_INPUT, right: true };
    const frame: InputFrame = { ...NO_INPUT, ...step.input(c) };
    if (step.done(c)) {
      onStep?.(step, c);
      i++;
    }
    return frame;
  };
}
