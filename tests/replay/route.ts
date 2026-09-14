import { NO_INPUT, type InputFrame } from '@core/sim/input';
import type { Player } from '@game/player';
import type { WorldSnapshot } from '@game/world';
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

/** Ride whatever is underfoot until the body's x passes `untilX` (the platform carries the player). */
export const ride = (dir: Dir, untilX: number): Step => ({
  name: `ride to ${untilX}`,
  input: () => ({}),
  done: (c) => past(c, dir, untilX),
});

/** Tap fire once (for the shooting pose in replays), then move on immediately. */
export const fire = (): Step => ({ name: 'fire', input: () => ({ fire: true }), done: () => true });

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
