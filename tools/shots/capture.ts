/**
 * Capture the PR stills (and a short walk clip) from the production build.
 *
 *   npm run shots
 *   npm run shots -- --baseline v2 --slug my-change
 *
 * Head shots come from this working tree. `--baseline <ref>` checks that ref
 * out in a temporary worktree, builds it, and captures the same scenes into
 * a sibling folder. Both use a 1280×720 viewport and SwiftShader, one page
 * at a time, and the same tick schedule (`tools/shots/plan.ts`), so the
 * frames line up.
 *
 * Lockstep: gameplay stills open with `?lockstep=1&ticksPerFrame=0`. That is
 * a no-op until PR #27 lands `window.__batoman.advance`. The script calls
 * `advance` when the function is there and replays the same inputs on the
 * production clock when it is not. It does not require the hook. The clip
 * stays on the production clock either way, so the video shows the run
 * instead of one jumped frame. `advance` is what removes the last few ticks
 * of overshoot (enemy phase, idle frame) across machines.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import {
  ASSET_ROOT,
  CLIP,
  clipSchedule,
  DEFAULT_PORT,
  midSchedule,
  parseShotArgs,
  prImageUrl,
  beforeName,
  RIGHT_BITS,
  spawnSchedule,
  STILLS,
  stillUrl,
  SWIFTSHADER_ARGS,
  VIEWPORT,
  type ReplaySchedule,
  type ShotArgs,
  type ShotManifest,
  type ShotMeasure,
  type ShotScene,
} from './plan.js';

const USAGE = `npm run shots -- [options]

  --out <dir>            head shots (default pr-shots/head)
  --baseline <git-ref>   also capture that ref into --baseline-out
  --baseline-out <dir>   default pr-shots/baseline
  --slug <name>          copy shots into docs/pr-assets/<name>/ for the PR body
  --port <n>             vite preview port (default ${DEFAULT_PORT})
  --no-clip              skip the walk clip
  --skip-build           use the existing dist/ for the head capture
  --help

Commit the pngs the PR body shows. Embed each one as
  https://github.com/kzap/batoman-game/raw/<branch>/docs/pr-assets/<slug>/level-1-mid.png
A relative path does not render in the PR body. A CI artifact zip does not
either. The webm plays inline only after it is uploaded as a GitHub attachment.`;

interface Snap {
  x: number;
  cameraX: number;
  simTicks: number;
  pose: string;
  hp: number;
  screen: string;
  errors: string[];
  hasAdvance: boolean;
}

async function main(): Promise<void> {
  const args = parseShotArgs(process.argv.slice(2));
  if (args.help) {
    console.info(USAGE);
    return;
  }
  assertRepoRoot();
  const head = await captureTree(process.cwd(), args.out, args, args.skipBuild);
  const baseline = args.baseline
    ? await captureBaseline(args.baseline, args.baselineOut, args)
    : null;
  const manifest: ShotManifest = {
    viewport: VIEWPORT,
    webgl: 'swiftshader',
    stills: STILLS.map((scene) => scene.file),
    clip: args.clip ? CLIP.file : null,
    head,
    baseline,
  };
  await writeFile(path.join(args.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (args.slug) await publishSlug(args, manifest);
  console.info(`shots written to ${args.out}`);
  if (args.baseline) console.info(`baseline written to ${args.baselineOut}`);
}

function assertRepoRoot(): void {
  if (!existsSync('package.json') || !existsSync('playwright.config.ts')) {
    throw new Error('run npm run shots from the repository root');
  }
}

async function captureBaseline(ref: string, outDir: string, args: ShotArgs): Promise<ShotManifest['head']> {
  const dir = await mkdtemp(path.join(tmpdir(), 'batoman-shots-'));
  console.info(`worktree ${ref} -> ${dir}`);
  await run('git', ['worktree', 'add', '--detach', dir, ref], process.cwd());
  try {
    const modules = path.join(dir, 'node_modules');
    if (!existsSync(modules)) await symlink(path.resolve('node_modules'), modules, 'dir');
    return await captureTree(dir, outDir, { ...args, port: args.port + 1 }, false);
  } finally {
    await run('git', ['worktree', 'remove', '--force', dir], process.cwd()).catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
    });
  }
}

async function captureTree(
  cwd: string,
  outDir: string,
  args: ShotArgs,
  skipBuild: boolean,
): Promise<ShotManifest['head']> {
  if (!skipBuild) {
    console.info(`building ${cwd}`);
    await run('npm', ['run', 'build'], cwd);
  } else if (!existsSync(path.join(cwd, 'dist', 'index.html'))) {
    throw new Error(`dist/index.html is missing in ${cwd}; run without --skip-build`);
  }
  await mkdir(outDir, { recursive: true });
  const preview = startPreview(cwd, args.port);
  const browser = await chromium.launch({ headless: true, args: [...SWIFTSHADER_ARGS] });
  try {
    await waitForHttp(`http://127.0.0.1:${args.port}/`, preview);
    const baseURL = `http://127.0.0.1:${args.port}`;
    const measures = await captureStills(browser, baseURL, outDir);
    if (args.clip) await captureClip(browser, baseURL, path.join(outDir, CLIP.file));
    return measures;
  } finally {
    await browser.close();
    await stop(preview);
  }
}

function startPreview(cwd: string, port: number): ChildProcess {
  const viteJs = path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  return spawn(process.execPath, [viteJs, 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function captureStills(
  browser: Browser,
  baseURL: string,
  outDir: string,
): Promise<ShotManifest['head']> {
  const context = await browser.newContext({ viewport: { ...VIEWPORT }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    let start: ShotMeasure | null = null;
    let mid: ShotMeasure | null = null;
    for (const scene of STILLS) {
      console.info(`scene ${scene.id}`);
      const measure = await captureScene(page, `${baseURL}${stillUrl(scene.path, scene.lockstep)}`, scene, path.join(outDir, scene.file));
      if (scene.id === 'level-1-start') start = measure;
      if (scene.id === 'level-1-mid') mid = measure;
    }
    if (!start || !mid) throw new Error('level stills did not record a sim measure');
    return { start, mid };
  } finally {
    await context.close();
  }
}

async function captureScene(page: Page, url: string, scene: ShotScene, dest: string): Promise<ShotMeasure | null> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  if (scene.id === 'title') {
    await page.locator('#overlay').getByText('BATOMAN').waitFor({ state: 'visible' });
    await paintAndShoot(page, dest);
  } else if (scene.id === 'editor') {
    await page.waitForFunction(() => {
      const h = (globalThis as { __batoman?: { editor?: unknown; mode?: string } }).__batoman;
      return h?.editor != null && h.mode === 'edit';
    });
    await page.locator('.editor-problems').waitFor({ state: 'visible' });
    await paintAndShoot(page, dest);
  } else if (scene.id === 'level-1-start') {
    return await freezeSchedule(page, spawnSchedule(), dest, 'idle');
  } else if (scene.id === 'level-1-mid') {
    return await freezeSchedule(page, midSchedule(), dest, 'run');
  }
  await assertDrawn(page);
  return null;
}

/**
 * Land on `schedule` and screenshot before the production clock can walk
 * further. `advance` freezes the sim between calls. A replay on the wall
 * clock is screenshotted in the same turn the tick count is reached.
 */
