import { describe, expect, it } from 'vitest';
import {
  advanceBeat,
  advanceCutscene,
  currentBeat,
  cutscenesEnabledFromQuery,
  holdElapsed,
  skipBeats,
  skipCutscene,
  startCutscene,
} from '@app/shell/cutscene';
import { DEFAULT_HOLD_MS, type CutsceneScript } from '@content/cutscene';

const script: CutsceneScript = {
  version: 1,
  id: 'level-1',
  beats: [
    { speaker: 'Ando', text: 'one', holdMs: 1000 },
    { speaker: 'Sari-sari', text: 'two', holdMs: 500 },
    { speaker: 'Ando', text: 'three' },
  ],
};

describe('cutscene beat index helpers', () => {
  it('advanceBeat and skipBeats match the stateful runner', () => {
    expect(advanceBeat(0, 5)).toEqual({ index: 1, done: false });
    expect(advanceBeat(4, 5)).toEqual({ index: 5, done: true });
    expect(advanceBeat(5, 5)).toEqual({ index: 5, done: true });
    expect(advanceBeat(0, 0)).toEqual({ index: 0, done: true });
    expect(skipBeats(5)).toEqual({ index: 5, done: true });
    expect(skipBeats(0)).toEqual({ index: 0, done: true });
  });
});

describe('cutscene runner', () => {
  it('starts on the first beat and advances until done', () => {
    let state = startCutscene(script, 0);
    expect(state.done).toBe(false);
    expect(currentBeat(state)?.text).toBe('one');

    state = advanceCutscene(state, 10);
    expect(currentBeat(state)?.text).toBe('two');
    state = advanceCutscene(state, 20);
    expect(currentBeat(state)?.text).toBe('three');
    state = advanceCutscene(state, 30);
    expect(state.done).toBe(true);
    expect(currentBeat(state)).toBeNull();
  });

  it('skip-all finishes from any beat', () => {
    const mid = advanceCutscene(startCutscene(script, 0), 5);
    const skipped = skipCutscene(mid);
    expect(skipped.done).toBe(true);
    expect(currentBeat(skipped)).toBeNull();
    expect(skipCutscene(skipped)).toEqual(skipped);
  });

  it('holdElapsed follows holdMs, and the default when omitted', () => {
    const state = startCutscene(script, 100);
    expect(holdElapsed(state, 100)).toBe(false);
    expect(holdElapsed(state, 1099)).toBe(false);
    expect(holdElapsed(state, 1100)).toBe(true);
    expect(holdElapsed(advanceCutscene(state, 200), 699)).toBe(false);
    expect(holdElapsed(advanceCutscene(state, 200), 700)).toBe(true);

    const third = advanceCutscene(advanceCutscene(startCutscene(script, 0), 0), 0);
    expect(currentBeat(third)?.text).toBe('three');
    expect(holdElapsed(third, DEFAULT_HOLD_MS - 1)).toBe(false);
    expect(holdElapsed(third, DEFAULT_HOLD_MS)).toBe(true);
  });

  it('an empty script is already done', () => {
    const empty: CutsceneScript = { version: 1, id: 'x', beats: [] };
    const state = startCutscene(empty, 0);
    expect(state.done).toBe(true);
    expect(holdElapsed(state, 0)).toBe(true);
  });
});

describe('cutscenesEnabledFromQuery', () => {
  it('treats ?cutscene=0 as off and everything else as on', () => {
    expect(cutscenesEnabledFromQuery('?cutscene=0')).toBe(false);
    expect(cutscenesEnabledFromQuery('cutscene=0')).toBe(false);
    expect(cutscenesEnabledFromQuery('')).toBe(true);
    expect(cutscenesEnabledFromQuery('?cutscene=1')).toBe(true);
    expect(cutscenesEnabledFromQuery('?level=level-1')).toBe(true);
  });
});
