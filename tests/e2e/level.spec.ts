import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';
import { advance, advanceUntilDone, stepUntil, withLockstep } from './drive';
import { expectResultsCard } from './results';

declare global {
  interface Window {
    __batoman?: TestHooks;
  }
}

interface Fixture {
  seed: number;
  inputs: [number, number][];
  expect: { status: string; ticks: number; hp: number; lives: number; x: number };
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** Baseline screenshots land here (gitignored) and are uploaded by CI on every run. */
const SHOTS = resolve(HERE, '../../e2e-screenshots');
const hooks = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
const ready = (page: Page) => page.waitForFunction(() => window.__batoman?.ready === true && window.__batoman.frames > 10);

test.describe('level 1', () => {
  /**
   * Hosted ubuntu-latest + SwiftShader, 2026-11-20: 4.9 fps and 20 ticks/s (last frame 16.5 ms).
   * The audit's slowest runs were about 2 fps and 7 ticks/s. These floors are about half of that
   * slowest observation, so a cold runner still passes and a sim that barely steps fails.
   * Retune from the `perf-results` artifact: set each floor to about half the lowest fps and
   * ticks/s you see on a current hosted runner (`npm run test:e2e:perf`).
   */
  const MIN_FPS = 1;
  const MIN_TPS = 4;

  test('holds a hosted-runner frame budget while running the sim @perf', async ({ page }) => {
    await page.goto('/?level=level-1'); // production clock: this is the measurement, not a lockstep run
    await ready(page);
    const before = await hooks(page);
    const t0 = Date.now();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    const after = await hooks(page);
    const seconds = (Date.now() - t0) / 1000;
    const fps = (after.frames - before.frames) / seconds;
    const tps = (after.simTicks - before.simTicks) / seconds;
    const dropped = after.droppedFrames - before.droppedFrames;
    const report = {
      fps: Number(fps.toFixed(2)),
      ticksPerSecond: Number(tps.toFixed(2)),
      dropped,
      lastFrameMs: Number(after.lastFrameMs.toFixed(2)),
      seconds: Number(seconds.toFixed(2)),
      minFps: MIN_FPS,
      minTicksPerSecond: MIN_TPS,
    };
    writeFileSync(resolve(HERE, '../../perf-results.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`frame budget: ${fps.toFixed(1)} fps, ${tps.toFixed(0)} ticks/s, dropped ${dropped}, lastFrame ${after.lastFrameMs.toFixed(1)} ms`);
    test.info().annotations.push(
      { type: 'fps', description: fps.toFixed(1) },
      { type: 'ticks/s', description: tps.toFixed(0) },
      { type: 'dropped', description: String(dropped) },
    );
    expect(fps).toBeGreaterThan(MIN_FPS);
    expect(tps).toBeGreaterThan(MIN_TPS);
    expect(after.errors).toEqual([]);
  });

  test('loads the art: sprites and props are drawn, not grey boxes', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/?level=level-1');
    await ready(page);
    // Every atlas and backdrop the level references must have arrived; a 404 lands in errors via the boot catch.
    const h = await hooks(page);
    expect(h.errors).toEqual([]);
    const served = requests.filter((u) => u.includes('/assets/atlases/') || u.includes('/assets/backdrops/'));
    expect(served.some((u) => u.endsWith('atlases/batoman.json'))).toBe(true);
    expect(served.some((u) => u.endsWith('atlases/batoman.webp'))).toBe(true);
    expect(served.some((u) => u.endsWith('atlases/level-1-props.webp'))).toBe(true);
    expect(served.some((u) => u.endsWith('backdrops/level-1/sky.webp'))).toBe(true);
    expect(served.some((u) => u.endsWith('backdrops/level-1/town.webp'))).toBe(true);
  });

  test('captures baseline screenshots of the start and mid-level, with the debug overlay', async ({ page }) => {
    // Manual lockstep: 160 ticks of running right passes x=300 and pulls the camera off the spawn clamp (viewW/2 = 336).
    await page.goto(withLockstep('/?level=level-1', true));
    await ready(page);
    await page.screenshot({ path: resolve(SHOTS, 'level-1-start.png') });
    await page.keyboard.press('Backquote');
    await expect(page.locator('#debug')).toBeVisible();
    await expect(page.locator('#debug')).toContainText('ticks/s');
    await expect(page.locator('#hud')).toContainText('lives 3');
    await page.keyboard.down('ArrowRight');
    await advance(page, 160);
    await page.keyboard.up('ArrowRight');
    await page.screenshot({ path: resolve(SHOTS, 'level-1-mid-debug.png') });
    const h = await hooks(page);
    expect(h.camera.x).toBeGreaterThan(336); // camera left the start bound and is following
    expect(h.player.x).toBeGreaterThan(300);
    expect(h.simTicks).toBe(160);
    expect(h.errors).toEqual([]);
  });

  test('scripted traversal: the browser build replays the Level 1 fixture to the same outcome', async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = JSON.parse(readFileSync(resolve(HERE, '../replay/fixtures/level-1-clear.json'), 'utf8')) as Fixture;
    await page.goto(withLockstep('/?level=level-1'));
    await ready(page);
    await page.evaluate((f) => window.__batoman!.replay!(f), fixture);
    // Enemies are live sprites from the first frame: five spawns plus the dormant boss.
    await page.waitForFunction(() => (window.__batoman?.enemies.length ?? 0) >= 6);
    const start = await hooks(page);
    expect(start.boss).toEqual({ hp: 24, phase: 1, engaged: false });
    expect(start.entities).toBeGreaterThanOrEqual(1 + 6 + 1); // player, six enemies, the mover
    // Screenshots at landmarks on the way: the first fight, the one-way platform, the moving platform over the second pit, the first dash gap.
    // stepUntil pauses the sim between shots, so a slow screenshot cannot skip the boss.
    for (const [name, x] of [['level-1-fight', 380], ['level-1-oneway', 1550], ['level-1-mover', 2380], ['level-1-dash', 3500]] as const) {
      await stepUntil(page, { x });
      await page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
    }
    // The first patroller is dead once we are past it, and the boss engages when we reach the arena.
    expect((await hooks(page)).enemies.filter((e) => e.type === 'patroller' && e.x < 900)).toEqual([]);
    await stepUntil(page, { engaged: true });
    await expect(page.locator('#hud')).toContainText('ASWANG PROTOTYPE');
    // The exposed core lasts 100 ticks. Step under that so the diamond cue cannot be skipped.
    await stepUntil(page, { exposed: true }, 60_000, 48);
    const cue = await hooks(page);
    expect(cue.weakPoint).toEqual({ shape: 'diamond', ring: 'white', pulsing: true });
    expect(cue.reduceMotion).toBe(false);
    await page.screenshot({ path: resolve(SHOTS, 'level-1-weak-point.png') });
    await stepUntil(page, { phase: 3 });
    await page.screenshot({ path: resolve(SHOTS, 'level-1-boss.png') });
    await advanceUntilDone(page);
    // The boss is dead and its bar gone; the exit opened.
    expect((await hooks(page)).boss).toBeNull();
    await expect(page.locator('#hud')).not.toContainText('ASWANG PROTOTYPE');
    // Kills and the clear bonus scored; the HUD shows six digits.
    expect((await hooks(page)).score).toBeGreaterThan(1000);
    await expect(page.locator('.hud-score')).toHaveText(/^\d{6}$/);
    const h = await hooks(page);
    expect(h.status).toBe(fixture.expect.status);
    expect(h.simTicks).toBe(fixture.expect.ticks);
    expect(h.player.hp).toBe(fixture.expect.hp);
    expect(Math.round(h.player.x)).toBe(fixture.expect.x);
    await expect(page.locator('#hud')).toContainText(`lives ${fixture.expect.lives}`);
    expect(h.errors).toEqual([]);
    // The shell's results card follows: the level dims, Ando stays lit, and the tally meets the HUD score.
    await page.waitForFunction(() => window.__batoman?.screen === 'complete');
    await expectResultsCard(page, { kills: 1750, clear: 500, hearts: 300, total: 2550 });
    await page.screenshot({ path: resolve(SHOTS, 'level-1-complete.png') });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__batoman?.level === 'level-3' && window.__batoman.screen === 'playing', null, { timeout: 20_000 });
    expect((await hooks(page)).simTicks).toBeLessThan(200);
    expect((await hooks(page)).errors).toEqual([]);
  });

  test('collecting the HP Up draws the extra heart', async ({ page }) => {
    const fixture = JSON.parse(readFileSync(resolve(HERE, '../replay/fixtures/level-1-hp-up.json'), 'utf8')) as Fixture;
    await page.goto(withLockstep('/?level=level-1'));
    await ready(page);
    await expect(page.locator('.hud-heart')).toHaveCount(3);
    await expect(page.locator('.hud-heart-gained')).toHaveCount(0);
    await page.evaluate((f) => window.__batoman!.replay!(f), fixture);
    await advance(page, fixture.expect.ticks);
    await expect(page.locator('.hud-heart')).toHaveCount(4);
    await expect(page.locator('.hud-heart-lost')).toHaveCount(0);
    await expect(page.locator('.hud-heart-gained')).toHaveCount(1);
    const h = await hooks(page);
    expect(h.simTicks).toBe(fixture.expect.ticks);
    expect(h.player.hp).toBe(4);
    expect(h.player.maxHp).toBe(4);
    expect(h.errors).toEqual([]);
    await page.screenshot({ path: resolve(SHOTS, 'level-1-hp-up.png') });
  });
});

