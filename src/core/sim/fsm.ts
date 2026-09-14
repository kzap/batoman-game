/**
 * Minimal finite state machine for enemy behaviour. States are names; each
 * has an `update` that runs once per tick and may return the next state.
 * Time in a state is counted in ticks, so behaviour replays exactly.
 */

export interface StateDef<S extends string, C> {
  /** Runs once when the state is entered (including the initial state, on the first update). */
  enter?(ctx: C): void;
  /** Runs every tick; `ticks` is how many ticks the state has already run. Return a state name to transition. */
  update(ctx: C, ticks: number): S | undefined;
  exit?(ctx: C): void;
}

export class Fsm<S extends string, C> {
  private current: S;
  private ticksInState = 0;
  private entered = false;

  constructor(
    private readonly states: Readonly<Record<S, StateDef<S, C>>>,
    initial: S,
  ) {
    this.current = initial;
  }

  get state(): S {
    return this.current;
  }

  /** Ticks the current state has run, before this tick's update. */
  get ticks(): number {
    return this.ticksInState;
  }

  update(ctx: C): void {
    if (!this.entered) {
      this.entered = true;
      this.states[this.current].enter?.(ctx);
    }
    const next = this.states[this.current].update(ctx, this.ticksInState);
    this.ticksInState++;
    if (next === undefined || next === this.current) return;
    this.states[this.current].exit?.(ctx);
    this.current = next;
    this.ticksInState = 0;
    this.states[next].enter?.(ctx);
  }
}
