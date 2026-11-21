import type { InputFrame } from '@core/sim/input';
import { DEFAULT_BINDINGS, frameFromKeys, isCodeBound, type Bindings } from './bindings';

/**
 * Tracks held keys and produces the InputFrame the sim consumes each tick.
 * Which physical key means which button comes from the binding table; the sim
 * only ever sees the seven booleans. Listens on `window` so canvas focus is
 * not required.
 */
export class Keyboard {
  private bindings: Bindings = DEFAULT_BINDINGS;
  private readonly held = new Set<string>();
  /** Codes pressed since the last `frame()`; a tap shorter than one frame still reaches a tick. */
  private readonly latched = new Set<string>();
  private attached = false;

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.type === 'keydown') {
      if (e.repeat || !isCodeBound(this.bindings, e.code)) return;
      this.held.add(e.code);
      this.latched.add(e.code);
      e.preventDefault();
      return;
    }
    // Keyup still releases a code we latched, even if a rebind has since dropped it.
    if (!this.held.has(e.code) && !this.latched.has(e.code)) return;
    this.held.delete(e.code);
    e.preventDefault();
  };

  private readonly onBlur = (): void => this.held.clear();

  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
    for (const code of [...this.held]) if (!isCodeBound(bindings, code)) this.held.delete(code);
    for (const code of [...this.latched]) if (!isCodeBound(bindings, code)) this.latched.delete(code);
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Forget held and latched keys (after a pause or a screen change, so a key held through it does not fire). */
  reset(): void {
    this.held.clear();
    this.latched.clear();
  }

  frame(): InputFrame {
    const frame = frameFromKeys(this.bindings, [...this.held, ...this.latched]);
    this.latched.clear();
    return frame;
  }
}
