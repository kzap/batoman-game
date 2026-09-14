/**
 * Level JSON consumed by the sim and validated at build time. Units are sim
 * pixels with Y up: (0, 0) is the bottom-left of the level. Rectangles give
 * their min corner. Hand-authored or produced by tools/level/from-tiled.ts.
 */

import type { AABB } from '@core/math/aabb';
import { overlaps } from '@core/math/aabb';
import type { Vec2 } from '@core/math/vec2';
import { isInt, isRecord } from './json';
import { levelArtProblems, type LevelArtJson } from './level-art';

export type Rect = AABB;
export type Point = Vec2;

/** A solid that moves back and forth between waypoints at constant speed (px/s). */
export interface MovingSolidJson extends Rect {
  readonly path: readonly Point[];
  readonly speed: number;
  /** Ticks to wait at each waypoint. */
  readonly pause?: number;
  /** Frame in the level's prop atlas drawn stretched over the collider. Grey box when absent. */
  readonly prop?: string;
}

export type HazardKind = 'spikes' | 'crusher';

export interface HazardJson extends Rect {
  readonly kind: HazardKind;
}

export interface CheckpointJson extends Rect {
  readonly id: number;
}

/** `aswang` is the Level 1 boss; `tikbalang` is spawn data until its behaviour exists. */
export type EnemyType = 'patroller' | 'drone' | 'stealth' | 'tikbalang' | 'aswang';

export interface EnemySpawnJson {
  readonly type: EnemyType;
  /** Feet position. */
  readonly x: number;
  readonly y: number;
  readonly patrolDistance?: number;
}

