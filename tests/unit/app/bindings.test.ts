import { describe, expect, it } from 'vitest';
import { INPUT_BUTTONS, packInput } from '@core/sim/input';
import {
  ACTION_LABELS,
  CONTROL_ROWS,
  DEFAULT_BINDINGS,
  MAX_BINDS,
  RESERVED_CODES,
  frameFromKeys,
  isBindable,
  keyLabel,
  parseBindings,
  toggleBinding,
} from '@app/bindings';

describe('default bindings', () => {
  it('matches the documented keyboard layout and stays inside the cap', () => {
    expect(DEFAULT_BINDINGS).toEqual({
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp'],
      down: ['ArrowDown', 'KeyS'],
      jump: ['Space', 'KeyW', 'ArrowUp'],
      fire: ['KeyZ', 'KeyJ'],
      dash: ['KeyX', 'KeyK', 'ShiftLeft', 'ShiftRight'],
    });
    for (const button of INPUT_BUTTONS) {
      expect(DEFAULT_BINDINGS[button].length).toBeGreaterThan(0);
      expect(DEFAULT_BINDINGS[button].length).toBeLessThanOrEqual(MAX_BINDS);
      for (const code of DEFAULT_BINDINGS[button]) expect(isBindable(code)).toBe(true);
    }
    for (const code of RESERVED_CODES) expect(isBindable(code)).toBe(false);
    expect(parseBindings(DEFAULT_BINDINGS)).toEqual(DEFAULT_BINDINGS);
  });

  it('resolves the default keys to buttons, and Up jumps only because it is also bound to jump', () => {
    expect(frameFromKeys(DEFAULT_BINDINGS, ['ArrowRight'])).toMatchObject({ right: true, jump: false });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['KeyA', 'KeyD'])).toMatchObject({ left: true, right: true });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['KeyA'])).toMatchObject({ left: true });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['Space'])).toMatchObject({ jump: true, up: false });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['KeyW'])).toMatchObject({ jump: true, up: false });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['ArrowUp'])).toMatchObject({ up: true, jump: true });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['KeyS'])).toMatchObject({ down: true });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['KeyZ'])).toMatchObject({ fire: true });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['ShiftLeft'])).toMatchObject({ dash: true });
    expect(frameFromKeys(DEFAULT_BINDINGS, ['ShiftRight'])).toMatchObject({ dash: true });
    // Releasing one of two keys bound to the same action leaves the action held.
    expect(frameFromKeys(DEFAULT_BINDINGS, ['ArrowLeft', 'KeyA']).left).toBe(true);
    expect(frameFromKeys(DEFAULT_BINDINGS, ['KeyA']).left).toBe(true);
    expect(frameFromKeys(DEFAULT_BINDINGS, []).left).toBe(false);
  });
});

