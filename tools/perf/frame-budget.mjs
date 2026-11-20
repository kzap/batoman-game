/* global process, console, window, performance */
/**
 * Frame-rate probe for a dressed level. Software WebGL, 1280x720, the same
 * viewport as the e2e frame budget. Counts `window.__batoman.frames` over 4s
 * after the first 20 frames, so a compile hitch is not the number.
 *
 *   npm run preview
 *   node tools/perf/frame-budget.mjs
 *   node tools/perf/frame-budget.mjs 'http://localhost:4173/?level=level-4'
 *
 * Not part of `npm run ci`. The e2e spec is the regression gate; this script
 * is how the Phase 8.1 numbers in docs/TDD.md §10 were taken.
 */
import { chromium } from '@playwright/test';

const urls = process.argv.slice(2);
const targets = urls.length
  ? urls
  : ['http://localhost:4173/?level=level-1', 'http://localhost:4173/?level=level-4', 'http://localhost:4173/?level=level-1&post=0'];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const url of targets) {
  const samples = [];
  for (let i = 0; i < 2; i++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__batoman?.ready === true && window.__batoman.frames > 20, null, { timeout: 30_000 });
    const before = await page.evaluate(() => ({ frames: window.__batoman.frames, t: performance.now(), errors: window.__batoman.errors.slice() }));
    await page.waitForTimeout(4000);
    const after = await page.evaluate(() => ({ frames: window.__batoman.frames, t: performance.now() }));
    samples.push((after.frames - before.frames) / ((after.t - before.t) / 1000));
    if (before.errors.length) console.log(`  errors: ${before.errors.join('; ')}`);
  }
  console.log(`${url}  ${samples.map((n) => n.toFixed(2)).join(', ')} fps`);
}

await browser.close();
