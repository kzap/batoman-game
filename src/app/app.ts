import { lerp } from '@core/math/vec2';
import { FixedClock } from '@core/sim/clock';
import { World, type WorldSnapshot } from '@game/world';
import { Stage } from '@render/stage';
import level1 from '@content/levels/level-1.json';
import { parseLevel } from '@content/level';
import { Keyboard } from './keyboard';

/**
 * Hooks exposed on `window.__batoman` for Playwright and the game-testing skill.
 * Tests read these; nothing outside App should write them.
 */
export interface TestHooks {
  readonly version: string;
  ready: boolean;
  frames: number;
  simTicks: number;
  droppedFrames: number;
  lastFrameMs: number;
  /** Latest sim snapshot fields tests care about; updated every frame. */
  player: { x: number; y: number; pose: string; hp: number };
  status: string;
  readonly errors: string[];
}

declare global {
  interface Window {
    __batoman?: TestHooks;
  }
}

/**
 * Install the test hooks and global error capture. Called before anything that
 * can throw (WebGL context creation included) so a boot failure lands in
 * `hooks.errors` instead of vanishing.
 */
export function installHooks(): TestHooks {
  const hooks: TestHooks = {
    version: __APP_VERSION__,
    ready: false,
    frames: 0,
    simTicks: 0,
    droppedFrames: 0,
    lastFrameMs: 0,
    player: { x: 0, y: 0, pose: 'idle', hp: 0 },
    status: 'playing',
    errors: [],
  };
  window.__batoman = hooks;
  window.addEventListener('error', (e) => hooks.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => hooks.errors.push(String(e.reason)));
  return hooks;
}

/** Provisional pixel-to-stage mapping until the renderer owns it: one tile per stage unit. */
const PIXELS_PER_UNIT = 32;
/** The Phase 0 reference marker rests 1.5 units above the stage floor. */
const MARKER_REST_HEIGHT = 1.5;

export class App {
  private readonly clock = new FixedClock();
  private readonly world = new World(parseLevel(level1, 'level-1'));
  private readonly keyboard = new Keyboard();
  private readonly stage: Stage;
  private previous: WorldSnapshot;
  private current: WorldSnapshot;
  private lastTime = 0;
  private rafId = 0;
  private readonly onResize = (): void => this.stage.resize();

  constructor(
    canvas: HTMLCanvasElement,
    readonly hooks: TestHooks,
  ) {
    this.stage = new Stage({ canvas });
    this.stage.addReferenceScene();
    this.current = this.world.snapshot();
    this.previous = this.current;
    window.addEventListener('resize', this.onResize);
    this.keyboard.attach();
  }

  start(): void {
    this.lastTime = performance.now();
    this.hooks.ready = true;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.keyboard.detach();
    this.stage.dispose();
    this.hooks.ready = false;
  }

  private readonly frame = (now: number): void => {
    const frameMs = now - this.lastTime;
    this.lastTime = now;
    this.hooks.lastFrameMs = frameMs;

    const step = this.clock.advance(frameMs / 1000);
    if (step.dropped) this.hooks.droppedFrames += 1;

    for (let i = 0; i < step.ticks; i++) {
      this.previous = this.current;
      this.world.step(this.keyboard.frame());
      this.current = this.world.snapshot();
    }
    this.hooks.simTicks = this.current.tick;
    const pl = this.current.player;
    this.hooks.player = { x: pl.x, y: pl.y, pose: pl.pose, hp: pl.hp };
    this.hooks.status = this.current.status;

    this.present(step.alpha);
    this.hooks.frames += 1;
    this.rafId = requestAnimationFrame(this.frame);
  };

  /**
   * Interpolate between the two most recent snapshots and draw. Until the
   * real renderer lands, the player is the reference marker: sim pixels map to
   * stage units at 32 px per unit, relative to the spawn point.
   */
  private present(alpha: number): void {
    const a = this.previous.player;
    const b = this.current.player;
    const spawn = this.world.level.spawn;
    const p = lerp({ x: a.x, y: a.y }, { x: b.x, y: b.y }, alpha);
    this.stage.setMarker({
      x: (p.x + b.w / 2 - spawn.x) / PIXELS_PER_UNIT,
      y: (p.y - spawn.y) / PIXELS_PER_UNIT + MARKER_REST_HEIGHT,
    });
    this.stage.render();
  }
}
