import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';

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
  test('holds the frame-time budget while running the sim', async ({ page }) => {
    await page.goto('/');
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
    // Software WebGL in CI is fill-bound: the two full-screen backdrop layers plus the post stack run at
    // roughly 35-40 fps under SwiftShader on a laptop (grey-box was 60). 20 fps is the floor for regressions;
    // the sim must still run at full rate whatever the renderer manages.
    console.log(`frame budget: ${fps.toFixed(1)} fps, ${tps.toFixed(0)} ticks/s, dropped ${after.droppedFrames - before.droppedFrames}`);
    expect(fps).toBeGreaterThan(20);
    expect(tps).toBeGreaterThan(110);
    expect(after.droppedFrames - before.droppedFrames).toBeLessThanOrEqual(6); // one GC pause is not a regression
    expect(after.lastFrameMs).toBeLessThan(100);
    expect(after.errors).toEqual([]);
  });

  test('loads the art: sprites and props are drawn, not grey boxes', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/');
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
    await page.goto('/');
    await ready(page);
    await page.screenshot({ path: resolve(SHOTS, 'level-1-start.png') });
    await page.keyboard.press('Backquote');
    await expect(page.locator('#debug')).toBeVisible();
    await expect(page.locator('#debug')).toContainText('ticks/s');
    await expect(page.locator('#hud')).toContainText('lives 3');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowRight');
    await page.screenshot({ path: resolve(SHOTS, 'level-1-mid-debug.png') });
    const h = await hooks(page);
    expect(h.camera.x).toBeGreaterThan(336); // camera left the start bound and is following
    expect(h.player.x).toBeGreaterThan(300);
    expect(h.errors).toEqual([]);
  });

  test('scripted traversal: the browser build replays the Level 1 fixture to the same outcome', async ({ page }) => {
    test.setTimeout(200_000); // 5567 ticks at 120 Hz is 46 s of wall time, more under software GL
    const fixture = JSON.parse(readFileSync(resolve(HERE, '../replay/fixtures/level-1-clear.json'), 'utf8')) as Fixture;
    await page.goto('/');
    await ready(page);
    await page.evaluate((f) => window.__batoman!.replay!(f), fixture);
    // Enemies are live sprites from the first frame: five spawns plus the dormant boss.
    await page.waitForFunction(() => (window.__batoman?.enemies.length ?? 0) >= 6);
    const start = await hooks(page);
    expect(start.boss).toEqual({ hp: 24, phase: 1, engaged: false });
    expect(start.entities).toBeGreaterThanOrEqual(1 + 6 + 1); // player, six enemies, the mover
    // Screenshots at landmarks on the way: the first fight, the one-way platform, the moving platform over the second pit, the first dash gap.
    for (const [name, x] of [['level-1-fight', 380], ['level-1-oneway', 1550], ['level-1-mover', 2380], ['level-1-dash', 3500]] as const) {
      await page.waitForFunction((min) => (window.__batoman?.player.x ?? 0) > min, x, { timeout: 60_000 });
      await page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
    }
    // The first patroller is dead once we are past it, and the boss engages when we reach the arena.
    expect((await hooks(page)).enemies.filter((e) => e.type === 'patroller' && e.x < 900)).toEqual([]);
    await page.waitForFunction(() => window.__batoman?.boss?.engaged === true, null, { timeout: 90_000 });
    await expect(page.locator('#hud')).toContainText('ASWANG PROTOTYPE');
    await page.waitForFunction(() => (window.__batoman?.boss?.phase ?? 0) >= 3, null, { timeout: 90_000 });
    await page.screenshot({ path: resolve(SHOTS, 'level-1-boss.png') });
    await page.waitForFunction(() => window.__batoman?.status !== 'playing', null, { timeout: 120_000 });
    // The boss is dead and its bar gone; the exit opened.
    expect((await hooks(page)).boss).toBeNull();
    await expect(page.locator('#hud')).not.toContainText('ASWANG PROTOTYPE');
    const h = await hooks(page);
    expect(h.status).toBe(fixture.expect.status);
    expect(h.simTicks).toBe(fixture.expect.ticks);
    expect(h.player.hp).toBe(fixture.expect.hp);
    expect(Math.round(h.player.x)).toBe(fixture.expect.x);
    await expect(page.locator('#hud')).toContainText(`lives ${fixture.expect.lives}`);
    expect(h.errors).toEqual([]);
    await expect(page.locator('#hud')).toContainText('LEVEL COMPLETE');
    await page.screenshot({ path: resolve(SHOTS, 'level-1-complete.png') });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__batoman?.status === 'playing');
    expect((await hooks(page)).simTicks).toBeLessThan(200);
  });
});

test.describe('other levels', () => {
  for (const id of ['level-3', 'level-6']) {
    test(`${id} loads as grey-box from ?level= and replays its fixture`, async ({ page }) => {
      test.setTimeout(120_000);
      const fixture = JSON.parse(readFileSync(resolve(HERE, `../replay/fixtures/${id}-clear.json`), 'utf8')) as Fixture;
      const requests: string[] = [];
      page.on('request', (r) => requests.push(r.url()));
      await page.goto(`/?level=${id}`);
      await ready(page);
      const h0 = await hooks(page);
      expect(h0.level).toBe(id);
      expect(h0.errors).toEqual([]);
      // No art block: the player atlas is the only image the level needs.
      expect(requests.some((u) => u.includes('/assets/backdrops/'))).toBe(false);
      await page.screenshot({ path: resolve(SHOTS, `${id}-start.png`) });
      await page.evaluate((f) => window.__batoman!.replay!(f), fixture);
      await page.waitForFunction(() => window.__batoman?.status !== 'playing', null, { timeout: 100_000 });
      const h = await hooks(page);
      expect(h.status).toBe('complete');
      expect(h.simTicks).toBe(fixture.expect.ticks);
      expect(Math.round(h.player.x)).toBe(fixture.expect.x);
      await page.screenshot({ path: resolve(SHOTS, `${id}-complete.png`) });
    });
  }

  test('an unknown level id fails loudly instead of falling back to level 1', async ({ page }) => {
    await page.goto('/?level=level-99');
    await page.waitForFunction(() => (window.__batoman?.errors.length ?? 0) > 0);
    expect((await hooks(page)).errors[0]).toMatch(/unknown level "level-99"/);
  });
});
