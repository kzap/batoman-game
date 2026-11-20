import { lerp } from '@core/math/vec2';
import { FixedClock, SIM_DT } from '@core/sim/clock';
import { MAX_ADVANCE_TICKS, type LockstepOptions } from './lockstep';
import type { InputFrame } from '@core/sim/input';
import { decodeInputs, type ReplayInputs } from '@core/sim/replay';
import { World, type WorldSnapshot } from '@game/world';
import { disposeAssets, type GameAssets } from '@render/assets';
import { Effects } from '@render/effects';
import { EntityView } from '@render/entity-view';
import { LevelView } from '@render/level-view';
import { presentedCamera, type WeakPointCue } from '@render/motion';
import type { PostOptions } from '@render/post';
import { Stage } from '@render/stage';
import { toUnits } from '@render/units';
import type { LevelJson } from '@content/level';
import { DebugOverlay } from './debug';
import { Hud } from './hud';
import { Keyboard } from './keyboard';

/**
 * Hooks exposed on `window.__batoman` for Playwright and the game-testing skill.
 * Tests read these; nothing outside App should write them.
 */
/** Frames the sim pauses when the boss changes phase. */
const PHASE_FREEZE_FRAMES = 2;

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
  /** Live enemies by type and pose, and the boss bar state (null when the level has no boss). */
  enemies: { type: string; pose: string; x: number; hp: number }[];
  boss: { hp: number; phase: number; engaged: boolean } | null;
  /**
   * Colourblind-safe weak-point cue while the boss core is on screen.
   * `ring: 'white'` is the non-colour channel (a diamond outline). Null otherwise.
   */
  weakPoint: WeakPointCue | null;
  /** Sim shake this tick, and the offset actually added to the camera. Both are zeroed in the view when reduce-motion is on; `simX`/`simY` stay. */
  shake: { simX: number; simY: number; x: number; y: number };
  /** Film grain is contributing. False when reduce-motion is on or the post stack is off (`?post=0`). */
  grain: boolean;
  /** Effective reduce-motion preference (save, OS, or `?reduceMotion=`). Presentation only. */
  reduceMotion: boolean;
  /** Sprites the entity view is currently showing (player, enemies, shots, movers). */
  entities: number;
  status: string;
  /** Id of the loaded level and whether the sim is running (`play`), frozen by the shell (`paused`) or frozen for the editor (`edit`). */
  level: string;
  mode: AppMode;
  /** Shell screen kind (`title`, `playing`, `paused`, ...), the run score, the music track playing, and whether audio is unlocked. */
  screen: string;
  score: number;
  music: string | null;
  audio: boolean;
  /** Present only while the editor is attached. */
  editor: EditorHooks | null;
  /**
   * True when this build was compiled with `VITE_E2E_LOCKSTEP=1` and the page
   * was opened with `?lockstep=1`. The frame loop then ignores wall-clock deltas.
   */
  lockstep: boolean;
  /**
   * Step the sim exactly `ticks` times and present once. Null unless lockstep is on.
   * Independent of the render frame rate: tests use this instead of holding a key for N ms.
   */
  advance: ((ticks: number) => void) | null;
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
    enemies: [],
    boss: null,
    weakPoint: null,
    shake: { simX: 0, simY: 0, x: 0, y: 0 },
    grain: false,
    reduceMotion: false,
    entities: 0,
    status: 'playing',
    level: '',
    mode: 'play',
    screen: '',
    score: 0,
    music: null,
    audio: false,
    editor: null,
    lockstep: false,
    advance: null,
    errors: [],
    replay: null,
  };
  window.__batoman = hooks;
  window.addEventListener('error', (e) => hooks.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => hooks.errors.push(String(e.reason)));
  return hooks;
}

export type AppMode = 'play' | 'paused' | 'edit';

/** Editor state published for e2e tests while `?edit=1` is active. */
export interface EditorHooks {
  tool: string;
  /** `kind#index` of the selected object. */
  selection: string | null;
  objects: number;
  revision: number;
  dirty: boolean;
  lastSave: string | null;
  playing: boolean;
}

