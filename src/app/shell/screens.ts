/**
 * The shell's screen state machine, pure so it can be unit-tested: a screen,
 * an input or game event, and the level list go in; the next screen and the
 * side effects the shell must perform come out. The shell (DOM, audio, App)
 * interprets the effects; nothing here touches the sim or the document.
 */

export type Screen =
  | { readonly kind: 'title'; readonly index: number }
  | { readonly kind: 'levelSelect'; readonly index: number }
  /** Level card before play; confirm or the card timer starts the level. */
  | { readonly kind: 'intro'; readonly levelId: string }
  | { readonly kind: 'playing'; readonly levelId: string }
  | { readonly kind: 'paused'; readonly levelId: string; readonly index: number }
  | { readonly kind: 'complete'; readonly levelId: string }
  | { readonly kind: 'gameover'; readonly levelId: string; readonly index: number }
  | { readonly kind: 'credits' };

export type ShellEvent = 'confirm' | 'back' | 'up' | 'down' | 'pause' | 'levelComplete' | 'gameOver' | 'timeout';

export type Effect =
  | { readonly type: 'startLevel'; readonly levelId: string; readonly newRun: boolean }
  | { readonly type: 'restartLevel' }
  | { readonly type: 'resume' }
  | { readonly type: 'freeze' }
  | { readonly type: 'quitToTitle' };

export interface ShellCtx {
  /** Manifest order. */
  readonly levels: readonly string[];
  readonly unlocked: readonly string[];
}

export const TITLE_ITEMS = ['Start game', 'Level select', 'Credits'] as const;
export const PAUSE_ITEMS = ['Resume', 'Restart level', 'Quit to title'] as const;
export const GAMEOVER_ITEMS = ['Retry level', 'Quit to title'] as const;

export const TITLE: Screen = { kind: 'title', index: 0 };

export interface Transition {
  readonly screen: Screen;
  readonly effects: readonly Effect[];
}

const stay = (screen: Screen): Transition => ({ screen, effects: [] });

/** Up/down over `n` items with wrap-around; null when the event is not a cursor move. */
function moveCursor<S extends { readonly index: number }>(screen: S, event: ShellEvent, n: number): S | null {
  if (event !== 'up' && event !== 'down') return null;
  return { ...screen, index: (screen.index + (event === 'up' ? n - 1 : 1)) % n };
}

/** The level after `levelId` in manifest order, or null after the last. */
export function nextLevel(ctx: ShellCtx, levelId: string): string | null {
  const i = ctx.levels.indexOf(levelId);
  return i >= 0 && i + 1 < ctx.levels.length ? ctx.levels[i + 1]! : null;
}

export function reduce(screen: Screen, event: ShellEvent, ctx: ShellCtx): Transition {
  switch (screen.kind) {
    case 'title':
      return title(screen, event, ctx);
    case 'levelSelect':
      return levelSelect(screen, event, ctx);
    case 'intro':
      if (event === 'confirm' || event === 'timeout') return { screen: { kind: 'playing', levelId: screen.levelId }, effects: [{ type: 'resume' }] };
      if (event === 'back') return { screen: TITLE, effects: [{ type: 'quitToTitle' }] };
      return stay(screen);
    case 'playing':
      if (event === 'pause' || event === 'back') return { screen: { kind: 'paused', levelId: screen.levelId, index: 0 }, effects: [{ type: 'freeze' }] };
      if (event === 'levelComplete') return stay({ kind: 'complete', levelId: screen.levelId });
      if (event === 'gameOver') return stay({ kind: 'gameover', levelId: screen.levelId, index: 0 });
      return stay(screen);
    case 'paused':
      // The sim can finish while the delay before its card is still running; the card wins over the pause menu.
      if (event === 'levelComplete') return stay({ kind: 'complete', levelId: screen.levelId });
      if (event === 'gameOver') return stay({ kind: 'gameover', levelId: screen.levelId, index: 0 });
      return paused(screen, event);
    case 'complete': {
      if (event !== 'confirm') return stay(screen);
      const next = nextLevel(ctx, screen.levelId);
      if (next === null) return { screen: { kind: 'credits' }, effects: [{ type: 'quitToTitle' }] };
      return { screen: { kind: 'intro', levelId: next }, effects: [{ type: 'startLevel', levelId: next, newRun: false }] };
    }
    case 'gameover':
      return gameover(screen, event);
    case 'credits':
      if (event === 'confirm' || event === 'back') return stay(TITLE);
      return stay(screen);
  }
}

function title(screen: Screen & { kind: 'title' }, event: ShellEvent, ctx: ShellCtx): Transition {
  const moved = moveCursor(screen, event, TITLE_ITEMS.length);
  if (moved) return stay(moved);
  if (event !== 'confirm') return stay(screen);
  switch (TITLE_ITEMS[screen.index]) {
    case 'Start game': {
      const first = ctx.levels[0]!;
      return { screen: { kind: 'intro', levelId: first }, effects: [{ type: 'startLevel', levelId: first, newRun: true }] };
    }
    case 'Level select':
      return stay({ kind: 'levelSelect', index: 0 });
    case 'Credits':
      return stay({ kind: 'credits' });
    default:
      return stay(screen);
  }
}

function levelSelect(screen: Screen & { kind: 'levelSelect' }, event: ShellEvent, ctx: ShellCtx): Transition {
  const moved = moveCursor(screen, event, ctx.levels.length);
  if (moved) return stay(moved);
  if (event === 'back') return stay({ kind: 'title', index: 1 });
  if (event === 'confirm') {
    const id = ctx.levels[screen.index]!;
    if (!ctx.unlocked.includes(id)) return stay(screen);
    return { screen: { kind: 'intro', levelId: id }, effects: [{ type: 'startLevel', levelId: id, newRun: true }] };
  }
  return stay(screen);
}

function paused(screen: Screen & { kind: 'paused' }, event: ShellEvent): Transition {
  const moved = moveCursor(screen, event, PAUSE_ITEMS.length);
  if (moved) return stay(moved);
  if (event === 'pause' || event === 'back') return { screen: { kind: 'playing', levelId: screen.levelId }, effects: [{ type: 'resume' }] };
  if (event !== 'confirm') return stay(screen);
  switch (PAUSE_ITEMS[screen.index]) {
    case 'Resume':
      return { screen: { kind: 'playing', levelId: screen.levelId }, effects: [{ type: 'resume' }] };
    case 'Restart level':
      return { screen: { kind: 'playing', levelId: screen.levelId }, effects: [{ type: 'restartLevel' }, { type: 'resume' }] };
    case 'Quit to title':
      return { screen: TITLE, effects: [{ type: 'quitToTitle' }] };
    default:
      return stay(screen);
  }
}

function gameover(screen: Screen & { kind: 'gameover' }, event: ShellEvent): Transition {
  const moved = moveCursor(screen, event, GAMEOVER_ITEMS.length);
  if (moved) return stay(moved);
  if (event !== 'confirm') return stay(screen);
  switch (GAMEOVER_ITEMS[screen.index]) {
    case 'Retry level':
      return { screen: { kind: 'playing', levelId: screen.levelId }, effects: [{ type: 'restartLevel' }, { type: 'resume' }] };
    case 'Quit to title':
      return { screen: TITLE, effects: [{ type: 'quitToTitle' }] };
    default:
      return stay(screen);
  }
}
