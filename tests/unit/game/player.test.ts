import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '@core/sim/collision';
import { InputEdges, NO_INPUT, type InputFrame } from '@core/sim/input';
import { Player, type PlayerActions } from '@game/player';
import { PLAYER } from '@game/tuning';

const F = (over: Partial<InputFrame> = {}): InputFrame => ({ ...NO_INPUT, ...over });

class Rig {
  readonly cw = new CollisionWorld();
  readonly player: Player;
  readonly input = new InputEdges();
  readonly actions: PlayerActions[] = [];

  constructor(x = 100, y = 32) {
    this.cw.addSolid({ x: 0, y: 0, w: 400, h: 32 }); // floor, top at 32
    this.player = new Player(x, y);
  }

  tick(frame: InputFrame = NO_INPUT, n = 1): PlayerActions {
    let last!: PlayerActions;
    for (let i = 0; i < n; i++) {
      this.input.update(frame);
      last = this.player.update(this.input, this.cw);
      this.actions.push(last);
    }
    return last;
  }

  /** Run until the player is grounded again (or `max` ticks). Returns the peak y reached. */
  flyUntilLanded(frame: InputFrame, max = 400): number {
    let peak = this.player.body.y;
    for (let i = 0; i < max; i++) {
      this.tick(frame);
      peak = Math.max(peak, this.player.body.y);
      if (this.player.grounded && i > 2) break;
    }
    return peak;
  }
}

describe('running', () => {
  it('accelerates to run speed and stops when released', () => {
    const r = new Rig();
    r.tick(F({ right: true }), 30);
    expect(r.player.vx).toBe(PLAYER.runSpeed);
    expect(r.player.pose).toBe('run');
    expect(r.player.facing).toBe(1);
    const x = r.player.body.x;
    r.tick(NO_INPUT, 30);
    expect(r.player.vx).toBe(0);
    expect(r.player.body.x).toBeGreaterThan(x);
    expect(r.player.pose).toBe('idle');
  });

  it('stops at a wall and zeroes horizontal speed', () => {
    const r = new Rig();
    r.cw.addSolid({ x: 200, y: 32, w: 32, h: 100 });
    r.tick(F({ right: true }), 120);
    expect(r.player.body.right).toBe(200);
    expect(r.player.vx).toBe(0);
  });
});

describe('jumping', () => {
  it('reaches roughly v^2/2g when held and much less on a tap', () => {
    const full = new Rig();
    full.tick(F({ jump: true }));
    expect(full.actions[0]!.jumped).toBe(true);
    const fullPeak = full.flyUntilLanded(F({ jump: true })) - 32;
    const expected = (PLAYER.jumpSpeed * PLAYER.jumpSpeed) / (2 * PLAYER.gravity);
    expect(fullPeak).toBeGreaterThan(expected * 0.95); // apex float adds a little
    expect(fullPeak).toBeLessThan(expected * 1.3);

    const tap = new Rig();
    tap.tick(F({ jump: true }), 3);
    const tapPeak = tap.flyUntilLanded(NO_INPUT) - 32;
    expect(tapPeak).toBeLessThan(fullPeak * 0.5);
    expect(tapPeak).toBeGreaterThan(8);
  });

  it('does not re-jump while jump stays held, and lands with landed=true', () => {
    const r = new Rig();
    r.flyUntilLanded(F({ jump: true }));
    expect(r.actions.filter((a) => a.jumped)).toHaveLength(1);
    expect(r.actions.at(-1)!.landed).toBe(true);
  });

  it('allows a coyote jump shortly after walking off a ledge, not later', () => {
    const mk = (delay: number) => {
      const r = new Rig(399, 32); // one pixel of the feet still on the floor
      r.tick(F({ right: true }), 4); // step off
      expect(r.player.grounded).toBe(false);
      r.tick(F({ right: true }), delay);
      return r.tick(F({ right: true, jump: true })).jumped;
    };
    expect(mk(PLAYER.coyoteTicks - 4)).toBe(true);
    expect(mk(PLAYER.coyoteTicks + 2)).toBe(false);
  });

  it('buffers a jump pressed just before landing', () => {
    const r = new Rig(100, 60);
    r.tick(NO_INPUT, 1);
    // Fall until within a few ticks of the floor, then press.
    while (r.player.body.y > 40) r.tick(NO_INPUT);
    r.tick(F({ jump: true }));
    expect(r.player.grounded).toBe(false);
    let jumped = false;
    for (let i = 0; i < PLAYER.jumpBufferTicks; i++) jumped ||= r.tick(F({ jump: true })).jumped;
    expect(jumped).toBe(true);
  });

  it('slips past a ceiling corner instead of bonking', () => {
    const r = new Rig();
    r.cw.addSolid({ x: 0, y: 100, w: 102, h: 16 }); // ceiling ending 2px into the player (x 100..124)
    r.flyUntilLanded(F({ jump: true }));
    expect(r.player.body.x).toBe(102);
  });
});