/** Camera the editor drives directly: a centre on the gameplay plane (sim px) and a lens distance (stage units). */
export interface EditorCamera {
  readonly x: number;
  readonly y: number;
  readonly distance: number;
}

export interface AppOptions {
  /** Post-processing switches; `null` disables the stack (see `postOptionsFromQuery`). */
  readonly post?: PostOptions | null;
  /**
   * Test-only fixed stepping. Production leaves this unset: the frame loop follows
   * the wall clock through `FixedClock`, capped at `MAX_TICKS_PER_FRAME`.
   */
  readonly lockstep?: LockstepOptions | null;
}

/**
 * `?post=0` turns the post stack off, `?dof=1` adds depth of field. For
 * profiling and for machines where the composer is the bottleneck.
 */
export function postOptionsFromQuery(search: string): PostOptions | null {
  const q = new URLSearchParams(search);
  if (q.get('post') === '0') return null;
  return q.get('dof') === '1' ? { dof: true } : {};
}

export class App {
  private readonly clock = new FixedClock();
  private world: World;
  private readonly keyboard = new Keyboard();
  readonly stage: Stage;
  private levelView: LevelView;
  private entities: EntityView;
  private readonly effects = new Effects();
  private mode: AppMode = 'play';
  /** Called with every new World so the shell can subscribe (audio, score, screen changes). */
  onWorld: ((world: World) => void) | null = null;
  private editorCamera: EditorCamera | null = null;
  private readonly debug: DebugOverlay;
  private readonly hud: Hud;
  private replay: Generator<InputFrame> | null = null;
  /** Set by a respawn: the next present must not lerp from the death spot. */
  private teleported = false;
  /** Frames left of the boss phase-transition freeze (ART: a two-frame hit-stop). */
  private freezeFrames = 0;
  private previous: WorldSnapshot;
  private current: WorldSnapshot;
  private lastTime = 0;
  private frameSeconds = 0;
  private rafId = 0;
  private readonly lockstep: LockstepOptions | null;
  private reduceMotion = false;
  private readonly onResize = (): void => this.stage.resize();

  constructor(
    canvas: HTMLCanvasElement,
    readonly hooks: TestHooks,
    private level: LevelJson,
    private assets: GameAssets,
    opts: AppOptions = {},
  ) {
    // The env compare is a build-time constant. Prod and Pages builds fold this to null
    // and drop `lockstep.ts`. Only `npm run build:e2e` sets VITE_E2E_LOCKSTEP=1.
    this.lockstep = import.meta.env.VITE_E2E_LOCKSTEP === '1' ? (opts.lockstep ?? null) : null;
    if (import.meta.env.VITE_E2E_LOCKSTEP === '1' && this.lockstep) {
      hooks.lockstep = true;
      hooks.advance = (ticks: number): void => this.advance(ticks);
    }
    this.stage = new Stage({ canvas, post: opts.post ?? {} });
    this.hooks.grain = this.stage.grainEnabled;
    this.levelView = new LevelView(level, assets.levelArt);
    this.entities = new EntityView(assets);
    this.stage.scene.add(this.levelView.group, this.entities.group, this.effects.particles.points);
    this.world = this.newWorld(1);
    this.current = this.world.snapshot();
    this.previous = this.current;
    hooks.level = level.id;
    this.debug = new DebugOverlay(document.getElementById('debug') ?? document.createElement('div'));
    this.debug.onToggle = (on): void => {
      this.entities.setOutlines(on);
      this.levelView.setOutlines(on);
    };
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
    this.effects.dispose();
    this.entities.dispose();
    this.levelView.dispose();
    disposeAssets(this.assets);
    this.stage.dispose();
    this.hooks.ready = false;
    this.hooks.replay = null;
    this.hooks.advance = null;
  }

  /**
   * Swap the level in place: rebuild the static view and restart the world.
   * The editor calls this on every edit; the prop atlas and backdrops must be
   * the ones already loaded (a level cannot change its `art.props` at runtime).
   */
  loadLevel(level: LevelJson): void {
    this.level = level;
    this.hooks.level = level.id;
    this.levelView.dispose();
    this.levelView = new LevelView(level, this.assets.levelArt);
    this.levelView.setOutlines(this.debug.enabled);
    this.stage.scene.add(this.levelView.group);
    this.restartLevel();
  }

