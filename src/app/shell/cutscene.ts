/**
 * Pure cutscene runner: beat-index advance/skip, holdMs checks, and the
 * stateful wrapper unit tests drive. The screen reducer uses the same
 * {@link advanceBeat} / {@link skipBeats} helpers so dialog logic lives once.
 */

import { beatHoldMs, type CutsceneBeat, type CutsceneScript } from '@content/cutscene';

/** `?cutscene=0` skips intro dialogs on the title path. Missing or anything else keeps them on. */
export function cutscenesEnabledFromQuery(search: string): boolean {
  const v = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('cutscene');
  return v !== '0';
}

/**
 * Advance one line by index. `done` is true after the last line (or when the
 * script is empty / already past the end). Shared by the screen reducer and
 * {@link advanceCutscene}.
 */
export function advanceBeat(index: number, length: number): { readonly index: number; readonly done: boolean } {
  if (length <= 0 || index >= length) return { index: Math.max(index, length), done: true };
  const next = index + 1;
  if (next >= length) return { index: next, done: true };
  return { index: next, done: false };
}

/** Jump past every line. Shared by the screen reducer and {@link skipCutscene}. */
export function skipBeats(length: number): { readonly index: number; readonly done: true } {
  return { index: Math.max(0, length), done: true };
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
  const step = advanceBeat(state.index, state.script.beats.length);
  if (step.done) return { ...state, done: true, index: step.index };
  return { script: state.script, index: step.index, done: false, beatStartedAt: nowMs };
}

/** Jump past every remaining line. */
export function skipCutscene(state: CutsceneState): CutsceneState {
  if (state.done) return state;
  const step = skipBeats(state.script.beats.length);
  return { ...state, done: true, index: step.index };
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
