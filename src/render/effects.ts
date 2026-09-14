import type { EventBus } from '@core/sim/events';
import type { WorldEvents } from '@game/world';
import { BURSTS, ParticleSystem } from './particles';

/**
 * Turns sim events into particle bursts. The renderer still never reads the
 * World: it receives the event payloads (plain positions and kinds) that the
 * sim announces for exactly this purpose, and forgets them once emitted.
 */
export class Effects {
  readonly particles = new ParticleSystem();
  private unsubscribe: (() => void)[] = [];

  /** Listen to a world's events; call again for a new world (the old subscriptions are dropped). */
  attach(events: EventBus<WorldEvents>): void {
    this.detach();
    const fx = this.particles;
    this.unsubscribe = [
      events.on('enemyHit', (e) => fx.burst(e.x, e.y, e.weakPoint ? BURSTS.weakPointSpark : BURSTS.hitSpark, e.dir < 0)),
      events.on('shotEnd', (e) => {
        if (e.hitSolid) fx.burst(e.x, e.y, BURSTS.solidSpark);
      }),
      events.on('enemyDeath', (e) => fx.burst(e.x, e.y, BURSTS.enemyDeath)),
      events.on('fire', (e) => {
        if (e.kind === 'nova') fx.burst(e.x, e.y, BURSTS.novaFire, e.dir < 0);
      }),
      events.on('bossPhase', (e) => fx.burst(e.x, e.y, BURSTS.bossPhase)),
      events.on('bossDefeated', (e) => fx.burst(e.x, e.y, BURSTS.bossDeath)),
    ];
  }

  update(deltaSeconds: number, pixelRatio: number): void {
    this.particles.update(deltaSeconds, pixelRatio);
  }

  detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  dispose(): void {
    this.detach();
    this.particles.dispose();
  }
}
