import { FixedClock } from '@core/sim/clock';
import { lerp } from '@core/math/vec2';
import { World, type WorldSnapshot } from '@game/world';
import { Stage } from '@render/stage';
import type { Mesh } from 'three';

/**
 * Hooks exposed on `window.__batoman` for Playwright and the game-testing skill.
 * Read-only from the outside; the tests assert against them.
 */
export interface TestHooks {
  readonly version: string;
  readonly ready: boolean;
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

export class App {
  private readonly clock = new FixedClock();
  private readonly world = new World();
  private readonly stage: Stage;
  private readonly marker: Mesh;
  private previous: WorldSnapshot;
  private current: WorldSnapshot;
  private lastTime = 0;
  private rafId = 0;
  readonly hooks: TestHooks;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new Stage({ canvas });
    this.marker = this.stage.addReferenceScene().marker;
    this.current = this.world.snapshot();
    this.previous = this.current;

    this.hooks = {
      version: __APP_VERSION__,
      ready: false,
      frames: 0,
      simTicks: 0,
      droppedFrames: 0,
      lastFrameMs: 0,
      errors: [],
    };
    window.__batoman = this.hooks;

    window.addEventListener('resize', () => this.stage.resize());
    window.addEventListener('error', (e) => this.hooks.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => this.hooks.errors.push(String(e.reason)));
  }

  start(): void {
    this.lastTime = performance.now();
    (this.hooks as { ready: boolean }).ready = true;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.stage.dispose();
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
    this.hooks.simTicks = this.world.currentTick;

    this.present(step.alpha);
    this.hooks.frames += 1;
    this.rafId = requestAnimationFrame(this.frame);
  };

  /** Interpolate between the two most recent snapshots and draw. */
  private present(alpha: number): void {
    const p = lerp(this.previous.marker, this.current.marker, alpha);
    this.marker.position.set(p.x, p.y, 0);
    this.stage.render();
  }
}
