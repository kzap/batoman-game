import { describe, expect, it } from 'vitest';
import { Fsm } from '@core/sim/fsm';

type S = 'a' | 'b' | 'c';
interface Ctx {
  log: string[];
}

const machine = (): Fsm<S, Ctx> =>
  new Fsm<S, Ctx>(
    {
      a: { enter: (c) => c.log.push('enter a'), update: (_, t) => (t >= 2 ? 'b' : undefined), exit: (c) => c.log.push('exit a') },
      b: { enter: (c) => c.log.push('enter b'), update: () => undefined },
      c: { update: () => 'c' },
    },
    'a',
  );

describe('Fsm', () => {
  it('enters the initial state on the first update and transitions after the state asks', () => {
    const fsm = machine();
    const ctx: Ctx = { log: [] };
    fsm.update(ctx); // ticks 0
    fsm.update(ctx); // ticks 1
    expect(fsm.state).toBe('a');
    expect(fsm.ticks).toBe(2);
    fsm.update(ctx); // ticks 2 -> b
    expect(fsm.state).toBe('b');
    expect(fsm.ticks).toBe(0);
    expect(ctx.log).toEqual(['enter a', 'exit a', 'enter b']);
  });

  it('returning the current state is not a transition', () => {
    const fsm = new Fsm<S, Ctx>({ a: { update: () => 'a' }, b: { update: () => undefined }, c: { update: () => undefined } }, 'a');
    const ctx: Ctx = { log: [] };
    fsm.update(ctx);
    fsm.update(ctx);
    expect(fsm.ticks).toBe(2);
  });

  it('a state that transitions to itself by name every tick keeps its timer', () => {
    const fsm = new Fsm<S, Ctx>({ a: { update: () => 'c' }, b: { update: () => undefined }, c: { update: () => 'c' } }, 'a');
    const ctx: Ctx = { log: [] };
    fsm.update(ctx);
    fsm.update(ctx);
    fsm.update(ctx);
    expect(fsm.state).toBe('c');
    expect(fsm.ticks).toBe(2);
  });
});
