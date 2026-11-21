import { LEVELS, loadLevelById, MANIFEST, manifestEntry } from '@content/levels';
import type { World } from '@game/world';
import { HttpAssetSource, loadAssets } from '@render/assets';
import type { App } from '../app';
import type { GameAudio } from '../audio';
import { CONTROL_ROWS, toggleBinding } from '../bindings';
import type { Overlay, OverlayModel } from './overlay';
import { selectableLevels, UNLOCK_ALL_LEVELS } from './progression';
import { tallyAt, tallyPlan } from './results';
import { loadSave, recordClear, resetBindings, resolveReduceMotion, setBindings, setOption, writeSave, type KeyValueStore, type SaveData } from './save';
import { reduce, TITLE, type Effect, type Screen, type ShellEvent } from './screens';
import { clearPoints, killPoints } from './score';

/** Keyboard to shell events; the game's own bindings (arrows, Space, Z, Shift) are separate and read by `Keyboard`. */
const KEYS: Readonly<Record<string, ShellEvent>> = {
  Enter: 'confirm',
  Escape: 'back',
  KeyP: 'pause',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyW: 'up',
  KeyS: 'down',
};

function systemPrefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Timings of the shell's own delays, in ms. */
export const SHELL_TIMING = {
  /** The intro card advances by itself after this long. */
  intro: 2200,
  /** After the exit, before the results card, so the completion moment reads. */
  complete: 900,
  /** After the last life, before the game over card. */
  gameOver: 1200,
} as const;

export interface ShellOptions {
  /** Session override from `?reduceMotion=`. Not written until the player toggles with R. */
  readonly reduceMotion?: boolean | null;
  /** Level select. Omit to follow {@link UNLOCK_ALL_LEVELS}. Not written to the save. */
  readonly unlockAll?: boolean;
}

/** The current run: score so far and the points earned in the level being played. Reset by "Start game" and level select. */
interface Run {
  score: number;
  levelScore: number;
  result: { ticks: number; hp: number } | null;
}

/**
 * The game shell: title, level select, intro cards, pause, results, game over
 * and credits around the App. Owns the run (score), the save file and the
 * audio; drives the App through `replaceLevel`, `restartLevel` and `setMode`
 * and listens to each World's events for score, sound and screen changes.
 */
export class Shell {
  private screen: Screen = TITLE;
  private save: SaveData;
  private run: Run = { score: 0, levelScore: 0, result: null };
  /** The one pending delayed event (intro timeout, results, game over); cleared on every screen change. */
  private timer = 0;
  /** Wall-clock start of the results tally, and the frame that advances it. */
  private tallyStart = 0;
  private tallyFrame = 0;
  private loading: Promise<void> | null = null;
  private readonly levelIds = LEVELS.map((l) => l.id);
  /** Build flag, or `?unlockAll=` for this page load. */
  private readonly unlockAll: boolean;
  /** `?reduceMotion=` for this page load. Cleared once the player toggles, which writes the save. */
  private sessionOverride: boolean | null;
  private systemReduceMotion: boolean;
  private media: MediaQueryList | null = null;
  private readonly onKeyDown = (e: KeyboardEvent): void => this.handleKey(e);
  private readonly onPointer = (): void => this.audio.unlock();
  private readonly onPageHide = (): void => this.stop();
  private readonly onResize = (): void => {
    if (this.screen.kind !== 'complete') return;
    this.paintResults(this.resultsElapsed());
  };
  private readonly onMotionPreference = (): void => {
    this.systemReduceMotion = this.media?.matches ?? false;
    if (this.sessionOverride !== null || this.save.options.reduceMotion !== null) return;
    this.applyMotion(true);
  };