  /**
   * Move to another level with its own assets: the shell loads both, then
   * this disposes the old views and textures and builds new ones. The world
   * starts frozen (`paused`) so the intro card can show it.
   */
  replaceLevel(level: LevelJson, assets: GameAssets): void {
    this.entities.dispose();
    this.levelView.dispose();
    disposeAssets(this.assets);
    this.assets = assets;
    this.level = level;
    this.hooks.level = level.id;
    this.entities = new EntityView(assets);
    this.entities.setReduceMotion(this.reduceMotion);
    this.entities.setOutlines(this.debug.enabled);
    this.levelView = new LevelView(level, assets.levelArt);
    this.levelView.setOutlines(this.debug.enabled);
    this.stage.scene.add(this.levelView.group, this.entities.group);
    this.setMode('paused');
    this.restartLevel();
  }

  get currentLevel(): LevelJson {
    return this.level;
  }

  get currentMode(): AppMode {
    return this.mode;
  }

  /** Latest sim snapshot (for the shell's score bonus and result card). */
  get snapshot(): WorldSnapshot {
    return this.current;
  }

  /**
   * `edit` freezes the sim (no ticks, keyboard released so the editor can use
   * it) and points the camera where the editor says; `paused` freezes it for
   * the shell with the keyboard kept; `play` runs it. Leaving `edit` restarts
   * the level so the edited geometry is what plays.
   */
  setMode(mode: AppMode): void {
    if (mode === this.mode) return;
    const wasEdit = this.mode === 'edit';
    this.mode = mode;
    this.hooks.mode = mode;
    if (mode === 'edit') this.keyboard.detach();
    else {
      this.keyboard.attach();
      this.keyboard.reset();
      if (wasEdit) {
        this.editorCamera = null;
        this.restartLevel();
      }
    }
  }

  setEditorCamera(cam: EditorCamera): void {
    this.editorCamera = cam;
  }

