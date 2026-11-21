import type { WorldSnapshot } from '@game/world';
import { formatScore } from './shell/score';

/**
 * In-game HUD (PRD 6.2): hearts top-left up to the current max, lost ones
 * greyed, a short wobble on a heart that just raised the cap, lives beside
 * them, the six-digit score top-right, and the boss bar bottom-centre while a
 * boss is engaged. Built from DOM once per change, not per frame.
 */
export class Hud {
  private lastKey = '';
  /** Max hearts last painted. -1 until the first paint, so the opening row does not wobble. */
  private heartsShown = -1;

  constructor(private readonly el: HTMLElement) {}

  update(snap: WorldSnapshot, score: number): void {
    const boss = snap.boss;
    const maxHp = snap.player.maxHp;
    const bossKey = boss?.engaged ? `${boss.hp}/${boss.maxHp}/${boss.phase}` : '';
    const key = `${snap.player.hp}/${maxHp}|${snap.lives}|${score}|${bossKey}`;
    if (key === this.lastKey) return;
    const gainedFrom = this.heartsShown;
    const gained = gainedFrom >= 0 && maxHp > gainedFrom;
    this.heartsShown = maxHp;
    this.lastKey = key;
    this.el.textContent = '';

    const top = document.createElement('div');
    top.className = 'hud-top';
    const hearts = document.createElement('div');
    hearts.className = 'hud-hearts';
    for (let i = 0; i < maxHp; i++) {
      const h = document.createElement('span');
      const classes = ['hud-heart'];
      if (i >= snap.player.hp) classes.push('hud-heart-lost');
      if (gained && i >= gainedFrom) classes.push('hud-heart-gained');
      h.className = classes.join(' ');
      h.textContent = '\u2665';
      hearts.append(h);
    }
    const lives = document.createElement('div');
    lives.className = 'hud-lives';
    lives.textContent = `lives ${snap.lives}`;
    const scoreEl = document.createElement('div');
    scoreEl.className = 'hud-score';
    scoreEl.textContent = formatScore(score);
    top.append(hearts, lives, scoreEl);
    this.el.append(top);

    if (boss?.engaged && boss.hp > 0) {
      const bar = document.createElement('div');
      bar.className = 'hud-boss';
      const label = document.createElement('div');
      label.className = 'hud-boss-label';
      label.textContent = `ASWANG PROTOTYPE - phase ${boss.phase}`;
      const track = document.createElement('div');
      track.className = 'hud-boss-track';
      const fill = document.createElement('div');
      fill.className = 'hud-boss-fill';
      fill.style.width = `${(100 * boss.hp) / boss.maxHp}%`;
      track.append(fill);
      bar.append(label, track);
      this.el.append(bar);
    }
  }
}
