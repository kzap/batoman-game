import { lerp } from '@core/math/vec2';
import { FixedClock } from '@core/sim/clock';
import type { InputFrame } from '@core/sim/input';
import { decodeInputs, type ReplayInputs } from '@core/sim/replay';
import { World, type WorldSnapshot } from '@game/world';
import { EntityView } from '@render/entity-view';
import { LevelView } from '@render/level-view';
import { Stage } from '@render/stage';
import { toUnits } from '@render/units';
import level1 from '@content/levels/level-1.json';
import { parseLevel, type LevelJson } from '@content/level';
import { DebugOverlay } from './debug';
import { Hud } from './hud';
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
  camera: { x: number; y: number };
  status: string;
  readonly errors: string[];
  /**
   * Restart the level and feed a recorded input sequence instead of the
   * keyboard. Lets e2e tests traverse the level deterministically and check
   * the browser build reaches the same outcome as the headless replay.
   */
  replay: ((fixture: ReplayInputs) => void) | null;
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
    camera: { x: 0, y: 0 },
    status: 'playing',
    errors: [],
    replay: null,
  };
  window.__batoman = hooks;
  window.addEventListener('error', (e) => hooks.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => hooks.errors.push(String(e.reason)));
  return hooks;
}

export class App {
  private readonly clock = new FixedClock();
  private readonly level: LevelJson = parseLevel(level1, 'level-1');
  private world: World;
  private readonly keyboard = new Keyboard();
  private readonly stage: Stage;
  private readonly levelView: LevelView;
  private readonly entities = new EntityView();
  private readonly debug: DebugOverlay;
  private readonly hud: Hud;
  private replay: Generator<InputFrame> | null = null;
  /** Set by a respawn: the next present must not lerp from the death spot. */
  private teleported = false;
  private jumpWasHeld = false;
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
    this.levelView = new LevelView(this.level);
    this.stage.scene.add(this.levelView.group, this.entities.group);
    this.world = this.newWorld(1);
    this.current = this.world.snapshot();
    this.previous = this.current;
    this.debug = new DebugOverlay(document.getElementById('debug') ?? document.createElement('div'));
    this.debug.onToggle = (on): void => this.entities.setOutlines(on);
    this.hud = new Hud(document.getElementById('hud') ?? document.createElement('div'));
    window.addEventListener('resize', this.onResize);
    this.keyboard.attach();
    this.debug.attach();
    hooks.replay = (fixture): void => this.startReplay(fixture);
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
    this.debug.detach();
    this.entities.dispose();
    this.levelView.dispose();
    this.stage.dispose();
    this.hooks.ready = false;
    this.hooks.replay = null;
  }

  private newWorld(seed: number): World {
    const w = new World(this.level, seed);
    w.events.on('respawn', () => (this.teleported = true));
    return w;
  }

  private restart(seed = 1): void {
    this.world = this.newWorld(seed);
    this.current = this.world.snapshot();
    this.previous = this.current;
  }

  private startReplay(fixture: ReplayInputs): void {
    this.restart(fixture.seed);
    this.replay = decodeInputs(fixture.inputs);
  }

  private nextInput(): InputFrame {
    if (this.replay) {
      const r = this.replay.next();
      if (!r.done) return r.value;
      this.replay = null;
    }
    const f = this.keyboard.frame();
    // Restart on a fresh press only, so a jump held into the exit does not skip the banner.
    if (this.current.status !== 'playing' && f.jump && !this.jumpWasHeld) this.restart();
    this.jumpWasHeld = f.jump;
    return f;
  }

  private readonly frame = (now: number): void => {
    const frameMs = now - this.lastTime;
    this.lastTime = now;
    this.hooks.lastFrameMs = frameMs;

    const step = this.clock.advance(frameMs / 1000);
    if (step.dropped) this.hooks.droppedFrames += 1;

    for (let i = 0; i < step.ticks; i++) {
      this.previous = this.current;
      this.world.step(this.nextInput());
      this.current = this.world.snapshot();
      if (this.teleported) {
        this.previous = this.current;
        this.teleported = false;
      }
    }
    this.publish();
    this.present(step.alpha);
    this.debug.update(now, this.current, { frameMs, droppedFrames: this.hooks.droppedFrames, entities: this.entities.entityCount });
    this.hud.update(this.current);
    this.hooks.frames += 1;
    this.rafId = requestAnimationFrame(this.frame);
  };

  private publish(): void {
    const s = this.current;
    this.hooks.simTicks = s.tick;
    this.hooks.player = { x: s.player.x, y: s.player.y, pose: s.player.pose, hp: s.player.hp };
    this.hooks.camera = { x: s.camera.x, y: s.camera.y };
    this.hooks.status = s.status;
  }

  /** Interpolate between the two most recent snapshots, point the camera, and draw. */
  private present(alpha: number): void {
    this.entities.present(this.previous, this.current, alpha);
    const cam = lerp(this.previous.camera, this.current.camera, alpha);
    const shake = this.current.camera;
    this.stage.setCamera(toUnits(cam.x + shake.shakeX), toUnits(cam.y + shake.shakeY));
    this.stage.render();
  }
}
