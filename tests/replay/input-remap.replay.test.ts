import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, frameFromKeys, type Bindings } from '@app/bindings';
import { packInput, type InputFrame } from '@core/sim/input';
import { FIXTURE_DIR, encodeInputs, replay, type ReplayFixture } from './harness';

/**
 * Bindings live outside the sim. This fixture pins the packed bits a short
 * default-key sequence produces (run, run+jump, run) and the outcome of
 * replaying those bits on Level 1. A rebound layout that presses the same
 * buttons packs to the same runs, so `npm run replay:record` does not
 * regenerate this file and the level-clear fixtures stay untouched.
 */
const RUN = 30;
const JUMP = 15;
const LAND = 60;

function script(bindings: Bindings, run: readonly string[], jump: readonly string[], land: readonly string[]): InputFrame[] {
  const hold = (codes: readonly string[], n: number): InputFrame[] => Array.from({ length: n }, () => frameFromKeys(bindings, codes));
  return [...hold(run, RUN), ...hold(jump, JUMP), ...hold(land, LAND)];
}

const defaultFrames = script(DEFAULT_BINDINGS, ['ArrowRight'], ['ArrowRight', 'Space'], ['ArrowRight']);
const rebound: Bindings = { ...DEFAULT_BINDINGS, right: ['KeyL'], jump: ['KeyU'] };
const reboundFrames = script(rebound, ['KeyL'], ['KeyL', 'KeyU'], ['KeyL']);

describe('input remap replay', () => {
  const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'input-remap.json'), 'utf8')) as ReplayFixture;

  it('default keys and a rebound layout pack to the same bits as the fixture', () => {
    const bits = defaultFrames.map(packInput);
    expect(reboundFrames.map(packInput)).toEqual(bits);
    expect(fixture.inputs).toEqual(encodeInputs(defaultFrames));
    expect(fixture.inputs.reduce((n, [, c]) => n + c, 0)).toBe(defaultFrames.length);
    // Up is not an alias of jump: the jump stretch is the jump bit, not the up bit.
    expect(packInput(defaultFrames[RUN]!)).toBe((1 << 1) | (1 << 4));
    expect(packInput(frameFromKeys(DEFAULT_BINDINGS, ['ArrowUp'])) & (1 << 4)).not.toBe(0);
    expect(packInput(frameFromKeys(rebound, ['ArrowUp'])) & (1 << 4)).toBe(0);
  });

  it('replays the committed fixture to its pinned outcome', () => {
    const final = replay(fixture);
    expect(final.status).toBe(fixture.expect.status);
    expect(final.tick).toBe(fixture.expect.ticks);
    expect(final.lives).toBe(fixture.expect.lives);
    expect(final.player.hp).toBe(fixture.expect.hp);
    expect(Math.round(final.player.x)).toBe(fixture.expect.x);
    expect(final.player.hp).toBe(3);
    expect(final.status).toBe('playing');
  });
});
