/**
 * One tick of player intent. Produced by the app from the keyboard (or by a
 * replay file) and consumed by the sim. Held buttons are booleans; presses are
 * derived by the sim from consecutive frames, so a replay needs no extra data.
 */
export interface InputFrame {
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly jump: boolean;
  readonly fire: boolean;
  readonly dash: boolean;
}

export const NO_INPUT: InputFrame = { left: false, right: false, up: false, down: false, jump: false, fire: false, dash: false };

export type InputButton = keyof InputFrame;

export const INPUT_BUTTONS: readonly InputButton[] = ['left', 'right', 'up', 'down', 'jump', 'fire', 'dash'];

/** Compact form for replay files: one bit per button in INPUT_BUTTONS order. */
export function packInput(f: InputFrame): number {
  let bits = 0;
  INPUT_BUTTONS.forEach((b, i) => {
    if (f[b]) bits |= 1 << i;
  });
  return bits;
}

export function unpackInput(bits: number): InputFrame {
  const f: Record<InputButton, boolean> = { ...NO_INPUT };
  INPUT_BUTTONS.forEach((b, i) => {
    f[b] = (bits & (1 << i)) !== 0;
  });
  return f;
}

/** Horizontal intent in {-1, 0, 1}; both directions held cancel out. */
export const inputAxis = (f: InputFrame): number => (f.right ? 1 : 0) - (f.left ? 1 : 0);

/**
 * Edge detector for press/release events. `update` once per tick with the new
 * frame, then query `pressed`/`released` for that tick.
 */
export class InputEdges {
  private prev: InputFrame = NO_INPUT;
  private cur: InputFrame = NO_INPUT;

  update(frame: InputFrame): void {
    this.prev = this.cur;
    this.cur = frame;
  }

  get frame(): InputFrame {
    return this.cur;
  }

  held(b: InputButton): boolean {
    return this.cur[b];
  }

  pressed(b: InputButton): boolean {
    return this.cur[b] && !this.prev[b];
  }

  released(b: InputButton): boolean {
    return !this.cur[b] && this.prev[b];
  }
}
