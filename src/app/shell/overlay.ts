import type { ManifestEntry } from '@content/levels';
import type { SaveData } from './save';
import { GAMEOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS, type Screen } from './screens';
import { formatScore } from './score';
import { SIM_HZ } from '@core/sim/clock';

/** What the overlay needs besides the screen: level names, progress, the run's numbers. */
export interface OverlayModel {
  readonly levels: readonly ManifestEntry[];
  readonly save: SaveData;
  readonly score: number;
  /** Result of the level just finished (complete screen). */
  readonly result: { readonly ticks: number; readonly hp: number } | null;
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

/** How each screen sits over the canvas: dimmed when the level behind is not the point, HUD hidden when there is no play to read. */
const PRESENTATION: Readonly<Record<Screen['kind'], { readonly dim: boolean; readonly hideHud: boolean }>> = {
  title: { dim: true, hideHud: true },
  levelSelect: { dim: true, hideHud: true },
  intro: { dim: false, hideHud: true },
  playing: { dim: false, hideHud: false },
  paused: { dim: false, hideHud: false },
  complete: { dim: false, hideHud: false },
  gameover: { dim: true, hideHud: false },
  credits: { dim: true, hideHud: true },
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
    document.body.classList.toggle('shell-hide-hud', look.hideHud);
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
        stats.append(el('div', '', `score ${formatScore(m.score)}`));
        card.append(el('h2', 'shell-heading', 'LEVEL CLEAR'), stats, hint('Enter continue'));
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
}
