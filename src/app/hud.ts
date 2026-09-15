import { PLAYER } from '@game/tuning';
import type { WorldSnapshot } from '@game/world';
import { formatScore } from './shell/score';

/**
 * In-game HUD (PRD 6.2): hearts top-left with lost ones greyed, lives beside
 * them, the six-digit score top-right, and the boss bar bottom-centre while a
 * boss is engaged. Built from DOM once per change, not per frame.
 */
export class Hud {
  private lastKey = '';

  constructor(private readonly el: HTMLElement) {}

  update(snap: WorldSnapshot, score: number): void {
    const boss = snap.boss;
    const bossKey = boss?.engaged ? `${boss.hp}/${boss.maxHp}/${boss.phase}` : '';
    const key = `${snap.player.hp}|${snap.lives}|${score}|${bossKey}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.el.textContent = '';

    const top = document.createElement('div');
    top.className = 'hud-top';
    const hearts = document.createElement('div');
    hearts.className = 'hud-hearts';
    for (let i = 0; i < PLAYER.maxHp; i++) {
      const h = document.createElement('span');
      h.className = i < snap.player.hp ? 'hud-heart' : 'hud-heart hud-heart-lost';
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
