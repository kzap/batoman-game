import type { ManifestEntry } from '@content/levels';
import type { SaveData } from './save';
import { GAMEOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS, type Screen } from './screens';
import { formatScore } from './score';
import { resultsSpotlight, tallyAt, tallyPlan, type Spotlight } from './results';
import { SIM_HZ } from '@core/sim/clock';

/** Player and camera at the moment the results card is showing, plus how far the tally has counted. */
export interface ResultsView {
  readonly levelScore: number;
  /** Milliseconds since the card appeared. `Infinity` paints the finished tally. */
  readonly elapsedMs: number;
  readonly player: { readonly x: number; readonly y: number; readonly pose: string };
  readonly camera: { readonly x: number; readonly y: number };
}

/** What the overlay needs besides the screen: level names, progress, the run's numbers. */
export interface OverlayModel {
  readonly levels: readonly ManifestEntry[];
  readonly save: SaveData;
  readonly score: number;
  /** Result of the level just finished (complete screen). */
  readonly result: { readonly ticks: number; readonly hp: number } | null;
  /** Set on the results card; null on every other screen. */
  readonly results: ResultsView | null;
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
  playing: { dim: false, spotlight: false, hideHud: false },
  paused: { dim: false, spotlight: false, hideHud: false },
  complete: { dim: false, spotlight: true, hideHud: false },
  gameover: { dim: true, spotlight: false, hideHud: false },
  credits: { dim: true, spotlight: false, hideHud: true },
};

/** Renders one screen into `#overlay`; screens that show the level behind them leave the canvas undimmed. */
export class Overlay {
  constructor(private readonly root: HTMLElement) {}

  render(screen: Screen, m: OverlayModel): void {
    const root = this.root;
    root.textContent = '';
    const look = PRESENTATION[screen.kind];
    root.classList.toggle('shell-visible', screen.kind !== 'playing');
    root.classList.toggle('shell-dim', look.dim);
    root.classList.toggle('shell-spotlight', look.spotlight);
    document.body.classList.toggle('shell-hide-hud', look.hideHud);
    if (!look.spotlight) this.clearSpotlight();
    if (screen.kind === 'playing') return;
    const card = el('div', 'shell-card');
    card.dataset['screen'] = screen.kind;
    root.append(card);
    switch (screen.kind) {
      case 'title':
        card.append(el('h1', 'shell-title', 'BATOMAN'), el('p', 'shell-subtitle', 'NEO-MAYNILA, 2147'), menu(TITLE_ITEMS, screen.index), hint('Enter select  ·  Up/Down move  ·  M music  ·  N sfx'));
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
              const locked = !m.save.unlocked.includes(id);
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
      case 'paused':
        card.append(el('h2', 'shell-heading', 'PAUSED'), menu(PAUSE_ITEMS, screen.index), hint('Esc resume  ·  M music  ·  N sfx'));
        break;
      case 'complete': {
        const stats = el('div', 'shell-stats');
        if (m.result) stats.append(el('div', '', `time ${ticksToClock(m.result.ticks)}`), el('div', '', `hearts left ${m.result.hp}`));
        const view = m.results;
        const frame = tallyAt(tallyPlan(m.score, view?.levelScore ?? 0, m.result?.hp ?? 0), view?.elapsedMs ?? 0);
        const tally = el('ul', 'shell-tally');
        for (const line of frame.lines) {
          const li = el('li', '');
          li.dataset['line'] = line.id;
          li.append(el('span', '', line.label), el('span', 'shell-tally-num', formatScore(line.shown)));
          tally.append(li);
        }
        const total = el('li', 'shell-tally-total');
        total.dataset['line'] = 'score';
        total.append(el('span', '', 'score'), el('span', 'shell-tally-score', formatScore(frame.shown)));
        tally.append(total);
        card.append(el('h2', 'shell-heading', 'LEVEL CLEAR'), stats, tally, hint('Enter continue'));
        root.dataset['tally'] = frame.done ? 'done' : 'running';
        // Rebuilding the card every frame would otherwise re-announce the whole tally.
        root.setAttribute('aria-live', frame.done ? 'polite' : 'off');
        if (view) this.applySpotlight(resultsSpotlight(view.player, view.camera, { w: root.clientWidth, h: root.clientHeight }));
        break;
      }
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
    }
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
  }
}
