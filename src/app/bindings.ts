import { INPUT_BUTTONS, NO_INPUT, type InputButton, type InputFrame } from '@core/sim/input';

/** How many physical keys one action can keep. The defaults fit; a longer list is rejected on load. */
export const MAX_BINDS = 4;

/**
 * Keys the shell (confirm, back, pause, music, sfx, reduce-motion) and the debug overlay own.
 * They are not gameplay binds, so a remap cannot swallow pause, the menus, or R.
 */
export const RESERVED_CODES: readonly string[] = ['Escape', 'Enter', 'KeyP', 'KeyM', 'KeyN', 'KeyR', 'Backquote'];

const CODE_OK =
  /^(?:Key[A-Z]|Digit[0-9]|Arrow(?:Left|Right|Up|Down)|Space|Shift(?:Left|Right)|Numpad[0-9]|Numpad(?:Add|Subtract|Decimal)|Comma|Period|Slash|Semicolon|Quote|Bracket(?:Left|Right)|Backslash|Minus|Equal|Backspace)$/;

export type Bindings = Readonly<Record<InputButton, readonly string[]>>;

/**
 * Documented defaults. ArrowUp is listed under both Move up and Jump, so Up
 * jumps. The sim does not alias buttons: a frame with only `up` set does not jump.
 */
export const DEFAULT_BINDINGS: Bindings = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  fire: ['KeyZ', 'KeyJ'],
  dash: ['KeyX', 'KeyK', 'ShiftLeft', 'ShiftRight'],
};

export const ACTION_LABELS: Readonly<Record<InputButton, string>> = {
  left: 'Move left',
  right: 'Move right',
  up: 'Move up',
  down: 'Move down',
  jump: 'Jump',
  fire: 'Fire',
  dash: 'Dash',
};

/** Rows on the Controls screen, in order. `reset` restores {@link DEFAULT_BINDINGS}. */
export const CONTROL_ROWS = [...INPUT_BUTTONS, 'reset'] as const;
export type ControlRow = (typeof CONTROL_ROWS)[number];

export function isBindable(code: string): boolean {
  return !RESERVED_CODES.includes(code) && CODE_OK.test(code);
}

export function isCodeBound(bindings: Bindings, code: string): boolean {
  for (const button of INPUT_BUTTONS) {
    if (bindings[button].includes(code)) return true;
  }
  return false;
}

/**
 * Add `code` to `action`, or remove it when it is already there.
 * Returns null for a reserved or unknown code, a fifth key, or removing an action's last key.
 * A code may sit on more than one action; toggling it here does not touch the others.
 */
export function toggleBinding(bindings: Bindings, action: InputButton, code: string): Bindings | null {
  if (!isBindable(code)) return null;
  const current = bindings[action];
  if (current.includes(code)) {
    if (current.length === 1) return null;
    return { ...bindings, [action]: current.filter((c) => c !== code) };
  }
  if (current.length >= MAX_BINDS) return null;
  return { ...bindings, [action]: [...current, code] };
}

/** Buttons held by any of `codes`. A key listed on two actions sets both. No button implies another. */
export function frameFromKeys(bindings: Bindings, codes: Iterable<string>): InputFrame {
  const down = new Set(codes);
  const f: Record<InputButton, boolean> = { ...NO_INPUT };
  for (const button of INPUT_BUTTONS) {
    for (const code of bindings[button]) {
      if (down.has(code)) {
        f[button] = true;
        break;
      }
    }
  }
  return f;
}

const LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'RShift',
  Backspace: 'Bksp',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  NumpadAdd: 'Num+',
  NumpadSubtract: 'Num-',
  NumpadDecimal: 'Num.',
};

/** Short label for a `KeyboardEvent.code`, for the Controls screen. */
export function keyLabel(code: string): string {
  const named = LABELS[code];
  if (named) return named;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num${code.slice(6)}`;
  return code;
}

/** Validate a save blob's bindings. Anything unexpected yields null and the caller keeps the defaults. */
export function parseBindings(raw: unknown): Bindings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const out = {} as Record<InputButton, string[]>;
  for (const button of INPUT_BUTTONS) {
    const list = o[button];
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_BINDS) return null;
    const codes: string[] = [];
    for (const code of list) {
      if (typeof code !== 'string' || !isBindable(code) || codes.includes(code)) return null;
      codes.push(code);
    }
    out[button] = codes;
  }
  return out;
}