async function freezeSchedule(page: Page, schedule: ReplaySchedule, dest: string, pose: string): Promise<ShotMeasure> {
  const useAdvance = await page.evaluate(() => {
    const h = (globalThis as { __batoman?: { advance?: unknown } }).__batoman;
    return typeof h?.advance === 'function';
  });
  if (useAdvance) {
    await driveWithAdvance(page, schedule);
  } else {
    await page.evaluate((fixture) => {
      const h = (globalThis as { __batoman?: { replay?: (f: typeof fixture) => void } }).__batoman;
      if (!h?.replay) throw new Error('window.__batoman.replay is missing');
      h.replay(fixture);
    }, { seed: schedule.seed, inputs: schedule.inputs.map((pair) => [pair[0], pair[1]]) });
    // Pause inside the poll that first sees the target tick. The production clock
    // would otherwise keep stepping during the trip back to Node, and the still
    // would drift. The pause card is hidden so the picture stays the play view.
    // `advance` already leaves the sim frozen, so that path does not pause.
    await page.waitForFunction((target) => {
      const w = globalThis as unknown as {
        __batoman?: { simTicks?: number; screen?: string };
        document: { getElementById(id: string): { style: { display: string } } | null };
        KeyboardEvent: new (type: string, init: { code: string; bubbles: boolean }) => Event;
        dispatchEvent(ev: Event): boolean;
      };
      const h = w.__batoman;
      if (!h || (h.simTicks ?? 0) < target) return false;
      if (h.screen === 'playing') w.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
      const overlay = w.document.getElementById('overlay');
      if (overlay) overlay.style.display = 'none';
      return h.screen === 'paused';
    }, schedule.targetTicks, { timeout: 45_000 });
  }
  const shot = await snap(page);
  assertHealthy(shot, pose);
  if (!useAdvance) {
    // The sim is paused on this frame. Shoot it before anything else presents.
    await page.screenshot({ path: dest, animations: 'disabled' });
  } else {
    await paintAndShoot(page, dest);
  }
  await assertDrawn(page);
  const mode = useAdvance ? 'advance' : 'replay';
  console.info(
    `  ${mode} target ${schedule.targetTicks} landed tick ${shot.simTicks} x=${shot.x.toFixed(1)} cam=${shot.cameraX.toFixed(1)} ${shot.pose}`,
  );
  return measure(mode, schedule.targetTicks, shot);
}

