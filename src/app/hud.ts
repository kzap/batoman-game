import { PLAYER } from '@game/tuning';
import type { WorldSnapshot } from '@game/world';

/** Minimal grey-box HUD: hearts, lives, the boss bar, and the end-of-run banner. The real HUD is Phase 7. */
export class Hud {
  private lastKey = '';

  constructor(private readonly el: HTMLElement) {}

  update(snap: WorldSnapshot): void {
    const banner = snap.status === 'complete' ? 'LEVEL COMPLETE - press jump to restart' : snap.status === 'gameover' ? 'GAME OVER - press jump to restart' : '';
    const boss = snap.boss;
    const key = `${snap.player.hp}|${snap.lives}|${banner}|${boss?.engaged ? `${boss.hp}/${boss.maxHp}/${boss.phase}` : ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const hearts = '\u2665'.repeat(snap.player.hp) + '\u2661'.repeat(Math.max(0, PLAYER.maxHp - snap.player.hp));
    this.el.textContent = '';
    const top = document.createElement('div');
    top.className = 'hud-top';
    top.textContent = `${hearts}   lives ${snap.lives}`;
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
    if (banner) {
      const b = document.createElement('div');
      b.className = 'hud-banner';
      b.textContent = banner;
      this.el.append(b);
    }
  }
}
