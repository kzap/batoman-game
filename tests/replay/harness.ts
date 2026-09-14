import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLevel, type LevelJson } from '@content/level';
import { packInput, unpackInput, type InputFrame } from '@core/sim/input';
import { World, type WorldSnapshot } from '@game/world';

/**
 * Replay fixtures: a level id, a seed, and one packed InputFrame per tick,
 * run-length encoded as [bits, count] pairs. `expect` pins the outcome so a
 * tuning change that alters the run fails loudly instead of silently drifting.
 */
export interface ReplayFixture {
  readonly level: string;
  readonly seed: number;
  readonly inputs: readonly (readonly [bits: number, count: number])[];
  readonly expect: {
    readonly status: WorldSnapshot['status'];
    readonly ticks: number;
    readonly lives: number;
    readonly hp: number;
    /** Player x at the final tick (integer pixels). */
    readonly x: number;
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = resolve(HERE, 'fixtures');

export function loadLevel(id: string): LevelJson {
  const path = resolve(HERE, '../../src/content/levels', `${id}.json`);
  return parseLevel(JSON.parse(readFileSync(path, 'utf8')), id);
}

export function encodeInputs(frames: readonly InputFrame[]): [number, number][] {
  const out: [number, number][] = [];
  for (const f of frames) {
    const bits = packInput(f);
    const last = out.at(-1);
    if (last && last[0] === bits) last[1]++;
    else out.push([bits, 1]);
  }
  return out;
}

export function* decodeInputs(rle: ReplayFixture['inputs']): Generator<InputFrame> {
  for (const [bits, count] of rle) {
    const f = unpackInput(bits);
    for (let i = 0; i < count; i++) yield f;
  }
}

/** Drive a fresh world with the fixture's inputs and return the final snapshot. */
export function replay(fixture: ReplayFixture): WorldSnapshot {
  const world = new World(loadLevel(fixture.level), fixture.seed);
  for (const f of decodeInputs(fixture.inputs)) world.step(f);
  return world.snapshot();
}

/**
 * A policy chooses the next input from the live world. Used to record fixtures:
 * the policy may read anything, but only its inputs are saved.
 */
export type Policy = (world: World, snapshot: WorldSnapshot) => InputFrame;

export interface Recording {
  readonly frames: InputFrame[];
  readonly final: WorldSnapshot;
}

export function record(level: LevelJson, seed: number, policy: Policy, maxTicks: number): Recording {
  const world = new World(level, seed);
  const frames: InputFrame[] = [];
  let snap = world.snapshot();
  while (snap.status === 'playing' && frames.length < maxTicks) {
    const f = policy(world, snap);
    frames.push(f);
    world.step(f);
    snap = world.snapshot();
  }
  return { frames, final: snap };
}

export function toFixture(level: string, seed: number, rec: Recording): ReplayFixture {
  return {
    level,
    seed,
    inputs: encodeInputs(rec.frames),
    expect: {
      status: rec.final.status,
      ticks: rec.final.tick,
      lives: rec.final.lives,
      hp: rec.final.player.hp,
      x: Math.round(rec.final.player.x),
    },
  };
}
