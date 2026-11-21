import { expect, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';
import { formatScore, SCORE } from '../../src/app/shell/score';

/** Visible line amounts on a finished results card. `total` is the HUD score, including earlier levels. */
export interface TallyExpect {
  readonly kills: number;
  readonly clear: number;
  readonly hearts: number;
  readonly total?: number;
}

const lineAmount = (page: Page, id: string) => page.locator(`[data-line="${id}"] .shell-tally-num, [data-line="${id}"] .shell-tally-score`);

/**
 * The results card has finished counting. Waits on the tally state, not on a
 * timeout: the count is wall-clock (400ms a line) and the shell delay before
 * the card is too, but the assertion is the `data-tally="done"` flag.
 */
export async function expectResultsCard(page: Page, lines?: TallyExpect): Promise<void> {
  await page.waitForFunction(() => document.getElementById('overlay')?.dataset['tally'] === 'done', undefined, { timeout: 10_000 });
  const overlay = page.locator('#overlay');
  await expect(overlay).toHaveClass(/shell-spotlight/);
  await expect(overlay).not.toHaveClass(/shell-dim/);
  await expect(overlay).toContainText('LEVEL CLEAR');
  const hud = (await page.locator('.hud-score').innerText()).trim();
  await expect(page.locator('.shell-tally-score')).toHaveText(lines?.total !== undefined ? formatScore(lines.total) : hud);

  const h = await page.evaluate(() => JSON.parse(JSON.stringify(window.__batoman)) as TestHooks);
  const kills = Number((await lineAmount(page, 'kills').innerText()).trim());
  const clear = Number((await lineAmount(page, 'clear').innerText()).trim());
  const hearts = Number((await lineAmount(page, 'hearts').innerText()).trim());
  const total = Number((await page.locator('.shell-tally-score').innerText()).trim());
  expect(clear).toBe(lines?.clear ?? SCORE.levelClear);
  expect(hearts).toBe(lines?.hearts ?? h.player.hp * SCORE.perHeart);
  expect(kills).toBeGreaterThanOrEqual(0);
  if (lines) expect(kills).toBe(lines.kills);
  expect(total).toBe(lines?.total ?? Number(hud));
  // The three lines are this level. Earlier levels sit in the gap under the HUD total.
  expect(total - (kills + clear + hearts)).toBeGreaterThanOrEqual(0);

  const bg = await overlay.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('radial-gradient');
  const overlayBox = await overlay.boundingBox();
  const cardBox = await page.locator('.shell-card').boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  const spot = await overlay.evaluate((el) => ({
    x: Number.parseFloat(el.style.getPropertyValue('--spot-x')),
    y: Number.parseFloat(el.style.getPropertyValue('--spot-y')),
    clear: Number.parseFloat(el.style.getPropertyValue('--spot-clear')),
    edge: Number.parseFloat(el.style.getPropertyValue('--spot-edge')),
  }));
  // The exit of every shipped level is on the right edge, so Ando is in the right half and the card stays off him.
  expect(spot.x).toBeGreaterThan(overlayBox!.width * 0.5);
  expect(spot.x).toBeLessThan(overlayBox!.width);
  expect(spot.y).toBeGreaterThan(0);
  expect(spot.y).toBeLessThan(overlayBox!.height);
  expect(spot.clear).toBeGreaterThan(48);
  expect(spot.edge).toBeGreaterThan(spot.clear);
  const cardX = cardBox!.x - overlayBox!.x;
  const cardY = cardBox!.y - overlayBox!.y;
  const covered = spot.x >= cardX && spot.x <= cardX + cardBox!.width && spot.y >= cardY && spot.y <= cardY + cardBox!.height;
  expect(covered).toBe(false);
}
