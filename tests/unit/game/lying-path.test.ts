import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levelProblems, parseLevel, type LevelJson } from '@content/level';
import { NO_INPUT } from '@core/sim/input';
import { PLAYER } from '@game/tuning';
import { World } from '@game/world';

/**
 * The rope bridge between the second and third roofs. It is paint: the span
 * is the pit at x 1248–1376. A solid across that span would make this test fail.
 */
const GAP = { x: 1248, w: 128 };
const ROOF = 224;

function level6(): LevelJson {
  const json: unknown = JSON.parse(readFileSync(new URL('../../../src/content/levels/level-6.json', import.meta.url), 'utf8'));
  return parseLevel(json, 'level-6');
}

/** Level 6 geometry with no enemies, so the fall is the pit and not a fight. */
function quiet(): World {
  return new World({ ...level6(), enemies: [] }, 1);
}

describe('level 6 lying path', () => {
  it('is paint over the pit, and the level still validates', () => {
    const level = level6();
    expect(levelProblems(level)).toEqual([]);
    const decks = level.solids.filter((s) => s.x < GAP.x + GAP.w && s.x + s.w > GAP.x && s.y + s.h > 32);
    expect(decks).toEqual([]);
    expect(level.deathZones).toContainEqual({ x: GAP.x, y: 0, w: GAP.w, h: 32 });
    const bridge = level.art?.decor.find((d) => d.prop === 'bridge_rope');
    expect(bridge).toMatchObject({ x: GAP.x + GAP.w / 2, y: ROOF });
  });

  it('walking onto the bridge falls into the pit', () => {
    const w = quiet();
    const deaths: string[] = [];
    w.events.on('death', (e) => deaths.push(e.cause));
    w.player.body.place(GAP.x - PLAYER.width, ROOF);
    for (let i = 0; i < 400 && deaths.length === 0; i++) w.step({ ...NO_INPUT, right: true });
    expect(deaths).toEqual(['pit']);
    expect(w.player.dead).toBe(true);
    expect(w.player.body.y).toBeLessThan(ROOF);
    expect(w.health.hp).toBe(0);
  });
});
