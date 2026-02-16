type StateConfig<S extends string> = {
  [K in S]?: {
    onEnter?: () => void;
    onUpdate?: (delta: number) => void;
    onExit?: () => void;
  };
};

export class StateMachine<S extends string> {
  private current: S;
  private readonly states: StateConfig<S>;

  constructor(initial: S, states: StateConfig<S>) {
    this.current = initial;
    this.states = states;
    this.states[initial]?.onEnter?.();
  }

  transition(next: S) {
    if (this.current === next) return;
    this.states[this.current]?.onExit?.();
    this.current = next;
    this.states[next]?.onEnter?.();
  }

  update(delta: number) {
    this.states[this.current]?.onUpdate?.(delta);
  }

  get state(): S { return this.current; }
  is(s: S): boolean { return this.current === s; }
}