export interface LevelJson {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  /** Player feet position at level start. */
  readonly spawn: Point;
  readonly exit: Rect;
  readonly solids: readonly Rect[];
  readonly oneWay: readonly Rect[];
  readonly movingSolids: readonly MovingSolidJson[];
  readonly hazards: readonly HazardJson[];
  /** Instant death (river, void). */
  readonly deathZones: readonly Rect[];
  readonly checkpoints: readonly CheckpointJson[];
  readonly enemies: readonly EnemySpawnJson[];
  /** Dressing for the renderer; a level without it renders as grey boxes. */
  readonly art?: LevelArtJson;
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
export const HAZARD_KINDS: readonly HazardKind[] = ['spikes', 'crusher'];
export const ENEMY_TYPES: readonly EnemyType[] = ['patroller', 'drone', 'stealth', 'tikbalang', 'aswang'];


function rectProblems(r: unknown, label: string, level: { width: number; height: number }): string[] {
  if (!isRecord(r)) return [`${label}: must be an object`];
  if (![r.x, r.y, r.w, r.h].every(isInt)) return [`${label}: x, y, w, h must be integers`];
  const { x, y, w, h } = r as unknown as Rect;
  const out: string[] = [];
  if (w <= 0 || h <= 0) out.push(`${label}: w and h must be positive`);
  if (x < 0 || y < 0 || x + w > level.width || y + h > level.height) out.push(`${label}: leaves the level bounds`);
  return out;
}

function pointProblems(p: unknown, label: string, level: { width: number; height: number }): string[] {
  if (!isRecord(p) || !isInt(p.x) || !isInt(p.y)) return [`${label}: x and y must be integers`];
  if (p.x < 0 || p.y < 0 || p.x > level.width || p.y > level.height) return [`${label}: outside the level`];
  return [];
}

/**
 * Structural and geometric checks. Returns problems; empty means valid.
 * Solids may not overlap each other (the collision model assumes it), the
 * spawn must be inside the level and not inside a solid, and every reference
 * must resolve.
 */
export function levelProblems(json: unknown): string[] {
  if (!isRecord(json)) return ['level must be an object'];
  const problems: string[] = [];
  if (json.version !== 1) problems.push(`unsupported version ${String(json.version)}`);
  if (typeof json.id !== 'string' || !ID_RE.test(json.id)) problems.push('id must match ' + String(ID_RE));
  if (typeof json.name !== 'string' || json.name.length === 0) problems.push('name is required');
  if (!isInt(json.width) || !isInt(json.height) || (json.width as number) <= 0 || (json.height as number) <= 0) {
    problems.push('width and height must be positive integers');
    return problems;
  }
  const level = { width: json.width, height: json.height };
  if (!isInt(json.tileSize) || (json.tileSize as number) <= 0) problems.push('tileSize must be a positive integer');

  const rectList = (key: string, required = true): Rect[] => {
    const v = json[key];
    if (v === undefined) {
      if (required) problems.push(`${key} is required`);
      return [];
    }
    if (!Array.isArray(v)) {
      problems.push(`${key} must be an array`);
      return [];
    }
    const valid: Rect[] = [];
    v.forEach((r, i) => {
      const found = rectProblems(r, `${key}[${i}]`, level);
      if (found.length === 0) valid.push(r as Rect);
      else problems.push(...found);
    });
    return valid;
  };

  const solids = rectList('solids');
  const oneWay = rectList('oneWay');
  const movers = rectList('movingSolids');
  rectList('hazards');
  rectList('deathZones');
  rectList('checkpoints');

  const blocking = [...solids, ...oneWay, ...movers];
  for (let i = 0; i < blocking.length; i++) {
    for (let j = i + 1; j < blocking.length; j++) {
      if (overlaps(blocking[i]!, blocking[j]!)) problems.push(`solids ${JSON.stringify(blocking[i])} and ${JSON.stringify(blocking[j])} overlap`);
    }
  }

  (json.movingSolids as unknown[] | undefined)?.forEach((m, i) => {
    if (!isRecord(m)) return;
    if (!Array.isArray(m.path) || m.path.length < 2) problems.push(`movingSolids[${i}].path needs at least two points`);
    else {
      m.path.forEach((p, k) => problems.push(...pointProblems(p, `movingSolids[${i}].path[${k}]`, level)));
      const first = m.path[0] as Point;
      if (first.x !== m.x || first.y !== m.y) problems.push(`movingSolids[${i}].path[0] must equal the solid's own x, y (the sim starts there and returns to it)`);
    }
    if (typeof m.speed !== 'number' || !(m.speed > 0)) problems.push(`movingSolids[${i}].speed must be positive`);
    if (m.pause !== undefined && (!isInt(m.pause) || m.pause < 0)) problems.push(`movingSolids[${i}].pause must be a non-negative integer`);
    if (m.prop !== undefined && (typeof m.prop !== 'string' || m.prop.length === 0)) problems.push(`movingSolids[${i}].prop must be a non-empty string`);
  });

  (json.hazards as unknown[] | undefined)?.forEach((h, i) => {
    if (isRecord(h) && !HAZARD_KINDS.includes(h.kind as HazardKind)) problems.push(`hazards[${i}].kind must be one of ${HAZARD_KINDS.join(', ')}`);
  });

  const ids = new Set<number>();
  (json.checkpoints as unknown[] | undefined)?.forEach((c, i) => {
    if (!isRecord(c) || !isInt(c.id)) problems.push(`checkpoints[${i}].id must be an integer`);
    else if (ids.has(c.id)) problems.push(`checkpoints[${i}].id ${c.id} is duplicated`);
    else ids.add(c.id);
  });

  problems.push(...pointProblems(json.spawn, 'spawn', level));
  if (pointProblems(json.spawn, '', level).length === 0) {
    const s = json.spawn as Point;
    if (solids.some((r) => s.x >= r.x && s.x < r.x + r.w && s.y >= r.y && s.y < r.y + r.h)) problems.push('spawn is inside a solid');
  }
  problems.push(...rectProblems(json.exit, 'exit', level));

  if (!Array.isArray(json.enemies)) problems.push('enemies must be an array');
  else {
    json.enemies.forEach((e, i) => {
      if (!isRecord(e)) return problems.push(`enemies[${i}] must be an object`);
      if (!ENEMY_TYPES.includes(e.type as EnemyType)) problems.push(`enemies[${i}].type must be one of ${ENEMY_TYPES.join(', ')}`);
      problems.push(...pointProblems(e, `enemies[${i}]`, level));
      if (e.patrolDistance !== undefined && (!isInt(e.patrolDistance) || e.patrolDistance < 0)) problems.push(`enemies[${i}].patrolDistance must be a non-negative integer`);
    });
  }
  if (json.art !== undefined) problems.push(...levelArtProblems(json.art, level));
  return problems;
}

export function parseLevel(json: unknown, label = 'level'): LevelJson {
  const problems = levelProblems(json);
  if (problems.length) throw new Error(`${label}: ${problems.join('; ')}`);
  return json as LevelJson;
}
