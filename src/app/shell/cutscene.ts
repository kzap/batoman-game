/**
 * Pure cutscene runner: which beat is showing, advance, skip-all, and the
 * soft holdMs auto-advance check. The shell owns timers, camera pans, and DOM;
 * this module only tracks index and completion.
 */

import { beatHoldMs, type CutsceneBeat, type CutsceneScript } from '@content/cutscene';

/** `?cutscene=0` skips intro dialogs on the title path. Missing or anything else keeps them on. */
export function cutscenesEnabledFromQuery(search: string): boolean {
  const v = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('cutscene');
  return v !== '0';
}

export interface CutsceneState {
  readonly script: CutsceneScript;
  readonly index: number;
  readonly done: boolean;
  /** Wall-clock ms when the current beat started; used by {@link holdElapsed}. */
  readonly beatStartedAt: number;
}

export function startCutscene(script: CutsceneScript, nowMs: number): CutsceneState {
  if (script.beats.length === 0) {
    return { script, index: 0, done: true, beatStartedAt: nowMs };
  }
  return { script, index: 0, done: false, beatStartedAt: nowMs };
}

export function currentBeat(state: CutsceneState): CutsceneBeat | null {
  if (state.done) return null;
  return state.script.beats[state.index] ?? null;
}

/** Advance one beat. Completes after the last line. */
export function advanceCutscene(state: CutsceneState, nowMs: number): CutsceneState {
  if (state.done) return state;
  const next = state.index + 1;
  if (next >= state.script.beats.length) return { ...state, done: true, index: next };
  return { script: state.script, index: next, done: false, beatStartedAt: nowMs };
}

/** Jump past every remaining line. */
export function skipCutscene(state: CutsceneState): CutsceneState {
  if (state.done) return state;
  return { ...state, done: true, index: state.script.beats.length };
}

/**
 * True when the current beat's hold duration has elapsed (explicit `holdMs` or
 * the default). The shell arms a real-time timeout from the same value.
 */
export function holdElapsed(state: CutsceneState, nowMs: number): boolean {
  if (state.done) return true;
  const beat = currentBeat(state);
  if (!beat) return true;
  return nowMs - state.beatStartedAt >= beatHoldMs(beat);
}