async function driveWithAdvance(page: Page, schedule: ReplaySchedule): Promise<void> {
  // Spawn is empty inputs only. Mid is a single run of `right`, matching the replay bits.
  const run = schedule.inputs.find((pair) => pair[0] === RIGHT_BITS);
  if (!run) {
    await stepAdvance(page, schedule.targetTicks);
    return;
  }
  await page.keyboard.down('ArrowRight');
  await stepAdvance(page, run[1]);
  await page.keyboard.up('ArrowRight');
  const idle = schedule.inputs.find((pair) => pair[0] === 0);
  if (idle) await stepAdvance(page, idle[1]);
}

async function stepAdvance(page: Page, ticks: number): Promise<void> {
  await page.evaluate((n) => {
    const h = (globalThis as { __batoman?: { advance?: ((ticks: number) => void) | null } }).__batoman;
    if (typeof h?.advance !== 'function') throw new Error('window.__batoman.advance is missing');
    h.advance(n);
  }, ticks);
}

async function captureClip(browser: Browser, baseURL: string, dest: string): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'batoman-clip-'));
  const context = await browser.newContext({
    viewport: { ...VIEWPORT },
    deviceScaleFactor: 1,
    recordVideo: { dir, size: { ...VIEWPORT } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const schedule = clipSchedule();
  try {
    console.info('scene level-1-walk');
    await page.goto(`${baseURL}${CLIP.path}`, { waitUntil: 'domcontentloaded' });
    await waitReady(page);
    await page.evaluate((fixture) => {
      const h = (globalThis as { __batoman?: { replay?: (f: typeof fixture) => void } }).__batoman;
      if (!h?.replay) throw new Error('window.__batoman.replay is missing');
      h.replay(fixture);
    }, { seed: schedule.seed, inputs: schedule.inputs.map((pair) => [pair[0], pair[1]]) });
    await page.waitForFunction((target) => {
      const h = (globalThis as { __batoman?: { simTicks?: number } }).__batoman;
      return (h?.simTicks ?? 0) >= target;
    }, schedule.targetTicks);
    const shot = await snap(page);
    assertHealthy(shot, 'run');
    console.info(`  clip tick ${shot.simTicks} x=${shot.x.toFixed(1)} ${shot.pose}`);
  } finally {
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(dest);
    await rm(dir, { recursive: true, force: true });
  }
}

async function paintAndShoot(page: Page, dest: string): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
    if (!raf) {
      resolve();
      return;
    }
    raf(() => raf(() => resolve()));
  }));
  await page.screenshot({ path: dest, animations: 'disabled' });
}

