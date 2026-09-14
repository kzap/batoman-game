import { expect, test, type Page } from '@playwright/test';
import type { TestHooks } from '../../src/app/app';

declare global {
  interface Window {
    __batoman?: TestHooks;
  }
}

const readHooks = (page: Page) => page.evaluate(() => window.__batoman ?? null);

const waitForFrames = (page: Page, n: number) =>
  page.waitForFunction((min) => (window.__batoman?.frames ?? 0) > min, n);

test.describe('smoke', () => {
  test('boots, renders frames, and runs the sim without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    await page.waitForFunction(() => window.__batoman?.ready === true);
    await waitForFrames(page, 30);

    const h = await readHooks(page);
    expect(h).not.toBeNull();
    expect(h!.frames).toBeGreaterThan(30);
    expect(h!.simTicks).toBeGreaterThan(30);
    expect(h!.errors).toEqual([]);
    expect(consoleErrors).toEqual([]);

    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test('draws non-background pixels (renderer actually produced an image)', async ({ page }) => {
    await page.goto('/');
    await waitForFrames(page, 10);

    const distinct = await page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement;
      const gl = c.getContext('webgl2') ?? c.getContext('webgl');
      if (!gl) return -1;
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const seen = new Set<number>();
      for (let i = 0; i < px.length; i += 4 * 97) {
        seen.add((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!);
        if (seen.size > 50) break;
      }
      return seen.size;
    });
    expect(distinct).toBeGreaterThan(5);
  });
});

test.describe('controls', () => {
  test('keyboard drives the sim: run right, tap to hop', async ({ page }) => {
    await page.goto('/');
    await waitForFrames(page, 10);
    const start = (await readHooks(page))!.player;
    expect(start.pose).toBe('idle');

    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    const running = (await readHooks(page))!.player;
    await page.keyboard.up('ArrowRight');
    expect(running.x).toBeGreaterThan(start.x + 40);
    expect(running.pose).toBe('run');

    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await page.waitForFunction((y) => (window.__batoman?.player.y ?? 0) > y + 1, start.y);
    await page.waitForFunction(() => window.__batoman?.player.pose === 'idle');
    expect((await readHooks(page))!.errors).toEqual([]);
  });
});
