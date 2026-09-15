import type { EventBus } from '@core/sim/events';
import type { WorldEvents } from '@game/world';
import { AudioEngine } from './engine';
import { MusicPlayer } from './music';
import { Sfx, type SfxName } from './sfx';

export { AUDIO, AudioEngine } from './engine';
export { MusicPlayer } from './music';
export { Sfx, type SfxName } from './sfx';

/**
 * The game's audio: engine, music and effects together, plus the mapping from
 * sim events to cues (the same channel the particle effects use). Owned by the
 * shell; the sim and renderer know nothing about it.
 */
export class GameAudio {
  readonly engine = new AudioEngine();
  readonly music: MusicPlayer;
  readonly sfx = new Sfx(this.engine);
  private unsubscribe: (() => void)[] = [];

  constructor(base: string) {
    this.music = new MusicPlayer(this.engine, base);
  }

  /** Call on any user input; the first one creates the context and starts pending music. */
  unlock(): void {
    this.engine.unlock();
    this.music.resume();
  }

  play(name: SfxName): void {
    this.sfx.play(name);
  }

  /** Subscribe to a world's events; previous subscriptions are dropped. */
  attach(events: EventBus<WorldEvents>): void {
    this.detach();
    const play = (name: SfxName) => (): void => this.sfx.play(name);
    const duckAnd = (name: SfxName, strength: number) => (): void => {
      this.sfx.play(name);
      this.engine.duck(strength);
    };
    this.unsubscribe = [
      events.on('jump', (e) => this.sfx.play(e.wall ? 'wallJump' : 'jump')),
      events.on('land', play('land')),
      events.on('dash', play('dash')),
      events.on('fire', (e) => this.sfx.play(e.kind === 'nova' ? 'nova' : e.kind === 'plasma' ? 'plasma' : 'enemyShot')),
      events.on('enemyHit', (e) => this.sfx.play(e.weakPoint ? 'weakHit' : 'hit')),
      events.on('enemyDeath', play('enemyDeath')),
      events.on('hurt', duckAnd('hurt', 0.6)),
      events.on('death', duckAnd('death', 1)),
      events.on('respawn', play('respawn')),
      events.on('checkpoint', play('checkpoint')),
      events.on('complete', duckAnd('complete', 1)),
      events.on('gameover', duckAnd('gameOver', 1)),
      events.on('bossPhase', duckAnd('bossPhase', 1)),
      events.on('bossDefeated', duckAnd('bossDefeated', 1)),
    ];
  }

  detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }
}