  constructor(
    private readonly app: App,
    private readonly overlay: Overlay,
    private readonly audio: GameAudio,
    private readonly storage: KeyValueStore,
    options: ShellOptions = {},
  ) {
    this.save = loadSave(storage, this.levelIds);
    this.unlockAll = options.unlockAll ?? UNLOCK_ALL_LEVELS;
    this.sessionOverride = options.reduceMotion ?? null;
    this.systemReduceMotion = systemPrefersReducedMotion();
    app.setBindings(this.save.bindings);
    audio.engine.setMusicEnabled(this.save.options.music);
    audio.engine.setSfxEnabled(this.save.options.sfx);
    app.onWorld = (w): void => this.watchWorld(w);
    this.applyMotion(false);
    this.watchSystemMotion();
  }

  /**
   * Boot. With a level id (from `?level=`) the game starts straight in it, for
   * deep links, the editor and tests; otherwise the title shows over the
   * frozen default level. The App built its first world before `onWorld` was
   * set, so it is rebuilt here to be watched.
   */
  start(directLevelId: string | null): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pagehide', this.onPageHide);
    this.app.restartLevel();
    if (directLevelId) {
      this.setScreen({ kind: 'playing', levelId: directLevelId }, [{ type: 'resume' }]);
      this.audio.music.play(manifestEntry(directLevelId).music);
    } else {
      this.setScreen(TITLE, [{ type: 'quitToTitle' }]);
    }
  }

  private handleKey(e: KeyboardEvent): void {
    this.audio.unlock();
    this.publishAudio();
    if (this.app.currentMode === 'edit' || this.editorPlaytest) return; // the editor owns the keyboard
    if (this.captureBinding(e)) return;
    if (e.code === 'KeyM') return this.toggleOption('music');
    if (e.code === 'KeyN') return this.toggleOption('sfx');
    if (e.code === 'KeyR') return this.toggleReduceMotion();
    const event = KEYS[e.code];
    if (!event) return;
    // While playing, arrows move the player and Enter is nothing; only pause keys reach the shell.
    if (this.screen.kind === 'playing' && event !== 'pause' && event !== 'back') return;
    e.preventDefault();
    this.dispatch(event);
  }

  /**
   * Controls row is waiting for a physical key. Escape cancels; anything else
   * toggles that key on the action. Returns true when the event was consumed,
   * so menu keys (including M, N and R) do not also fire.
   */
  private captureBinding(e: KeyboardEvent): boolean {
    if (this.screen.kind !== 'controls' || !this.screen.listening) return false;
    e.preventDefault();
    if (e.repeat) return true;
    if (e.code === 'Escape') {
      this.dispatch('back');
      return true;
    }
    const row = CONTROL_ROWS[this.screen.index];
    if (row === undefined || row === 'reset') return true;
    const next = toggleBinding(this.save.bindings, row, e.code);
    if (!next) {
      this.audio.play('menuBack');
      return true;
    }
    this.save = setBindings(this.save, next);
    writeSave(this.storage, this.save);
    this.app.setBindings(next);
    this.dispatch('stopListen');
    return true;
  }

  /** The editor's playtest runs the sim in `play` mode with its own keys (P, Esc); the shell stays out of it. */
  private get editorPlaytest(): boolean {
    return this.app.hooks.editor !== null;
  }

  private toggleOption(key: 'music' | 'sfx'): void {
    this.save = setOption(this.save, key, !this.save.options[key]);
    writeSave(this.storage, this.save);
    if (key === 'music') this.audio.engine.setMusicEnabled(this.save.options.music);
    else this.audio.engine.setSfxEnabled(this.save.options.sfx);
    this.audio.play('menuMove');
  }

  /** Flip the effective preference, store the boolean, and stop following the OS or the query string. */
  private toggleReduceMotion(): void {
    const next = !this.effectiveReduceMotion();
    this.sessionOverride = null;
    this.save = setOption(this.save, 'reduceMotion', next);
    writeSave(this.storage, this.save);
    this.applyMotion(true);
    this.audio.play('menuMove');
  }

  private effectiveReduceMotion(): boolean {
    return resolveReduceMotion(this.save.options.reduceMotion, this.systemReduceMotion, this.sessionOverride);
  }

  private applyMotion(render: boolean): void {
    this.app.setReduceMotion(this.effectiveReduceMotion());
    if (!render) return;
    if (this.screen.kind === 'complete') {
      cancelAnimationFrame(this.tallyFrame);
      this.paintResults(this.resultsElapsed());
      if (!this.effectiveReduceMotion()) this.armTally();
      return;
    }
    this.renderOverlay();
  }

  private watchSystemMotion(): void {
    if (typeof matchMedia !== 'function') return;
    this.media = matchMedia('(prefers-reduced-motion: reduce)');
    this.media.addEventListener('change', this.onMotionPreference);
  }

  dispatch(event: ShellEvent): void {
    // A level is still loading: the intro card waits for it, so its timeout re-arms; other input is dropped.
    if (this.loading) {
      if (event === 'timeout') this.arm('timeout', SHELL_TIMING.intro);
      return;
    }
    const before = this.screen;
    const unlocked = selectableLevels(this.save.unlocked, this.levelIds, this.unlockAll);
    const { screen, effects } = reduce(before, event, { levels: this.levelIds, unlocked });
    this.menuSound(before, screen, event);
    this.setScreen(screen, effects);
  }

  private menuSound(before: Screen, after: Screen, event: ShellEvent): void {
    if (event === 'stopListen') return this.audio.play('menuConfirm');
    if (event === 'up' || event === 'down') return this.audio.play('menuMove');
    if (after.kind === 'paused' && before.kind === 'playing') return this.audio.play('pause');
    if (after.kind === 'playing' && before.kind === 'paused') return this.audio.play('unpause');
    if (event === 'back') return this.audio.play('menuBack');
    if (event === 'confirm' && before !== after) this.audio.play('menuConfirm');
  }

  private setScreen(screen: Screen, effects: readonly Effect[]): void {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.tallyFrame);
    if (screen.kind === 'complete' && this.screen.kind !== 'complete') this.tallyStart = performance.now();
    this.screen = screen;
    this.app.hooks.screen = screen.kind;
    for (const fx of effects) this.apply(fx);
    if (screen.kind === 'intro') this.arm('timeout', SHELL_TIMING.intro);
    if (screen.kind === 'credits') this.audio.music.play(MANIFEST.titleMusic);
    this.renderOverlay();
    if (screen.kind === 'complete' && !this.effectiveReduceMotion()) this.armTally();
    this.publishAudio();
  }

  /** Drop the window listeners. `pagehide` calls this; nothing else keeps the resize hook. */
  stop(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pagehide', this.onPageHide);
    this.media?.removeEventListener('change', this.onMotionPreference);
    this.media = null;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.tallyFrame);
  }

  private renderOverlay(): void {
    this.overlay.render(this.screen, this.overlayModel(0));
  }

  private overlayModel(elapsedMs: number): OverlayModel {
    const complete = this.screen.kind === 'complete';
    return {
      levels: LEVELS,
      save: this.save,
      selectable: selectableLevels(this.save.unlocked, this.levelIds, this.unlockAll),
      score: this.run.score,
      result: this.run.result,
      reduceMotion: this.effectiveReduceMotion(),
      results: complete
        ? {
            levelScore: this.run.levelScore,
            elapsedMs: this.resultsElapsed(elapsedMs),
            player: this.app.hooks.player,
            camera: this.app.hooks.camera,
          }
        : null,
    };
  }

  /** Elapsed tally time. The effective preference (save, query, then OS) snaps the count. */
  private resultsElapsed(elapsedMs?: number): number {
    if (this.effectiveReduceMotion()) return Number.POSITIVE_INFINITY;
    return elapsedMs ?? performance.now() - this.tallyStart;
  }

  /** Count the tally up. Enter still leaves the card whenever it arrives; this loop only repaints. */
  private armTally(): void {
    const step = (): void => {
      if (this.screen.kind !== 'complete') return;
      const elapsed = this.resultsElapsed();
      this.paintResults(elapsed);
      const frame = tallyAt(tallyPlan(this.run.score, this.run.levelScore, this.run.result?.hp ?? 0), elapsed);
      if (!frame.done) this.tallyFrame = requestAnimationFrame(step);
    };
    this.tallyFrame = requestAnimationFrame(step);
  }

  /** Refresh the open card. A missing card falls back to a full render. */
  private paintResults(elapsedMs: number): void {
    const model = this.overlayModel(elapsedMs);
    if (!this.overlay.updateResults(model)) this.overlay.render(this.screen, model);
  }

  /** Schedule the one delayed event, replacing any pending one. */
  private arm(event: ShellEvent, ms: number): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.dispatch(event), ms);
  }

  private publishAudio(): void {
    this.app.hooks.music = this.audio.music.requested;
    this.app.hooks.audio = this.audio.engine.ready;
  }

  private apply(fx: Effect): void {
    switch (fx.type) {
      case 'startLevel':
        if (fx.newRun) this.run = { score: 0, levelScore: 0, result: null };
        this.run.levelScore = 0;
        this.app.hooks.score = this.run.score;
        this.loadLevel(fx.levelId);
        break;
      case 'restartLevel':
        // Points from the abandoned attempt come off; the level is scored from scratch.
        this.run.score -= this.run.levelScore;
        this.run.levelScore = 0;
        this.app.hooks.score = this.run.score;
        this.app.restartLevel();
        break;
      case 'resume':
        this.app.setMode('play');
        this.audio.engine.setPaused(false);
        break;
      case 'freeze':
        this.app.setMode('paused');
        this.audio.engine.setPaused(true);
        break;
      case 'quitToTitle':
        this.app.setMode('paused');
        this.audio.engine.setPaused(false);
        this.audio.music.play(MANIFEST.titleMusic);
        break;
      case 'resetBindings':
        this.save = resetBindings(this.save);
        writeSave(this.storage, this.save);
        this.app.setBindings(this.save.bindings);
        break;
    }
  }

  /** Fetch the level and its art, then swap it into the App; the intro card shows the frozen level once it is in. */
  private loadLevel(id: string): void {
    this.audio.music.play(manifestEntry(id).music);
    this.loading = (async (): Promise<void> => {
      if (this.app.currentLevel.id === id) {
        this.app.setMode('paused');
        this.app.restartLevel();
        return;
      }
      const level = await loadLevelById(id);
      const assets = await loadAssets(level, new HttpAssetSource(`${import.meta.env.BASE_URL}assets/`));
      this.app.replaceLevel(level, assets);
    })()
      .catch((e: unknown) => {
        this.app.hooks.errors.push(`level ${id} failed to load: ${(e as Error).message}`);
        this.setScreen(TITLE, [{ type: 'quitToTitle' }]);
      })
      .finally(() => {
        this.loading = null;
      });
  }

  /** Per-world subscriptions: audio cues, score, and the screen changes the sim triggers. */
  private watchWorld(w: World): void {
    this.audio.attach(w.events);
    w.events.on('enemyDeath', (e) => this.addScore(killPoints(e.type)));
    w.events.on('complete', (e) => {
      this.addScore(clearPoints(e.hp));
      this.run.result = { ticks: e.tick, hp: e.hp };
      this.save = recordClear(this.save, this.levelIds, w.level.id, { ticks: e.tick, score: this.run.levelScore });
      writeSave(this.storage, this.save);
      this.arm('levelComplete', SHELL_TIMING.complete);
    });
    w.events.on('gameover', () => this.arm('gameOver', SHELL_TIMING.gameOver));
  }

  private addScore(points: number): void {
    this.run.score += points;
    this.run.levelScore += points;
    this.app.hooks.score = this.run.score;
  }
}
