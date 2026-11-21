/**
 * Level-intro cutscene scripts: dialog beats with optional portraits and
 * presentation-only camera pans. Parsed at runtime from static JSON (same
 * `?url&no-inline` pattern as levels) so the copy does not count against the
 * JS+CSS budget. The shell plays them while the sim stays paused.
 */

import { isInt, isRecord, NAME_RE } from './json';

export interface CutscenePortrait {
  readonly atlas: string;
  readonly frame?: string;
  readonly animation?: string;
  readonly tint?: number;
}

/** Presentation pan only. Must not call World.step. */
export interface CutsceneCamera {
  readonly x: number;
  readonly y: number;
  readonly ms: number;
}

export interface CutsceneBeat {
  readonly speaker: string;
  readonly text: string;
  readonly portrait?: CutscenePortrait;
  readonly camera?: CutsceneCamera;
  /** Soft auto-advance budget in ms. The shell may ignore it (input-only). */
  readonly holdMs: number;
}

export interface CutsceneScript {
  readonly version: 1;
  /** Manifest level id, e.g. `"level-1"`. */
  readonly id: string;
  readonly beats: readonly CutsceneBeat[];
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function portraitProblems(p: unknown, label: string): string[] {
  if (!isRecord(p)) return [`${label}: must be an object`];
  const out: string[] = [];
  if (typeof p.atlas !== 'string' || !NAME_RE.test(p.atlas)) out.push(`${label}.atlas must match ${String(NAME_RE)}`);
  if (p.frame !== undefined && (typeof p.frame !== 'string' || p.frame.length === 0)) out.push(`${label}.frame must be a non-empty string`);
  if (p.animation !== undefined && (typeof p.animation !== 'string' || p.animation.length === 0)) {
    out.push(`${label}.animation must be a non-empty string`);
  }
  if (p.frame === undefined && p.animation === undefined) out.push(`${label}: needs frame or animation`);
  if (p.tint !== undefined && (!isInt(p.tint) || (p.tint as number) < 0 || (p.tint as number) > 0xffffff)) {
    out.push(`${label}.tint must be an integer 0..0xffffff`);
  }
  return out;
}

function cameraProblems(c: unknown, label: string): string[] {
  if (!isRecord(c)) return [`${label}: must be an object`];
  const out: string[] = [];
  if (!isInt(c.x) || !isInt(c.y)) out.push(`${label}.x and .y must be integers`);
  if (!isInt(c.ms) || (c.ms as number) < 0) out.push(`${label}.ms must be a non-negative integer`);
  return out;
}

function beatProblems(b: unknown, label: string): string[] {
  if (!isRecord(b)) return [`${label}: must be an object`];
  const out: string[] = [];
  if (typeof b.speaker !== 'string' || b.speaker.length === 0) out.push(`${label}.speaker is required`);
  if (typeof b.text !== 'string' || b.text.length === 0) out.push(`${label}.text is required`);
  if (!isInt(b.holdMs) || (b.holdMs as number) < 0) out.push(`${label}.holdMs must be a non-negative integer`);
  if (b.portrait !== undefined) out.push(...portraitProblems(b.portrait, `${label}.portrait`));
  if (b.camera !== undefined) out.push(...cameraProblems(b.camera, `${label}.camera`));
  return out;
}

/**
 * Structural checks for a cutscene script. Empty means valid. Atlas and frame
 * existence against packed sheets is resolved at play time (missing art falls
 * back to a typography-only nameplate).
 */
export function cutsceneProblems(json: unknown): string[] {
  if (!isRecord(json)) return ['cutscene must be an object'];
  const problems: string[] = [];
  if (json.version !== 1) problems.push(`unsupported version ${String(json.version)}`);
  if (typeof json.id !== 'string' || !ID_RE.test(json.id)) problems.push(`id must match ${String(ID_RE)}`);
  if (!Array.isArray(json.beats)) {
    problems.push('beats must be an array');
    return problems;
  }
  if (json.beats.length === 0) problems.push('beats must not be empty');
  json.beats.forEach((b, i) => problems.push(...beatProblems(b, `beats[${i}]`)));
  return problems;
}

export function parseCutscene(json: unknown, label = 'cutscene'): CutsceneScript {
  const problems = cutsceneProblems(json);
  if (problems.length) throw new Error(`${label}: ${problems.join('; ')}`);
  return json as CutsceneScript;
}
