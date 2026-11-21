import { describe, expect, it } from 'vitest';
import { PRESENTATION } from '@app/shell/overlay';
import { SCORE } from '@app/shell/score';
import { gameplayViewPx, projectGameplay, RESULTS, resultsSpotlight, tallyAt, tallyPlan } from '@app/shell/results';
import { LENS } from '@render/stage';
import { PIXELS_PER_UNIT } from '@render/units';
import { PLAYER } from '@game/tuning';

const viewOf = (w: number, h: number) => {
  const tanHalf = Math.tan(((LENS.fovDeg / 2) * Math.PI) / 180);
  const viewH = 2 * LENS.distance * tanHalf * PIXELS_PER_UNIT;
  return { w: viewH * (w / h), h: viewH };
};

describe('results tally', () => {
  const score = 2250;
  const levelScore = 1250;
  const hp = 3;
  const plan = tallyPlan(score, levelScore, hp);

  it('splits the HUD score into kills, the clear bonus and the heart bonus', () => {
    expect(plan.lines.map((l) => [l.id, l.points])).toEqual([
      ['kills', levelScore - SCORE.levelClear - hp * SCORE.perHeart],
      ['clear', SCORE.levelClear],
      ['hearts', hp * SCORE.perHeart],
    ]);
    expect(plan.base).toBe(score - levelScore);
    expect(plan.base + plan.lines.reduce((n, l) => n + l.points, 0)).toBe(score);
    expect(plan.total).toBe(score);
  });

  it('counts one line at a time and lands on the HUD score', () => {
    const at = (ms: number) => tallyAt(plan, ms);
    expect(at(0)).toMatchObject({ shown: 1000, done: false });
    expect(at(0).lines.map((l) => l.shown)).toEqual([0, 0, 0]);
    // 450 kills over 400ms: one millisecond in, the count has moved, and it only moves up.
    expect(at(1).lines[0]!.shown).toBe(Math.floor(450 / RESULTS.lineMs));
    expect(at(200).lines.map((l) => l.shown)).toEqual([225, 0, 0]);
    expect(at(200).shown).toBe(1225);
    expect(at(400).lines.map((l) => l.shown)).toEqual([450, 0, 0]);
    expect(at(600).lines.map((l) => l.shown)).toEqual([450, 250, 0]);
    expect(at(800).lines.map((l) => l.shown)).toEqual([450, 500, 0]);
    expect(at(1000).lines.map((l) => l.shown)).toEqual([450, 500, 150]);
    expect(at(1199).shown).toBe(2249);
    expect(at(1199).done).toBe(false);
    expect(at(1200)).toMatchObject({ shown: score, done: true });
    expect(at(5000)).toMatchObject({ shown: score, done: true });
  });

  it('never counts down, and a non-finite clock shows the opening frame', () => {
    let prev = -1;
    for (let ms = 0; ms <= 1200; ms += 25) {
      const frame = tallyAt(plan, ms);
      expect(frame.shown).toBeGreaterThanOrEqual(prev);
      expect(frame.shown).toBe(plan.base + frame.lines.reduce((n, l) => n + l.shown, 0));
      prev = frame.shown;
    }
    expect(tallyAt(plan, -10)).toEqual(tallyAt(plan, 0));
    expect(tallyAt(plan, Number.NaN)).toEqual(tallyAt(plan, 0));
  });

  it('skips a zero-point line and treats reduced motion as the finished card', () => {
    const empty = tallyPlan(800, 800, 3);
    expect(empty.lines.map((l) => l.points)).toEqual([0, 500, 300]);
    expect(tallyAt(empty, 0).lines.map((l) => l.shown)).toEqual([0, 0, 0]);
    expect(tallyAt(empty, 0).done).toBe(false);
    expect(tallyAt(empty, RESULTS.lineMs).lines.map((l) => l.shown)).toEqual([0, 500, 0]);
    expect(tallyAt(empty, RESULTS.lineMs * 2)).toMatchObject({ shown: 800, done: true });
    expect(tallyAt(plan, Infinity)).toEqual(tallyAt(plan, RESULTS.lineMs * 3));
  });

  it('still lands on the HUD score when the level score cannot cover the bonuses', () => {
    const short = tallyPlan(100, 100, 3);
    expect(short.lines.reduce((n, l) => n + l.points, 0) + short.base).toBe(100);
    expect(tallyAt(short, Infinity).shown).toBe(100);
    expect(tallyAt(tallyPlan(0, 0, 0), 0).done).toBe(true);
  });
});

describe('results spotlight', () => {
  const viewport = { w: 1280, h: 720 };

  it('matches the lens frustum and puts a centred body on the viewport centre', () => {
    expect(gameplayViewPx(viewport)).toEqual(viewOf(1280, 720));
    const view = viewOf(1280, 720);
    // Body centre on the camera centre, so the pool sits on the viewport centre.
    const spot = resultsSpotlight({ x: 100 - PLAYER.width / 2, y: 200 - PLAYER.height / 2, pose: 'idle' }, { x: 100, y: 200 }, viewport);
    expect(spot.x).toBeCloseTo(640, 5);
    expect(spot.y).toBeCloseTo(360, 5);
    expect(spot.clear).toBeCloseTo(RESULTS.clearPx * (720 / view.h), 5);
    expect(spot.edge).toBeCloseTo((RESULTS.clearPx + RESULTS.featherPx) * (720 / view.h), 5);
    expect(spot.edge).toBeGreaterThan(spot.clear);
  });

  it('reaches the view edge half a screen away and flips Y', () => {
    const view = viewOf(1280, 720);
    const right = projectGameplay(100 + view.w / 2, 200, { x: 100, y: 200 }, viewport);
    expect(right.x).toBeCloseTo(1280, 4);
    expect(right.y).toBeCloseTo(360, 4);
    const above = projectGameplay(100, 400, { x: 100, y: 200 }, viewport);
    const below = projectGameplay(100, 0, { x: 100, y: 200 }, viewport);
    expect(above.y).toBeLessThan(360);
    expect(below.y).toBeGreaterThan(360);
  });

  it('drops the pool for a crouch, whose body centre is lower', () => {
    const feet = { x: 80, y: 64 };
    const camera = { x: 200, y: 180 };
    const idle = resultsSpotlight({ ...feet, pose: 'idle' }, camera, viewport);
    const crouch = resultsSpotlight({ ...feet, pose: 'crouch' }, camera, viewport);
    expect(crouch.y).toBeGreaterThan(idle.y);
    expect(crouch.x).toBeCloseTo(idle.x, 5);
    expect(resultsSpotlight({ ...feet, pose: 'slide' }, camera, viewport).y).toBeCloseTo(crouch.y, 5);
  });
});

describe('results presentation', () => {
  it('dims the level around Ando on the results card and nowhere else', () => {
    expect(PRESENTATION.complete).toEqual({ dim: false, spotlight: true, hideHud: false });
    for (const kind of ['title', 'levelSelect', 'intro', 'playing', 'paused', 'gameover', 'credits', 'controls'] as const) {
      expect(PRESENTATION[kind].spotlight).toBe(false);
    }
    expect(PRESENTATION.title.dim).toBe(true);
    expect(PRESENTATION.playing.dim).toBe(false);
  });
});