describe('air control and apex', () => {
  it('accelerates slower in the air and keeps momentum when input stops', () => {
    const r = new Rig(100, 200);
    r.tick(F({ right: true }), 10);
    const airVx = r.player.vx;
    const g = new Rig();
    g.tick(F({ right: true }), 10);
    expect(airVx).toBeLessThan(g.player.vx);
    expect(airVx).toBeCloseTo((10 * PLAYER.airAccel) / 120, 5);
    r.tick(NO_INPUT, 10);
    expect(r.player.vx).toBeCloseTo(airVx - (10 * PLAYER.airDecel) / 120, 5);
  });

  it('bleeds overspeed back to run speed instead of clamping', () => {
    const r = new Rig(100, 200);
    r.player.vx = PLAYER.dashSpeed;
    r.tick(F({ right: true }));
    expect(r.player.vx).toBeCloseTo(PLAYER.dashSpeed - PLAYER.overspeedDecel / 120, 5);
    expect(r.player.vx).toBeGreaterThan(PLAYER.runSpeed);
  });

  it('applies reduced gravity near the apex only while jump is held', () => {
    const held = new Rig();
    held.tick(F({ jump: true }));
    while (held.player.vy >= PLAYER.apexThreshold) held.tick(F({ jump: true }));
    const vyHeld = held.player.vy;
    held.tick(F({ jump: true }));
    const dropHeld = vyHeld - held.player.vy;

    const released = new Rig();
    released.tick(F({ jump: true }));
    while (released.player.vy >= PLAYER.apexThreshold) released.tick(F({ jump: true }));
    released.player.vy = vyHeld; // same starting point, then let go of jump
    released.tick(F({ jump: false }));
    const dropReleased = vyHeld - Math.max(released.player.vy, 0);
    expect(dropHeld).toBeCloseTo((PLAYER.gravity * PLAYER.apexGravityScale) / 120, 3);
    expect(dropReleased).toBeGreaterThan(dropHeld);
  });

  it('falls faster after an early release, and knockback is not affected', () => {
    const cut = new Rig();
    cut.tick(F({ jump: true }), 4);
    cut.tick(NO_INPUT); // release -> clamp to jumpReleaseSpeed and mark jumpCut
    const v0 = cut.player.vy;
    cut.tick(NO_INPUT);
    expect(v0 - cut.player.vy).toBeCloseTo((PLAYER.gravity * PLAYER.fastFallScale) / 120, 3);

    const hurt = new Rig();
    hurt.player.knockback(1, hurt.cw);
    const k0 = hurt.player.vy;
    hurt.tick(NO_INPUT);
    expect(k0 - hurt.player.vy).toBeCloseTo(PLAYER.gravity / 120, 3);
  });
});

describe('walls', () => {
  const rig = () => {
    const r = new Rig(200 - 24, 200);
    r.cw.addSolid({ x: 200, y: 32, w: 32, h: 300 });
    return r;
  };

  it('slides slowly while pushing into a wall in the air', () => {
    const r = rig();
    r.tick(F({ right: true }), 40);
    expect(r.player.pose).toBe('wallslide');
    expect(r.player.vy).toBe(-PLAYER.wallSlideSpeed);
    const free = new Rig(100, 200);
    free.tick(NO_INPUT, 40);
    expect(free.player.vy).toBeLessThan(-PLAYER.wallSlideSpeed);
  });

  it('accepts a wall jump shortly after leaving the wall', () => {
    const r = rig();
    r.tick(F({ right: true }), 10);
    r.tick(F({ left: true }), PLAYER.wallCoyoteTicks - 2); // let go of the wall
    expect(r.player.wallDir).toBe(0);
    expect(r.tick(F({ left: true, jump: true })).wallJumped).toBe(true);
    const late = rig();
    late.tick(F({ right: true }), 10);
    late.tick(F({ left: true }), PLAYER.wallCoyoteTicks + 2);
    expect(late.tick(F({ left: true, jump: true })).wallJumped).toBe(false);
  });

  it('kicks off the wall away from it and ignores input during the lockout', () => {
    const r = rig();
    r.tick(F({ right: true }), 10);
    const a = r.tick(F({ right: true, jump: true }));
    expect(a.wallJumped).toBe(true);
    expect(r.player.vx).toBe(-PLAYER.wallJumpX);
    expect(r.player.facing).toBe(-1);
    r.tick(F({ right: true, jump: true }), PLAYER.wallJumpLockTicks - 2);
    expect(r.player.vx).toBeLessThan(0);
    r.tick(F({ right: true, jump: true }), 30);
    expect(r.player.vx).toBeGreaterThan(0);
  });
});

