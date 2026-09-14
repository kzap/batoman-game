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

test.describe('grey-box', () => {
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
    // Software WebGL in CI is slow; 30 fps is the floor, and the sim must still run at full rate.
    expect(fps).toBeGreaterThan(30);
    expect(tps).toBeGreaterThan(110);
    expect(after.droppedFrames - before.droppedFrames).toBeLessThanOrEqual(6); // one GC pause is not a regression
    expect(after.lastFrameMs).toBeLessThan(100);
    expect(after.errors).toEqual([]);
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
    test.setTimeout(120_000); // 2514 ticks at 120 Hz is 21 s of wall time, more under software GL
    const fixture = JSON.parse(readFileSync(resolve(HERE, '../replay/fixtures/level-1-clear.json'), 'utf8')) as Fixture;
    await page.goto('/');
    await ready(page);
    await page.evaluate((f) => window.__batoman!.replay!(f), fixture);
    await page.waitForFunction(() => window.__batoman?.status !== 'playing', null, { timeout: 90_000 });
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
