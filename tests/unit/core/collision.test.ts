import { describe, expect, it } from 'vitest';
import { Body, CollisionWorld } from '@core/sim/collision';

const world = (): CollisionWorld => {
  const w = new CollisionWorld();
  w.addSolid({ x: 0, y: 0, w: 320, h: 32 }); // floor, top at y=32
  w.addSolid({ x: 160, y: 32, w: 32, h: 96 }); // wall at x=160..192
  return w;
};

describe('Body remainders', () => {
  it('accumulates sub-pixel motion until a whole pixel is reached', () => {
    const w = world();
    const b = new Body(10, 32, 24, 48);
    for (let i = 0; i < 3; i++) w.moveX(b, 0.3);
    expect(b.x).toBe(11); // 0.9 rounds to 1
    expect(b.rx).toBeCloseTo(-0.1);
    w.moveX(b, 0.1);
    expect(b.x).toBe(11);
    expect(b.rx).toBeCloseTo(0);
  });

  it('drops the remainder when it hits something', () => {
    const w = world();
    const b = new Body(130, 32, 24, 48);
    expect(w.moveX(b, 10.4)).toBe(true);
    expect(b.right).toBe(160);
    expect(b.rx).toBe(0);
  });
});

describe('moveX / moveY against solids', () => {
  it('stops flush against a wall and reports the solid', () => {
    const w = world();
    const b = new Body(100, 32, 24, 48);
    let hit = 0;
    expect(w.moveX(b, 100, () => hit++)).toBe(true);
    expect(b.right).toBe(160);
    expect(hit).toBe(1);
  });

  it('lands on the floor and reports ground', () => {
    const w = world();
    const b = new Body(10, 100, 24, 48);
    expect(w.moveY(b, -200)).toBe(true);
    expect(b.y).toBe(32);
    expect(w.groundUnder(b)).not.toBeNull();
    expect(w.wallBeside(b, 1)).toBeNull();
    b.place(136, 32);
    expect(w.wallBeside(b, 1)?.x).toBe(160);
  });

  it('moves freely through empty space', () => {
    const w = world();
    const b = new Body(10, 32, 24, 48);
    expect(w.moveY(b, 20)).toBe(false);
    expect(b.y).toBe(52);
  });
});

describe('one-way platforms', () => {
  const setup = () => {
    const w = new CollisionWorld();
    w.addSolid({ x: 0, y: 64, w: 100, h: 8 }, true); // top at 72
    return w;
  };

  it('blocks a body falling from above', () => {
    const w = setup();
    const b = new Body(10, 100, 24, 48);
    expect(w.moveY(b, -100)).toBe(true);
    expect(b.y).toBe(72);
    expect(w.groundUnder(b)?.oneWay).toBe(true);
  });

  it('does not block upward or horizontal motion, nor a body already inside it', () => {
    const w = setup();
    const b = new Body(10, 20, 24, 48); // overlapping the platform from below
    expect(w.moveY(b, 100)).toBe(false);
    expect(b.y).toBe(120);
    const c = new Body(-30, 66, 24, 48); // feet below the top edge
    expect(w.moveX(c, 60)).toBe(false);
    expect(w.moveY(c, -10)).toBe(false);
  });

  it('lets a body drop through when asked', () => {
    const w = setup();
    const b = new Body(10, 72, 24, 48);
    expect(w.moveY(b, -10, undefined, { ignoreOneWay: true })).toBe(false);
    expect(b.y).toBe(62);
  });
});

describe('ceiling corner correction', () => {
  it('slips sideways past a ceiling edge when the overlap is small', () => {
    const w = new CollisionWorld();
    w.addSolid({ x: 0, y: 100, w: 50, h: 20 }); // ceiling ends at x=50
    const b = new Body(47, 40, 24, 48); // 3px under the ceiling's right end
    expect(w.moveY(b, 30, undefined, { ceilingCorrection: 4 })).toBe(false);
    expect(b.x).toBe(50);
    expect(b.y).toBe(70);
  });

  it('does not slip when the overlap exceeds the allowance', () => {
    const w = new CollisionWorld();
    w.addSolid({ x: 0, y: 100, w: 50, h: 20 });
    const b = new Body(40, 40, 24, 48);
    expect(w.moveY(b, 30, undefined, { ceilingCorrection: 4 })).toBe(true);
    expect(b.top).toBe(100);
  });
});

describe('moving solids', () => {
  it('carries a rider horizontally and vertically', () => {
    const w = new CollisionWorld();
    const plat = w.addSolid({ x: 0, y: 0, w: 64, h: 16 });
    const b = new Body(20, 16, 24, 48);
    expect(w.isRiding(b, plat)).toBe(true);
    w.moveSolid(plat, 5, 3, [b]);
    expect([b.x, b.y]).toEqual([25, 19]);
    w.moveSolid(plat, 0, -7, [b]);
    expect(b.y).toBe(12);
    expect(w.isRiding(b, plat)).toBe(true);
  });

  it('pushes a body it moves into, and squishes it against another solid', () => {
    const w = new CollisionWorld();
    w.addSolid({ x: 100, y: 0, w: 16, h: 100 }); // wall
    const pusher = w.addSolid({ x: 0, y: 0, w: 32, h: 100 });
    const b = new Body(40, 0, 24, 48);
    const squished: Body[] = [];
    w.moveSolid(pusher, 10, 0, [b], (x) => squished.push(x));
    expect(b.x).toBe(42);
    expect(squished).toEqual([]);
    w.moveSolid(pusher, 40, 0, [b], (x) => squished.push(x));
    expect(b.right).toBe(100);
    expect(squished).toEqual([b]);
  });

  it('a rider stopped by a wall is left behind', () => {
    const w = new CollisionWorld();
    w.addSolid({ x: 60, y: 16, w: 16, h: 100 });
    const plat = w.addSolid({ x: 0, y: 0, w: 64, h: 16 });
    const b = new Body(30, 16, 24, 48);
    w.moveSolid(plat, 20, 0, [b]);
    expect(b.right).toBe(60);
    expect(plat.x).toBe(20);
  });
});
