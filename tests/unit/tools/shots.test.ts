import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevel } from '@content/level';
import { MAX_TICKS_PER_FRAME } from '@core/sim/clock';
import { NO_INPUT, packInput } from '@core/sim/input';
import { decodeInputs } from '@core/sim/replay';
import { World } from '@game/world';
import {
  CLIP,
  MID_RUN_TICKS,
  RIGHT_BITS,
  SPAWN_TICKS,
  STILLS,
  beforeName,
  clipSchedule,
  midSchedule,
  parseShotArgs,
  linkMarkdown,
  prImageUrl,
  spawnSchedule,
  uncommittedLinksHelp,
  stillUrl,
} from '../../../tools/shots/plan';

const level = parseLevel(JSON.parse(readFileSync('src/content/levels/level-1.json', 'utf8')), 'level-1');

function play(inputs: readonly (readonly [number, number])[]): ReturnType<World['snapshot']> {
  const world = new World(level, 1);
  for (const frame of decodeInputs(inputs)) world.step(frame);
  return world.snapshot();
}

describe('shot plan', () => {
  it('names the four stills and a walk clip with stable filenames', () => {
    expect(STILLS.map((scene) => scene.id)).toEqual(['title', 'level-1-start', 'level-1-mid', 'editor']);
    expect(STILLS.map((scene) => scene.file)).toEqual([
      'title.png',
      'level-1-start.png',
      'level-1-mid.png',
      'editor.png',
    ]);
    expect(CLIP.file).toBe('level-1-walk.webm');
    expect(new Set(STILLS.map((scene) => scene.file)).size).toBe(STILLS.length);
  });

  it('adds the lockstep query only on gameplay stills', () => {
    expect(stillUrl('/', false)).toBe('/');
    expect(stillUrl('/?edit=1', false)).toBe('/?edit=1');
    expect(stillUrl('/?level=level-1', true)).toBe('/?level=level-1&lockstep=1&ticksPerFrame=0');
    expect(stillUrl(CLIP.path, CLIP.lockstep)).toBe('/?level=level-1');
  });

  it('builds a raw URL pinned to the full commit SHA', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    expect(prImageUrl(sha, 'pr-format', 'level-1-mid.png')).toBe(
      `https://github.com/kzap/batoman-game/raw/${sha}/docs/pr-assets/pr-format/level-1-mid.png`,
    );
    expect(beforeName('level-1-mid.png')).toBe('level-1-mid-before.png');
    expect(beforeName('level-1-walk.webm')).toBe('level-1-walk-before.webm');
  });

  it('prints image markdown for pngs and a link for the webm', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const md = linkMarkdown(sha, 'pr-format', ['level-1-mid.png', 'title.png', 'level-1-walk.webm']);
    expect(md).toBe(
      [
        `![Title](https://github.com/kzap/batoman-game/raw/${sha}/docs/pr-assets/pr-format/title.png)`,
        `![Level 1 mid](https://github.com/kzap/batoman-game/raw/${sha}/docs/pr-assets/pr-format/level-1-mid.png)`,
        `[Level 1 walk](https://github.com/kzap/batoman-game/raw/${sha}/docs/pr-assets/pr-format/level-1-walk.webm)`,
      ].join('\n'),
    );
  });

  it('rejects a branch name where a SHA belongs, and explains the commit step', () => {
    expect(() => prImageUrl('infra/pr-format', 'pr-format', 'title.png')).toThrow(/SHA/);
    expect(() => prImageUrl('0123456789abcdef0123456789abcdef01234567', '../x', 'title.png')).toThrow(/slug/);
    expect(() => prImageUrl('0123456789abcdef0123456789abcdef01234567', 'ok', 'nope.gif')).toThrow(/asset file/);
    expect(uncommittedLinksHelp('pr-format')).toMatch(/git commit -s/);
    expect(uncommittedLinksHelp('pr-format')).toMatch(/--links pr-format/);
    expect(() => parseShotArgs(['--baseline'])).toThrow(/needs a value/);
    expect(() => parseShotArgs(['--slug', 'Has Space'])).toThrow(/slug/);
    expect(() => parseShotArgs(['--links'])).toThrow(/needs a value/);
    expect(() => parseShotArgs(['--links', 'a', '--slug', 'b'])).toThrow(/different folders/);
    expect(() => parseShotArgs(['--baseline', 'v2;rm'])).toThrow(/refusing/);
  });

  it('parses the baseline and slug flags', () => {
    expect(parseShotArgs([])).toMatchObject({
      out: 'pr-shots/head',
      baseline: null,
      baselineOut: 'pr-shots/baseline',
      slug: null,
      clip: true,
      skipBuild: false,
      links: null,
      port: 4173,
      help: false,
    });
    expect(parseShotArgs(['--links', 'pr-format'])).toMatchObject({ links: 'pr-format', slug: null });
    expect(parseShotArgs(['--baseline', 'v2', '--slug', 'pr-format', '--no-clip', '--skip-build', '--port', '4174'])).toMatchObject({
      baseline: 'v2',
      slug: 'pr-format',
      clip: false,
      skipBuild: true,
      port: 4174,
    });
    expect(parseShotArgs(['--no-clip', '--clip']).clip).toBe(true);
    expect(parseShotArgs(['--help']).help).toBe(true);
  });
});

describe('shot tick schedule', () => {
  it('keeps right-bit in sync with packInput', () => {
    expect(RIGHT_BITS).toBe(packInput({ ...NO_INPUT, right: true }));
  });

  it('stands the player on the spawn after the idle ticks', () => {
    const schedule = spawnSchedule();
    expect(schedule.targetTicks).toBe(SPAWN_TICKS);
    const snap = play(schedule.inputs);
    expect(snap.tick).toBe(SPAWN_TICKS);
    expect(snap.player.pose).toBe('idle');
    expect(snap.player.hp).toBe(3);
    expect(snap.player.x).toBe(88);
    expect(snap.camera.x).toBe(336);
  });

  it('reaches the mid-level run before the first enemy shot, including a full frame of overshoot', () => {
    const schedule = midSchedule();
    expect(schedule.targetTicks).toBe(MID_RUN_TICKS);
    expect(clipSchedule()).toEqual(schedule);
    const onTarget = play(schedule.inputs);
    expect(onTarget.player.pose).toBe('run');
    expect(onTarget.player.hp).toBe(3);
    expect(onTarget.projectiles).toHaveLength(0);
    expect(onTarget.player.x).toBeGreaterThan(300);
    expect(onTarget.camera.x).toBeGreaterThan(336);

    const overshoot = play([[RIGHT_BITS, MID_RUN_TICKS + MAX_TICKS_PER_FRAME - 1]]);
    expect(overshoot.player.hp).toBe(3);
    expect(overshoot.projectiles).toHaveLength(0);
    expect(overshoot.player.pose).toBe('run');
  });
});