describe('toggleBinding', () => {
  it('adds a key, removes it again, and will not empty an action or pass the cap', () => {
    const added = toggleBinding(DEFAULT_BINDINGS, 'jump', 'KeyQ');
    expect(added?.jump).toEqual(['Space', 'KeyW', 'ArrowUp', 'KeyQ']);
    const removed = toggleBinding(added!, 'jump', 'Space');
    expect(removed?.jump).toEqual(['KeyW', 'ArrowUp', 'KeyQ']);
    let jump = removed!;
    jump = toggleBinding(jump, 'jump', 'KeyW')!;
    jump = toggleBinding(jump, 'jump', 'ArrowUp')!;
    expect(jump.jump).toEqual(['KeyQ']);
    expect(toggleBinding(jump, 'jump', 'KeyQ')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'dash', 'KeyQ')).toBeNull();
    const dash = toggleBinding(DEFAULT_BINDINGS, 'dash', 'KeyX');
    expect(dash?.dash).toEqual(['KeyK', 'ShiftLeft', 'ShiftRight']);
    expect(toggleBinding(dash!, 'dash', 'KeyQ')?.dash).toEqual(['KeyK', 'ShiftLeft', 'ShiftRight', 'KeyQ']);
  });

  it('does not steal a key that is also bound to another action', () => {
    const next = toggleBinding(DEFAULT_BINDINGS, 'fire', 'ArrowUp');
    expect(next?.fire).toEqual(['KeyZ', 'KeyJ', 'ArrowUp']);
    expect(next?.up).toEqual(['ArrowUp']);
    expect(next?.jump).toEqual(['Space', 'KeyW', 'ArrowUp']);
  });

  it('rejects reserved, unknown and duplicate-looking codes without changing the table', () => {
    expect(toggleBinding(DEFAULT_BINDINGS, 'jump', 'Escape')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'jump', 'Enter')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'jump', 'KeyP')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'jump', 'KeyM')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'jump', 'KeyN')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'jump', 'KeyR')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'fire', 'KeyR')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'jump', 'Backquote')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'jump', 'ControlLeft')).toBeNull();
    expect(toggleBinding(DEFAULT_BINDINGS, 'fire', 'NotAKey')).toBeNull();
  });

  it('a rebound jump key sets jump and leaves Up as only the up bit', () => {
    let jump = toggleBinding(DEFAULT_BINDINGS, 'jump', 'KeyQ')!;
    jump = toggleBinding(jump, 'jump', 'Space')!;
    jump = toggleBinding(jump, 'jump', 'KeyW')!;
    jump = toggleBinding(jump, 'jump', 'ArrowUp')!;
    expect(frameFromKeys(jump, ['KeyQ'])).toMatchObject({ jump: true, up: false });
    expect(frameFromKeys(jump, ['ArrowUp'])).toMatchObject({ up: true, jump: false });
    expect(frameFromKeys(jump, ['Space']).jump).toBe(false);
    // Packed bits stay the jump bit, the same bit a replay would store.
    expect(packInput(frameFromKeys(jump, ['KeyQ']))).toBe(packInput(frameFromKeys(DEFAULT_BINDINGS, ['Space'])));
  });
});

describe('parseBindings', () => {
  it('rejects a missing button, an empty list, a reserved code, a duplicate and a fifth key', () => {
    expect(parseBindings(null)).toBeNull();
    expect(parseBindings({ ...DEFAULT_BINDINGS, jump: [] })).toBeNull();
    expect(parseBindings({ ...DEFAULT_BINDINGS, fire: ['Escape'] })).toBeNull();
    expect(parseBindings({ ...DEFAULT_BINDINGS, dash: ['KeyR'] })).toBeNull();
    expect(parseBindings({ ...DEFAULT_BINDINGS, left: ['KeyA', 'KeyA'] })).toBeNull();
    expect(parseBindings({ ...DEFAULT_BINDINGS, dash: ['KeyX', 'KeyK', 'ShiftLeft', 'ShiftRight', 'KeyQ'] })).toBeNull();
    const missing = { ...DEFAULT_BINDINGS } as Record<string, unknown>;
    delete missing['fire'];
    expect(parseBindings(missing)).toBeNull();
  });

  it('accepts a custom table and ignores nothing that would drop a real button', () => {
    const custom = { ...DEFAULT_BINDINGS, jump: ['KeyQ'] };
    expect(parseBindings(custom)).toEqual(custom);
  });
});

describe('key labels', () => {
  it('names the default keys the way the controls screen shows them', () => {
    expect(keyLabel('ArrowLeft')).toBe('Left');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('KeyZ')).toBe('Z');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('ShiftRight')).toBe('RShift');
    expect(keyLabel('Digit5')).toBe('5');
    expect(keyLabel('Numpad3')).toBe('Num3');
    expect(ACTION_LABELS.jump).toBe('Jump');
    expect(CONTROL_ROWS).toHaveLength(INPUT_BUTTONS.length + 1);
    expect(CONTROL_ROWS.at(-1)).toBe('reset');
  });
});
