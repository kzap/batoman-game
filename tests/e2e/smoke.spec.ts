import { expect, test, type Page } from '@playwright/test';

interface Hooks {
  version: string;
  ready: boolean;
  frames: number;
  simTicks: number;
  droppedFrames: number;
  lastFrameMs: number;
  errors: string[];
}

const hooks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __batoman?: Hooks }).__batoman ?? null);

test.describe('smoke', () => {
  test('boots, renders frames, and runs the sim without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    await page.waitForFunction(() => (window as unknown as { __batoman?: Hooks }).__batoman?.ready === true);

    // Let the loop run for a moment.
    await page.waitForFunction(() => ((window as unknown as { __batoman?: Hooks }).__batoman?.frames ?? 0) > 30);

    const h = await hooks(page);
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
    await page.waitForFunction(() => ((window as unknown as { __batoman?: Hooks }).__batoman?.frames ?? 0) > 10);

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
