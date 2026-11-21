import type { ManifestEntry } from '@content/levels';
import { SIM_HZ } from '@core/sim/clock';
import { ACTION_LABELS, CONTROL_ROWS, keyLabel } from '../bindings';
import { resultsSpotlight, tallyAt, tallyPlan, type Spotlight, type TallyFrame } from './results';
import type { SaveData } from './save';
import { GAMEOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS, type Screen } from './screens';
import { formatScore } from './score';

/** Player and camera at the moment the results card is showing, plus how far the tally has counted. */
export interface ResultsView {
  readonly levelScore: number;
  /** Milliseconds since the card appeared. `Infinity` paints the finished tally. */
  readonly elapsedMs: number;
  readonly player: { readonly x: number; readonly y: number; readonly pose: string };
  readonly camera: { readonly x: number; readonly y: number };
}

/** One cutscene line for the dialog card. Portrait is optional (typography-only when null). */
export interface CutsceneView {
  readonly speaker: string;
  readonly text: string;
  readonly portrait: {
    readonly imageUrl: string;
    readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly tint: number | null;
  } | null;
}

/** What the overlay needs besides the screen: level names, progress, the run's numbers. */
export interface OverlayModel {
  readonly levels: readonly ManifestEntry[];
  readonly save: SaveData;
  /** Level ids the player may start. The save list while `VITE_UNLOCK_ALL_LEVELS` is off. */
  readonly selectable: readonly string[];
  readonly score: number;
  /** Result of the level just finished (complete screen). */
  readonly result: { readonly ticks: number; readonly hp: number } | null;
  /** Effective reduce-motion preference, for the hint and `data-reduce-motion`. */
  readonly reduceMotion: boolean;
  /** Set on the results card; null on every other screen. */
  readonly results: ResultsView | null;
  /** Set on the cutscene screen; null elsewhere. */
  readonly cutscene: CutsceneView | null;
}

export const CREDITS: readonly { readonly heading: string; readonly lines: readonly string[] }[] = [
  { heading: 'BATOMAN', lines: ['Neo-Maynila, 2147'] },
  { heading: 'A game by', lines: ['kzap'] },
  { heading: 'Story', lines: ['Ando, a Tondo street kid with a plasma-buster arm,', 'against Project ASWANG and Dr. Epal.'] },
  { heading: 'Art', lines: ['AI-generated concept art, recut and packed by the asset pipeline'] },
  { heading: 'Music', lines: ['Tondo Sublevel, Divisoria'] },
  { heading: 'Built with', lines: ['Three.js, Vite, TypeScript, Vitest, Playwright'] },
  { heading: '', lines: ['Salamat sa paglalaro.'] },
];

