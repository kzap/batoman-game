import { LEVELS, loadLevelById, MANIFEST, manifestEntry } from '@content/levels';
import type { World } from '@game/world';
import { HttpAssetSource, loadAssets } from '@render/assets';
import type { App } from '../app';
import type { GameAudio } from '../audio';
import type { Overlay } from './overlay';
import { loadSave, recordClear, setOption, writeSave, type KeyValueStore, type SaveData } from './save';
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

/** Timings of the shell's own delays, in ms. */
export const SHELL_TIMING = {
  /** The intro card advances by itself after this long. */
  intro: 2200,
  /** After the exit, before the results card, so the completion moment reads. */
  complete: 900,
  /** After the last life, before the game over card. */
  gameOver: 1200,
} as const;

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
  private loading: Promise<void> | null = null;
  private readonly levelIds = LEVELS.map((l) => l.id);
  private readonly onKeyDown = (e: KeyboardEvent): void => this.handleKey(e);
  private readonly onPointer = (): void => this.audio.unlock();

  constructor(
    private readonly app: App,
    private readonly overlay: Overlay,
    private readonly audio: GameAudio,
    private readonly storage: KeyValueStore,
  ) {
    this.save = loadSave(storage, this.levelIds);
    audio.engine.setMusicEnabled(this.save.options.music);
    audio.engine.setSfxEnabled(this.save.options.sfx);
    app.onWorld = (w): void => this.watchWorld(w);
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
    if (e.code === 'KeyM') return this.toggleOption('music');
    if (e.code === 'KeyN') return this.toggleOption('sfx');
    const event = KEYS[e.code];
    if (!event) return;
    // While playing, arrows move the player and Enter is nothing; only pause keys reach the shell.
    if (this.screen.kind === 'playing' && event !== 'pause' && event !== 'back') return;
    e.preventDefault();
    this.dispatch(event);
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

  dispatch(event: ShellEvent): void {
    // A level is still loading: the intro card waits for it, so its timeout re-arms; other input is dropped.
    if (this.loading) {
      if (event === 'timeout') this.arm('timeout', SHELL_TIMING.intro);
      return;
    }
    const before = this.screen;
    const { screen, effects } = reduce(before, event, { levels: this.levelIds, unlocked: this.save.unlocked });
    this.menuSound(before, screen, event);
    this.setScreen(screen, effects);
  }

  private menuSound(before: Screen, after: Screen, event: ShellEvent): void {
    if (event === 'up' || event === 'down') return this.audio.play('menuMove');
    if (after.kind === 'paused' && before.kind === 'playing') return this.audio.play('pause');
    if (after.kind === 'playing' && before.kind === 'paused') return this.audio.play('unpause');
    if (event === 'back') return this.audio.play('menuBack');
    if (event === 'confirm' && before !== after) this.audio.play('menuConfirm');
  }

  private setScreen(screen: Screen, effects: readonly Effect[]): void {
    clearTimeout(this.timer);
    this.screen = screen;
    this.app.hooks.screen = screen.kind;
    for (const fx of effects) this.apply(fx);
    if (screen.kind === 'intro') this.arm('timeout', SHELL_TIMING.intro);
    if (screen.kind === 'credits') this.audio.music.play(MANIFEST.titleMusic);
    this.overlay.render(screen, { levels: LEVELS, save: this.save, score: this.run.score, result: this.run.result });
    this.publishAudio();
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