test.describe('other levels', () => {
  for (const id of ['level-3']) {
    test(`${id} loads as grey-box from ?level= and replays its fixture`, async ({ page }) => {
      test.setTimeout(45_000);
      const fixture = JSON.parse(readFileSync(resolve(HERE, `../replay/fixtures/${id}-clear.json`), 'utf8')) as Fixture;
      const requests: string[] = [];
      page.on('request', (r) => requests.push(r.url()));
      await page.goto(withLockstep(`/?level=${id}`));
      await ready(page);
      const h0 = await hooks(page);
      expect(h0.level).toBe(id);
      expect(h0.errors).toEqual([]);
      // No art block: the player atlas is the only image the level needs.
      expect(requests.some((u) => u.includes('/assets/backdrops/'))).toBe(false);
      await page.screenshot({ path: resolve(SHOTS, `${id}-start.png`) });
      await page.evaluate((f) => window.__batoman!.replay!(f), fixture);
      await advanceUntilDone(page);
      const h = await hooks(page);
      expect(h.status).toBe('complete');
      expect(h.simTicks).toBe(fixture.expect.ticks);
      expect(Math.round(h.player.x)).toBe(fixture.expect.x);
      await page.screenshot({ path: resolve(SHOTS, `${id}-complete.png`) });
    });
  }

  test('level-6 loads dressed from ?level= and replays its fixture across the roofs', async ({ page }) => {
    test.setTimeout(60_000);
    const fixture = JSON.parse(readFileSync(resolve(HERE, '../replay/fixtures/level-6-clear.json'), 'utf8')) as Fixture;
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(withLockstep('/?level=level-6'));
    await ready(page);
    const h0 = await hooks(page);
    expect(h0.level).toBe('level-6');
    expect(h0.errors).toEqual([]);
    expect(requests.some((u) => u.endsWith('atlases/level-6-props.webp'))).toBe(true);
    expect(requests.some((u) => u.endsWith('backdrops/level-6/sky.webp'))).toBe(true);
    expect(requests.some((u) => u.endsWith('backdrops/level-6/garden.webp'))).toBe(true);
    await page.screenshot({ path: resolve(SHOTS, 'level-6-start.png') });
    await page.evaluate((f) => window.__batoman!.replay!(f), fixture);
    // Landmarks on the roof-hops: the lift roof, the checkpoint roof, the boss roof.
    for (const [name, x] of [['level-6-lift', 1900], ['level-6-checkpoint', 3000], ['level-6-boss-roof', 3800]] as const) {
      await stepUntil(page, { x });
      await page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
    }
    await advanceUntilDone(page);
    const h = await hooks(page);
    expect(h.status).toBe('complete');
    expect(h.simTicks).toBe(fixture.expect.ticks);
    expect(Math.round(h.player.x)).toBe(fixture.expect.x);
    expect(h.errors).toEqual([]);
    await page.screenshot({ path: resolve(SHOTS, 'level-6-complete.png') });
  });

  test('level-4 loads dressed from ?level= and replays its fixture up the tower', async ({ page }) => {
    test.setTimeout(60_000);
    const fixture = JSON.parse(readFileSync(resolve(HERE, '../replay/fixtures/level-4-clear.json'), 'utf8')) as Fixture;
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(withLockstep('/?level=level-4'));
    await ready(page);
    const h0 = await hooks(page);
    expect(h0.level).toBe('level-4');
    expect(h0.errors).toEqual([]);
    expect(requests.some((u) => u.endsWith('atlases/level-4-props.webp'))).toBe(true);
    expect(requests.some((u) => u.endsWith('backdrops/level-4/skyline.webp'))).toBe(true);
    expect(requests.some((u) => u.endsWith('backdrops/level-4/street.webp'))).toBe(true);
    await page.screenshot({ path: resolve(SHOTS, 'level-4-start.png') });
    await page.evaluate((f) => window.__batoman!.replay!(f), fixture);
    // Landmarks on the climb: the first balcony, the lift ride, the roof.
    for (const [name, y] of [['level-4-balcony', 440], ['level-4-lift', 800], ['level-4-roof', 1400]] as const) {
      await stepUntil(page, { y });
      await page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
    }
    await advanceUntilDone(page);
    const h = await hooks(page);
    expect(h.status).toBe('complete');
    expect(h.simTicks).toBe(fixture.expect.ticks);
    expect(h.player.hp).toBe(fixture.expect.hp);
    expect(Math.round(h.player.x)).toBe(fixture.expect.x);
    expect(h.errors).toEqual([]);
    await page.screenshot({ path: resolve(SHOTS, 'level-4-complete.png') });
  });

  test('an unknown level id fails loudly instead of falling back to level 1', async ({ page }) => {
    await page.goto('/?level=level-99');
    await page.waitForFunction(() => (window.__batoman?.errors.length ?? 0) > 0);
    expect((await hooks(page)).errors[0]).toMatch(/unknown level "level-99"/);
  });
});
