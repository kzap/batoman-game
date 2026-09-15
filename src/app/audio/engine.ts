/**
 * Web Audio graph for the game: one context, a master bus, and music and sfx
 * buses under it. The context is created on the first user gesture (browsers
 * refuse to start one earlier) and everything before that is a no-op, so the
 * rest of the app never checks for audio availability.
 *
 * Ducking: gameplay moments (a hit, a boss phase) pull the music bus down
 * briefly and let it recover, so effects read over the track; the pause
 * screen holds it down until resume.
 */

export const AUDIO = {
  master: 0.9,
  music: 0.55,
  sfx: 0.8,
  /** Music level while ducked, and the ramp times either side. */
  duckTo: 0.35,
  duckIn: 0.05,
  duckHold: 0.35,
  duckOut: 0.9,
  /** Music level while paused, and how fast it gets there. */
  pausedTo: 0.25,
  pauseRamp: 0.2,
  /** Track crossfade, and the ramp when a bus is toggled. */
  fade: 0.6,
  toggleRamp: 0.02,
} as const;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicOn = true;
  private sfxOn = true;
  private paused = false;

  /** Create and resume the context. Safe to call on every input; only the first does work. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.master;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? AUDIO.music : 0;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? AUDIO.sfx : 0;
    this.sfxBus.connect(this.master);
    void ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Where effects connect. Null before the first gesture. */
  get sfxOut(): AudioNode | null {
    return this.sfxOn ? this.sfxBus : null;
  }

  get musicOut(): AudioNode | null {
    return this.musicBus;
  }

  setMusicEnabled(on: boolean): void {
    this.musicOn = on;
    this.rampMusic(this.musicTarget(), AUDIO.fade);
  }

  setSfxEnabled(on: boolean): void {
    this.sfxOn = on;
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(on ? AUDIO.sfx : 0, this.ctx.currentTime, AUDIO.toggleRamp);
  }

  /** Pull the music down for a moment; `strength` 0..1 scales how far (1 = full duck). */
  duck(strength = 1): void {
    if (!this.ctx || !this.musicBus || !this.musicOn || this.paused) return;
    const g = this.musicBus.gain;
    const now = this.ctx.currentTime;
    const low = AUDIO.music - (AUDIO.music - AUDIO.duckTo) * strength;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(low, now + AUDIO.duckIn);
    g.setValueAtTime(low, now + AUDIO.duckIn + AUDIO.duckHold);
    g.linearRampToValueAtTime(AUDIO.music, now + AUDIO.duckIn + AUDIO.duckHold + AUDIO.duckOut);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.rampMusic(this.musicTarget(), AUDIO.pauseRamp);
  }

  private musicTarget(): number {
    if (!this.musicOn) return 0;
    return this.paused ? AUDIO.pausedTo : AUDIO.music;
  }

  private rampMusic(target: number, seconds: number): void {
    if (!this.ctx || !this.musicBus) return;
    const g = this.musicBus.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + seconds);
  }
}