describe('dash', () => {
  it('moves at dash speed with gravity off, once per airtime, then cools down', () => {
    const r = new Rig(100, 200);
    r.tick(NO_INPUT, 5);
    const y = r.player.body.y;
    const a = r.tick(F({ dash: true, right: true }));
    expect(a.dashed).toBe(true);
    expect(r.player.vx).toBe(PLAYER.dashSpeed);
    r.tick(F({ right: true }), PLAYER.dashTicks - 2);
    expect(r.player.body.y).toBe(y);
    expect(r.player.pose).toBe('dash');
    r.tick(F({ right: true }), 3);
    expect(r.player.dashing).toBe(false);
    expect(r.tick(F({ dash: true, right: true })).dashed).toBe(false); // spent until landing
    r.flyUntilLanded(F({ right: true }));
    r.tick(NO_INPUT, PLAYER.dashCooldownTicks);
    expect(r.tick(F({ dash: true })).dashed).toBe(true);
    expect(r.player.facing).toBe(1); // dash follows facing when no direction is held
  });
});

describe('dash i-frames', () => {
  it('is invulnerable for the whole dash and not after', () => {
    const r = new Rig();
    r.tick(F({ dash: true }));
    for (let i = 0; i < PLAYER.dashTicks - 1; i++) {
      expect(r.player.invulnerable).toBe(true);
      r.tick(NO_INPUT);
    }
    r.tick(NO_INPUT);
    expect(r.player.invulnerable).toBe(false);
  });
});

describe('crouch and slide', () => {
  it('halves the hitbox and refuses to stand under a ledge', () => {
    const r = new Rig();
    r.cw.addSolid({ x: 80, y: 32 + PLAYER.crouchHeight + 4, w: 100, h: 16 }); // low ceiling over the player
    r.tick(F({ down: true }), 2);
    expect(r.player.body.h).toBe(PLAYER.crouchHeight);
    expect(r.player.pose).toBe('crouch');
    r.tick(NO_INPUT, 2);
    expect(r.player.body.h).toBe(PLAYER.crouchHeight); // still under the ledge
    r.tick(F({ right: true }), 160); // crouch-walk out from under it
    expect(r.player.body.h).toBe(PLAYER.height);
  });

  it('slides with low friction when crouching at speed', () => {
    const r = new Rig();
    r.tick(F({ right: true }), 30);
    r.tick(F({ right: true, down: true }));
    expect(r.player.pose).toBe('slide');
    r.tick(F({ down: true }), 20);
    expect(r.player.vx).toBeGreaterThan(PLAYER.runSpeed - 21 * (PLAYER.slideDecel / 120) - 1);
    expect(r.player.vx).toBeLessThan(PLAYER.runSpeed);
  });
});

describe('one-way platforms', () => {
  it('lands on one and drops through with down + jump', () => {
    const r = new Rig(100, 150);
    r.cw.addSolid({ x: 50, y: 100, w: 200, h: 8 }, true); // top at 108
    r.tick(NO_INPUT, 60);
    expect(r.player.body.y).toBe(108);
    expect(r.player.grounded).toBe(true);
    const a = r.tick(F({ down: true, jump: true }));
    expect(a.jumped).toBe(false);
    r.tick(F({ down: true }), 30);
    expect(r.player.body.y).toBeLessThan(100);
  });
});

describe('fire', () => {
  it('fires on press with a cooldown, never on hold', () => {
    const r = new Rig();
    expect(r.tick(F({ fire: true })).fired).toBe(true);
    expect(r.tick(F({ fire: true }), 30).fired).toBe(false);
    expect(r.actions.filter((a) => a.fired)).toHaveLength(1);
    r.tick(NO_INPUT);
    expect(r.tick(F({ fire: true })).fired).toBe(true);
    r.tick(NO_INPUT);
    expect(r.tick(F({ fire: true })).fired).toBe(false); // inside cooldown
  });
});
