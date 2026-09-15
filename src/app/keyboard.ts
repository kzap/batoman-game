import { NO_INPUT, type InputButton, type InputFrame } from '@core/sim/input';

/** Physical key (KeyboardEvent.code) to sim button. Arrows/WASD move, Space/W/Up jump, Z/J fire, X/K/Shift dash. */
const BINDINGS: Readonly<Record<string, InputButton>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyW: 'jump',
  KeyZ: 'fire',
  KeyJ: 'fire',
  KeyX: 'dash',
  KeyK: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
};

/**
 * Tracks held keys and produces the InputFrame the sim consumes each tick.
 * Listens on `window` so focus on the canvas is not required.
 */
export class Keyboard {
  private readonly held = new Set<InputButton>();
  /** Buttons pressed since the last `frame()`; keeps a tap shorter than one frame from vanishing. */
  private readonly latched = new Set<InputButton>();
  private readonly onKey = (e: KeyboardEvent): void => {
    const button = BINDINGS[e.code];
    if (!button) return;
    if (e.type === 'keydown') {
      this.held.add(button);
      this.latched.add(button);
    } else {
      this.held.delete(button);
    }
    e.preventDefault();
  };
  private readonly onBlur = (): void => this.held.clear();

  attach(): void {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Forget held and latched buttons (after a pause or a screen change, so a key held through it does not fire). */
  reset(): void {
    this.held.clear();
    this.latched.clear();
  }

  frame(): InputFrame {
    const f: Record<InputButton, boolean> = { ...NO_INPUT };
    for (const b of this.held) f[b] = true;
    for (const b of this.latched) f[b] = true;
    this.latched.clear();
    // Up doubles as jump on the arrow layout.
    if (f.up) f.jump = true;
    return f;
  }
}
