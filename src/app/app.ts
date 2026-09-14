import { FixedClock } from '@core/sim/clock';
import { lerp } from '@core/math/vec2';
import { World, type WorldSnapshot } from '@game/world';
import { Stage } from '@render/stage';

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
    errors: [],
  };
  window.__batoman = hooks;
  window.addEventListener('error', (e) => hooks.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => hooks.errors.push(String(e.reason)));
  return hooks;
}

export class App {
  private readonly clock = new FixedClock();
  private readonly world = new World();
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
  }

  start(): void {
    this.lastTime = performance.now();
    this.hooks.ready = true;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
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
      this.world.step();
      this.current = this.world.snapshot();
    }
    this.hooks.simTicks = this.current.tick;

    this.present(step.alpha);
    this.hooks.frames += 1;
    this.rafId = requestAnimationFrame(this.frame);
  };

  /** Interpolate between the two most recent snapshots and draw. */
  private present(alpha: number): void {
    this.stage.setMarker(lerp(this.previous.marker, this.current.marker, alpha));
    this.stage.render();
  }
}