async function waitReady(page: Page): Promise<void> {
  try {
    await page.waitForFunction(() => {
      const h = (globalThis as { __batoman?: { ready?: boolean; frames?: number } }).__batoman;
      return h?.ready === true && (h.frames ?? 0) > 10;
    });
  } catch (err) {
    const errors = await page.evaluate(() => {
      const h = (globalThis as { __batoman?: { errors?: string[] } }).__batoman;
      return h?.errors ?? [];
    }).catch(() => [] as string[]);
    const why = errors.length > 0 ? `: ${errors.join('; ')}` : '';
    throw new Error(`game did not become ready${why}`, { cause: err });
  }
  const shot = await snap(page);
  if (shot.errors.length > 0) throw new Error(shot.errors.join('\n'));
}

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const h = (globalThis as {
      __batoman?: {
        player: { x: number; pose: string; hp: number };
        camera: { x: number };
        simTicks: number;
        screen: string;
        errors: string[];
        advance?: unknown;
      };
    }).__batoman;
    if (!h) throw new Error('window.__batoman is missing');
    return {
      x: h.player.x,
      cameraX: h.camera.x,
      simTicks: h.simTicks,
      pose: h.player.pose,
      hp: h.player.hp,
      screen: h.screen,
      errors: h.errors.slice(),
      hasAdvance: typeof h.advance === 'function',
    };
  });
}

function assertHealthy(shot: Snap, pose: string): void {
  if (shot.errors.length > 0) throw new Error(shot.errors.join('\n'));
  if (shot.hp !== 3) throw new Error(`expected full hp, got ${shot.hp} at tick ${shot.simTicks}`);
  if (shot.pose !== pose) throw new Error(`expected pose ${pose}, got ${shot.pose} at tick ${shot.simTicks}`);
}

function measure(mode: ShotMeasure['mode'], targetTicks: number, shot: Snap): ShotMeasure {
  return {
    mode,
    targetTicks,
    simTicks: shot.simTicks,
    playerX: Number(shot.x.toFixed(2)),
    cameraX: Number(shot.cameraX.toFixed(2)),
    pose: shot.pose,
    hp: shot.hp,
  };
}

/** Same probe the smoke spec uses: a flat clear color means the frame is blank. */
async function assertDrawn(page: Page): Promise<void> {
  const distinct = await page.evaluate(() => {
    const doc = (globalThis as { document?: { getElementById(id: string): CanvasLike | null } }).document;
    const canvas = doc?.getElementById('game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!gl) return -1;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const seen = new Set<number>();
    for (let i = 0; i < px.length; i += 4 * 97) {
      const r = px[i] ?? 0;
      const g = px[i + 1] ?? 0;
      const b = px[i + 2] ?? 0;
      seen.add((r << 16) | (g << 8) | b);
      if (seen.size > 50) break;
    }
    return seen.size;
  });
  if (distinct < 5) throw new Error(`canvas looks blank (${distinct} sampled colors)`);
}

interface GlLike {
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  RGBA: number;
  UNSIGNED_BYTE: number;
  readPixels(x: number, y: number, w: number, h: number, format: number, type: number, pixels: Uint8Array): void;
}

interface CanvasLike {
  getContext(kind: 'webgl2' | 'webgl'): GlLike | null;
}

async function publishSlug(args: ShotArgs, manifest: ShotManifest): Promise<void> {
  const slug = args.slug;
  if (!slug) return;
  const dest = path.join(ASSET_ROOT, slug);
  await mkdir(dest, { recursive: true });
  const files = [...STILLS.map((scene) => scene.file), ...(args.clip ? [CLIP.file] : [])];
  for (const file of files) {
    await copyFile(path.join(args.out, file), path.join(dest, file));
    if (args.baseline) await copyFile(path.join(args.baselineOut, file), path.join(dest, beforeName(file)));
  }
  await writeFile(path.join(dest, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.info(`copied into ${dest}`);
  for (const file of files.filter((name) => name.endsWith('.png'))) {
    console.info(prImageUrl('<branch>', slug, file));
  }
}

async function waitForHttp(url: string, child: ChildProcess): Promise<void> {
  let log = '';
  const take = (chunk: Buffer): void => {
    log = (log + chunk.toString()).slice(-2000);
  };
  child.stdout?.on('data', take);
  child.stderr?.on('data', take);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite preview exited ${child.exitCode}\n${log}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.status < 500) return;
    } catch {
      // Preview is still binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${url}\n${log}`);
}

function run(cmd: string, cmdArgs: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${cmdArgs.join(' ')} exited ${code} in ${cwd}`));
    });
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5_000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