  /**
   * Presentation preference. Camera shake, film grain, and decorative pulses
   * follow it. The sim, its RNG, and the snapshots replays compare do not.
   */
  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
    this.entities.setReduceMotion(on);
    this.stage.setReduceMotion(on);
    this.hooks.reduceMotion = on;
    this.hooks.grain = this.stage.grainEnabled;
  }

  private newWorld(seed: number): World {
    const w = new World(this.level, seed);
    w.events.on('respawn', () => (this.teleported = true));
    w.events.on('bossPhase', () => (this.freezeFrames = PHASE_FREEZE_FRAMES));
    this.effects.attach(w.events);
    this.onWorld?.(w);
    return w;
  }

  /** Fresh world for the current level; the shell calls it for restarts and retries. */
  restartLevel(seed = 1): void {
    this.world = this.newWorld(seed);
    this.current = this.world.snapshot();
    this.previous = this.current;
    this.replay = null;
    this.publish();
  }

  private startReplay(fixture: ReplayInputs): void {
    this.restartLevel(fixture.seed);
    this.replay = decodeInputs(fixture.inputs);
    this.setMode('play');
  }

  private nextInput(): InputFrame {
    if (this.replay) {
      const r = this.replay.next();
      if (!r.done) return r.value;
      this.replay = null;
    }
    return this.keyboard.frame();
  }

  /**
   * Step up to `count` sim ticks. Replay batches stop when boss phase, engagement,
   * or world status changes so a published frame still shows that signal.
   */
  private applyTicks(count: number, stopOnSignal: boolean): void {
    for (let i = 0; i < count; i++) {
      const before = stopOnSignal ? this.observeSignal() : '';
      this.previous = this.current;
      this.world.step(this.nextInput());
      this.current = this.world.snapshot();
      if (this.teleported) {
        this.previous = this.current;
        this.teleported = false;
      }
      if (stopOnSignal && this.observeSignal() !== before) break;
    }
  }

  /** Boss phase, engagement, and world status: the signals e2e waits on across a replay. */
  private observeSignal(): string {
    const boss = this.current.boss;
    return `${this.current.status}|${boss ? boss.phase : 'x'}|${boss?.engaged ? 1 : 0}`;
  }

  /** Lockstep hook: exactly `ticks` sim steps, then one present. No-op unless the sim is in `play`. */
  private advance(ticks: number): void {
    if (import.meta.env.VITE_E2E_LOCKSTEP !== '1') return;
    if (!Number.isFinite(ticks) || ticks <= 0 || this.mode !== 'play') return;
    const n = Math.min(Math.floor(ticks), MAX_ADVANCE_TICKS);
    this.frameSeconds = n * SIM_DT;
    this.applyTicks(n, false);
    this.publish();
    // Alpha 1 shows the snapshot just simulated, which is what the hooks publish.
    this.present(1);
  }

  private readonly frame = (now: number): void => {
    const frameMs = now - this.lastTime;
    this.lastTime = now;
    this.hooks.lastFrameMs = frameMs;

    let alpha = 0;
    const lockstep = this.lockstep;
    if (import.meta.env.VITE_E2E_LOCKSTEP === '1' && lockstep) {
      // Ignore the wall-clock delta. Slow software-GL frames and short rAF deltas
      // both make the production clock run late; tests must not depend on either.
      const budget = this.mode === 'play' && this.freezeFrames === 0 ? (this.replay ? lockstep.replay : lockstep.interactive) : 0;
      if (this.freezeFrames > 0) this.freezeFrames--;
      this.frameSeconds = budget * SIM_DT;
      this.applyTicks(budget, this.replay != null);
      alpha = 1;
    } else {
      const frameSeconds = frameMs / 1000;
      this.frameSeconds = frameSeconds;
      const step = this.clock.advance(frameSeconds);
      if (step.dropped) this.hooks.droppedFrames += 1;
      alpha = step.alpha;
      // The freeze skips this frame's ticks; the sim resumes from the same state, so replays are unaffected.
      const ticks = this.mode === 'play' && this.freezeFrames === 0 ? step.ticks : 0;
      if (this.freezeFrames > 0) this.freezeFrames--;
      this.applyTicks(ticks, false);
    }
    this.publish();
    this.present(alpha);
    this.debug.update(now, this.current, { frameMs, droppedFrames: this.hooks.droppedFrames, entities: this.entities.entityCount });
    this.hud.update(this.current, this.hooks.score);
    this.hooks.frames += 1;
    this.rafId = requestAnimationFrame(this.frame);
  };

  private publish(): void {
    const s = this.current;
    this.hooks.simTicks = s.tick;
    this.hooks.player = { x: s.player.x, y: s.player.y, pose: s.player.pose, hp: s.player.hp };
    this.hooks.camera = { x: s.camera.x, y: s.camera.y };
    this.hooks.enemies = s.enemies.map((e) => ({ type: e.type, pose: e.pose, x: e.x, hp: e.hp }));
    this.hooks.boss = s.boss ? { hp: s.boss.hp, phase: s.boss.phase, engaged: s.boss.engaged } : null;
    this.hooks.entities = this.entities.entityCount;
    this.hooks.status = s.status;
  }

  /** Interpolate between the two most recent snapshots, point the camera, and draw. */
  private present(alpha: number): void {
    this.entities.present(this.previous, this.current, alpha);
    if (this.editorCamera) {
      this.stage.setCamera(toUnits(this.editorCamera.x), toUnits(this.editorCamera.y), this.editorCamera.distance);
      const shake = this.current.camera;
      this.hooks.shake = { simX: shake.shakeX, simY: shake.shakeY, x: 0, y: 0 };
    } else {
      const cam = lerp(this.previous.camera, this.current.camera, alpha);
      const shake = this.current.camera;
      const at = presentedCamera(cam.x, cam.y, shake.shakeX, shake.shakeY, this.reduceMotion);
      this.hooks.shake = { simX: shake.shakeX, simY: shake.shakeY, x: at.x - cam.x, y: at.y - cam.y };
      this.stage.setCamera(toUnits(at.x), toUnits(at.y));
    }
    this.hooks.weakPoint = this.entities.weakPointCue;
    this.effects.update(this.frameSeconds, this.stage.renderer.getPixelRatio());
    this.stage.render(this.frameSeconds);
  }
}
