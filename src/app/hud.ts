import { PLAYER } from '@game/tuning';
import type { WorldSnapshot } from '@game/world';

/** Minimal grey-box HUD: hearts, lives, and the end-of-run banner. The real HUD is Phase 7. */
export class Hud {
  private lastKey = '';

  constructor(private readonly el: HTMLElement) {}

  update(snap: WorldSnapshot): void {
    const banner = snap.status === 'complete' ? 'LEVEL COMPLETE - press jump to restart' : snap.status === 'gameover' ? 'GAME OVER - press jump to restart' : '';
    const key = `${snap.player.hp}|${snap.lives}|${banner}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const hearts = '\u2665'.repeat(snap.player.hp) + '\u2661'.repeat(Math.max(0, PLAYER.maxHp - snap.player.hp));
    this.el.textContent = '';
    const top = document.createElement('div');
    top.className = 'hud-top';
    top.textContent = `${hearts}   lives ${snap.lives}`;
    this.el.append(top);
    if (banner) {
      const b = document.createElement('div');
      b.className = 'hud-banner';
      b.textContent = banner;
      this.el.append(b);
    }
  }
}
