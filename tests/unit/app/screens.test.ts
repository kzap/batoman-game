import { describe, expect, it } from 'vitest';
import { GAMEOVER_ITEMS, nextLevel, PAUSE_ITEMS, reduce, TITLE, TITLE_ITEMS, type Screen, type ShellCtx, type ShellEvent } from '@app/shell/screens';

const ctx: ShellCtx = { levels: ['level-1', 'level-3', 'level-6'], unlocked: ['level-1', 'level-3'] };
const step = (s: Screen, ...events: ShellEvent[]) => {
  let out = { screen: s, effects: [] as readonly unknown[] };
  for (const e of events) out = reduce(out.screen, e, ctx);
  return out;
};

describe('shell screens', () => {
  it('title menu wraps and starts a new run on the first level', () => {
    expect(step(TITLE, 'up').screen).toEqual({ kind: 'title', index: TITLE_ITEMS.length - 1 });
    const t = step(TITLE, 'confirm');
    expect(t.screen).toEqual({ kind: 'intro', levelId: 'level-1' });
    expect(t.effects).toEqual([{ type: 'startLevel', levelId: 'level-1', newRun: true }]);
  });

  it('level select only starts unlocked levels and backs out to the title', () => {
    const sel = step(TITLE, 'down', 'confirm').screen;
    expect(sel).toEqual({ kind: 'levelSelect', index: 0 });
    expect(step(sel, 'down', 'down', 'confirm').screen).toEqual({ kind: 'levelSelect', index: 2 }); // level-6 locked
    expect(step(sel, 'down', 'confirm').screen).toEqual({ kind: 'intro', levelId: 'level-3' });
    expect(step(sel, 'back').screen).toEqual({ kind: 'title', index: 1 });
  });

  it('intro proceeds to play on confirm or timeout with a resume', () => {
    const intro: Screen = { kind: 'intro', levelId: 'level-1' };
    for (const e of ['confirm', 'timeout'] as const) {
      const t = reduce(intro, e, ctx);
      expect(t.screen).toEqual({ kind: 'playing', levelId: 'level-1' });
      expect(t.effects).toEqual([{ type: 'resume' }]);
    }
  });

  it('pause freezes, resumes, restarts and quits', () => {
    const playing: Screen = { kind: 'playing', levelId: 'level-3' };
    const p = reduce(playing, 'pause', ctx);
    expect(p.screen).toEqual({ kind: 'paused', levelId: 'level-3', index: 0 });
    expect(p.effects).toEqual([{ type: 'freeze' }]);
    expect(step(p.screen, 'pause').effects).toEqual([{ type: 'resume' }]);
    expect(step(p.screen, 'confirm').effects).toEqual([{ type: 'resume' }]);
    const restart = step(p.screen, 'down', 'confirm');
    expect(PAUSE_ITEMS[1]).toBe('Restart level');
    expect(restart.effects).toEqual([{ type: 'restartLevel' }, { type: 'resume' }]);
    const quit = step(p.screen, 'up', 'confirm');
    expect(quit.screen).toEqual(TITLE);
    expect(quit.effects).toEqual([{ type: 'quitToTitle' }]);
  });

  it('a clear leads to the next level, and the last clear to the credits', () => {
    const done = reduce({ kind: 'playing', levelId: 'level-1' }, 'levelComplete', ctx);
    expect(done.screen).toEqual({ kind: 'complete', levelId: 'level-1' });
    const next = reduce(done.screen, 'confirm', ctx);
    expect(next.screen).toEqual({ kind: 'intro', levelId: 'level-3' });
    expect(next.effects).toEqual([{ type: 'startLevel', levelId: 'level-3', newRun: false }]);
    const last = reduce({ kind: 'complete', levelId: 'level-6' }, 'confirm', ctx);
    expect(last.screen).toEqual({ kind: 'credits' });
    expect(step(last.screen, 'confirm').screen).toEqual(TITLE);
    expect(nextLevel(ctx, 'level-6')).toBeNull();
  });

  it('game over offers retry or quit', () => {
    const over = reduce({ kind: 'playing', levelId: 'level-6' }, 'gameOver', ctx).screen;
    expect(over).toEqual({ kind: 'gameover', levelId: 'level-6', index: 0 });
    expect(GAMEOVER_ITEMS[0]).toBe('Retry level');
    expect(step(over, 'confirm').effects).toEqual([{ type: 'restartLevel' }, { type: 'resume' }]);
    expect(step(over, 'down', 'confirm').screen).toEqual(TITLE);
  });

  it('back leaves the intro and the credits, and pauses play', () => {
    const intro = reduce({ kind: 'intro', levelId: 'level-1' }, 'back', ctx);
    expect(intro.screen).toEqual(TITLE);
    expect(intro.effects).toEqual([{ type: 'quitToTitle' }]);
    expect(reduce({ kind: 'credits' }, 'back', ctx).screen).toEqual(TITLE);
    const p = reduce({ kind: 'playing', levelId: 'level-1' }, 'back', ctx);
    expect(p.screen.kind).toBe('paused');
    expect(p.effects).toEqual([{ type: 'freeze' }]);
  });

  it('a level finishing while paused still shows its card', () => {
    const paused: Screen = { kind: 'paused', levelId: 'level-1', index: 0 };
    expect(reduce(paused, 'levelComplete', ctx).screen).toEqual({ kind: 'complete', levelId: 'level-1' });
    expect(reduce(paused, 'gameOver', ctx).screen).toEqual({ kind: 'gameover', levelId: 'level-1', index: 0 });
  });

  it('level select wraps upward from the first entry', () => {
    expect(step({ kind: 'levelSelect', index: 0 }, 'up').screen).toEqual({ kind: 'levelSelect', index: 2 });
  });
});
