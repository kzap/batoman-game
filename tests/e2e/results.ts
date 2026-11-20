import { expect, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';
import { resultsSpotlight } from '../../src/app/shell/results';

/**
 * The results card has finished counting. Waits on the tally state, not on a
 * timeout: the count is wall-clock (400ms a line) and the shell delay before
 * the card is too, but the assertion is the `data-tally="done"` flag.
 */
export async function expectResultsCard(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getElementById('overlay')?.dataset['tally'] === 'done', undefined, { timeout: 10_000 });
  const overlay = page.locator('#overlay');
  await expect(overlay).toHaveClass(/shell-spotlight/);
  await expect(overlay).not.toHaveClass(/shell-dim/);
  await expect(overlay).toContainText('LEVEL CLEAR');
  await expect(overlay).toContainText('kills');
  await expect(overlay).toContainText('clear bonus');
  await expect(overlay).toContainText('heart bonus');
  const hud = (await page.locator('.hud-score').innerText()).trim();
  await expect(page.locator('.shell-tally-score')).toHaveText(hud);
  const bg = await overlay.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('radial-gradient');

  const h = await page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
  const viewport = await overlay.evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
  const expected = resultsSpotlight(h.player, h.camera, viewport);
  const got = await overlay.evaluate((el) => ({
    x: Number.parseFloat(el.style.getPropertyValue('--spot-x')),
    y: Number.parseFloat(el.style.getPropertyValue('--spot-y')),
    clear: Number.parseFloat(el.style.getPropertyValue('--spot-clear')),
    edge: Number.parseFloat(el.style.getPropertyValue('--spot-edge')),
  }));
  expect(got.x).toBeCloseTo(expected.x, 3);
  expect(got.y).toBeCloseTo(expected.y, 3);
  expect(got.clear).toBeCloseTo(expected.clear, 3);
  expect(got.edge).toBeCloseTo(expected.edge, 3);
  expect(got.x).toBeGreaterThan(0);
  expect(got.x).toBeLessThan(viewport.w);
  expect(got.y).toBeGreaterThan(0);
  expect(got.y).toBeLessThan(viewport.h);
}