const ticksToClock = (ticks: number): string => {
  const s = Math.floor(ticks / SIM_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

const menu = (items: readonly string[], selected: number, extra?: (i: number) => { locked: boolean; note: string }): HTMLUListElement => {
  const ul = el('ul', 'shell-menu');
  items.forEach((label, i) => {
    const li = el('li', i === selected ? 'shell-selected' : '', label);
    const x = extra?.(i);
    if (x?.locked) li.classList.add('shell-locked');
    if (x?.note) li.append(el('span', 'shell-best', x.note));
    ul.append(li);
  });
  return ul;
};

const hint = (text: string): HTMLElement => el('div', 'shell-hint', text);

/**
 * How each screen sits over the canvas. `dim` is the flat wash used when the
 * level behind is not the point. `spotlight` is the results card: the same wash
 * with a hole on Ando. The HUD hides on screens with nothing to read.
 */
export const PRESENTATION: Readonly<Record<Screen['kind'], { readonly dim: boolean; readonly spotlight: boolean; readonly hideHud: boolean }>> = {
  title: { dim: true, spotlight: false, hideHud: true },
  levelSelect: { dim: true, spotlight: false, hideHud: true },
  intro: { dim: false, spotlight: false, hideHud: true },
  cutscene: { dim: false, spotlight: false, hideHud: true },
  playing: { dim: false, spotlight: false, hideHud: false },
  paused: { dim: false, spotlight: false, hideHud: false },
  complete: { dim: false, spotlight: true, hideHud: false },
  gameover: { dim: true, spotlight: false, hideHud: false },
  credits: { dim: true, spotlight: false, hideHud: true },
  controls: { dim: true, spotlight: false, hideHud: true },
};

interface TallyNodes {
  readonly nums: ReadonlyMap<string, HTMLElement>;
  readonly score: HTMLElement;
  /** Polite region created empty. Its text is set only after the count lands. */
  readonly status: HTMLElement;
}

/** Renders one screen into `#overlay`; screens that show the level behind them leave the canvas undimmed. */
export class Overlay {
  private tally: TallyNodes | null = null;
  private tallyAnnounced = false;

  constructor(private readonly root: HTMLElement) {}

  render(screen: Screen, m: OverlayModel): void {
    const root = this.root;
    root.textContent = '';
    this.tally = null;
    this.tallyAnnounced = false;
    const look = PRESENTATION[screen.kind];
    root.classList.toggle('shell-visible', screen.kind !== 'playing');
    root.classList.toggle('shell-dim', look.dim);
    root.classList.toggle('shell-spotlight', look.spotlight);
    root.classList.toggle('shell-cutscene', screen.kind === 'cutscene');
    root.dataset['reduceMotion'] = m.reduceMotion ? 'on' : 'off';
    document.body.classList.toggle('shell-hide-hud', look.hideHud);
    if (!look.spotlight) this.clearSpotlight();
    if (screen.kind === 'playing') return;
    const card = el('div', 'shell-card');
    card.dataset['screen'] = screen.kind;
    root.append(card);
    switch (screen.kind) {
      case 'title':
        card.append(el('h1', 'shell-title', 'BATOMAN'), el('p', 'shell-subtitle', 'NEO-MAYNILA, 2147'), menu(TITLE_ITEMS, screen.index), hint(`Enter select  ·  Up/Down move  ·  M music  ·  N sfx  ·  R motion ${m.reduceMotion ? 'on' : 'off'}`));
        break;
      case 'levelSelect':
        card.append(
          el('h2', 'shell-heading', 'LEVEL SELECT'),
          menu(
            m.levels.map((l, i) => `${i + 1}. ${l.name}`),
            screen.index,
            (i) => {
              const id = m.levels[i]!.id;
              const best = m.save.best[id];
              const locked = !m.selectable.includes(id);
              return { locked, note: locked ? 'locked' : best ? `best ${ticksToClock(best.ticks)}  ${formatScore(best.score)}` : '' };
            },
          ),
          hint('Enter play  ·  Esc back'),
        );
        break;
      case 'intro': {
        const i = m.levels.findIndex((l) => l.id === screen.levelId);
        card.append(el('p', 'shell-subtitle', `LEVEL ${i + 1}`), el('h2', 'shell-heading', m.levels[i]?.name ?? screen.levelId), hint('Enter to start'));
        break;
      }
      case 'cutscene': {
        const line = m.cutscene;
        const row = el('div', 'shell-cutscene-row');
        if (line?.portrait) {
          const frame = line.portrait.frame;
          const sprite = el('div', 'shell-portrait');
          sprite.style.width = `${frame.w}px`;
          sprite.style.height = `${frame.h}px`;
          sprite.style.backgroundImage = `url(${line.portrait.imageUrl})`;
          sprite.style.backgroundPosition = `-${frame.x}px -${frame.y}px`;
          sprite.style.backgroundSize = 'auto';
          if (line.portrait.tint !== null) {
            // Multiply wash for stand-in sheets (e.g. patroller + ASWANG tint). Exact hue is presentation-only.
            sprite.style.backgroundColor = `#${line.portrait.tint.toString(16).padStart(6, '0')}`;
            sprite.style.backgroundBlendMode = 'multiply';
          }
          row.append(sprite);
        }
        const copy = el('div', 'shell-cutscene-copy');
        copy.append(el('p', 'shell-speaker', line?.speaker ?? ''), el('p', 'shell-line', line?.text ?? ''));
        row.append(copy);
        card.classList.add('shell-card-cutscene');
        card.append(row, hint('Enter next  ·  Esc skip all'));
        break;
      }
      case 'paused':
        card.append(el('h2', 'shell-heading', 'PAUSED'), menu(PAUSE_ITEMS, screen.index), hint(`Esc resume  ·  M music  ·  N sfx  ·  R motion ${m.reduceMotion ? 'on' : 'off'}`));
        break;
      case 'complete':
        this.buildResults(card, m);
        break;
      case 'gameover':
        card.append(el('h2', 'shell-heading', 'GAME OVER'), el('div', 'shell-stats', `score ${formatScore(m.score)}`), menu(GAMEOVER_ITEMS, screen.index), hint('Enter select'));
        break;
      case 'credits': {
        const c = el('div', 'shell-credits');
        for (const s of CREDITS) {
          if (s.heading) c.append(el('h3', '', s.heading));
          for (const line of s.lines) c.append(el('p', '', line));
        }
        card.append(c, hint('Enter back to title'));
        break;
      }
      case 'controls': {
        card.dataset['listening'] = screen.listening ? '1' : '0';
        const ul = el('ul', 'shell-menu shell-controls');
        CONTROL_ROWS.forEach((row, i) => {
          const li = el('li', i === screen.index ? 'shell-selected' : '');
          li.dataset['action'] = row;
          if (row === 'reset') {
            li.append(el('span', 'shell-action', 'Reset to defaults'));
          } else {
            const listening = screen.listening && i === screen.index;
            li.append(el('span', 'shell-action', ACTION_LABELS[row]), el('span', 'shell-keys', listening ? 'press a key…' : m.save.bindings[row].map(keyLabel).join('  ')));
          }
          ul.append(li);
        });
        card.append(el('h2', 'shell-heading', 'CONTROLS'), ul, hint('Enter toggles a key  ·  Esc back  ·  one to four keys'));
        break;
      }
    }
  }

  /**
   * Move the open results tally forward without rebuilding the card. Returns
   * false when there is no card yet, so the caller falls back to `render`.
   */
  updateResults(m: OverlayModel): boolean {
    const tally = this.tally;
    const view = m.results;
    if (!tally || !view || !tally.status.isConnected) return false;
    const frame = tallyAt(tallyPlan(m.score, view.levelScore, m.result?.hp ?? 0), view.elapsedMs);
    this.paintTally(tally, frame);
    this.root.dataset['tally'] = frame.done ? 'done' : 'running';
    this.applySpotlight(resultsSpotlight(view.player, view.camera, { w: this.root.clientWidth, h: this.root.clientHeight }));
    if (frame.done) this.announceTally(tally, frame);
    return true;
  }

  private buildResults(card: HTMLElement, m: OverlayModel): void {
    const root = this.root;
    const stats = el('div', 'shell-stats');
    if (m.result) stats.append(el('div', '', `time ${ticksToClock(m.result.ticks)}`), el('div', '', `hearts left ${m.result.hp}`));
    const view = m.results;
    const frame = tallyAt(tallyPlan(m.score, view?.levelScore ?? 0, m.result?.hp ?? 0), view?.elapsedMs ?? 0);
    const list = el('ul', 'shell-tally');
    const nums = new Map<string, HTMLElement>();
    for (const line of frame.lines) {
      const li = el('li', '');
      li.dataset['line'] = line.id;
      const num = el('span', 'shell-tally-num', formatScore(line.shown));
      li.append(el('span', '', line.label), num);
      list.append(li);
      nums.set(line.id, num);
    }
    const total = el('li', 'shell-tally-total');
    total.dataset['line'] = 'score';
    const score = el('span', 'shell-tally-score', formatScore(frame.shown));
    total.append(el('span', '', 'score'), score);
    list.append(total);
    card.append(el('h2', 'shell-heading', 'LEVEL CLEAR'), stats, list, hint('Enter continue'));

    // The parent overlay is a live region. Turn it off for this card so the
    // counting digits are not announced, and keep a separate region that
    // already exists before its text arrives.
    root.setAttribute('aria-live', 'off');
    const status = el('div', 'shell-tally-status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    root.append(status);
    const tally: TallyNodes = { nums, score, status };
    this.tally = tally;
    root.dataset['tally'] = frame.done ? 'done' : 'running';
    if (view) this.applySpotlight(resultsSpotlight(view.player, view.camera, { w: root.clientWidth, h: root.clientHeight }));
    if (frame.done) this.announceTally(tally, frame);
  }

  private paintTally(tally: TallyNodes, frame: TallyFrame): void {
    for (const line of frame.lines) {
      const num = tally.nums.get(line.id);
      const text = formatScore(line.shown);
      if (num && num.textContent !== text) num.textContent = text;
    }
    const total = formatScore(frame.shown);
    if (tally.score.textContent !== total) tally.score.textContent = total;
  }

  /** One frame later, so the live region is already in the document when the text lands. */
  private announceTally(tally: TallyNodes, frame: TallyFrame): void {
    if (this.tallyAnnounced) return;
    this.tallyAnnounced = true;
    const status = tally.status;
    const lines = frame.lines.map((line) => `${line.label} ${formatScore(line.shown)}`).join(', ');
    const text = `Level clear. ${lines}. Score ${formatScore(frame.shown)}.`;
    requestAnimationFrame(() => {
      if (status.isConnected) status.textContent = text;
    });
  }

  /** CSS variables for the radial hole. Cleared off the results card so the flat dim can use a plain wash. */
  private applySpotlight(spot: Spotlight): void {
    const root = this.root;
    root.style.setProperty('--spot-x', `${spot.x}px`);
    root.style.setProperty('--spot-y', `${spot.y}px`);
    root.style.setProperty('--spot-clear', `${spot.clear}px`);
    root.style.setProperty('--spot-edge', `${spot.edge}px`);
  }

  private clearSpotlight(): void {
    const root = this.root;
    root.style.removeProperty('--spot-x');
    root.style.removeProperty('--spot-y');
    root.style.removeProperty('--spot-clear');
    root.style.removeProperty('--spot-edge');
    delete root.dataset['tally'];
    root.setAttribute('aria-live', 'polite');
    this.tally = null;
    this.tallyAnnounced = false;
  }
}
