import { AUDIO, type AudioEngine } from './engine';

/** The outgoing deck is paused this long after its fade reaches zero. */
const PAUSE_SLACK_S = 0.05;

/**
 * Streams the Opus tracks the pack step writes to `assets/audio/<id>.ogg`
 * through <audio> elements on the music bus. Two elements alternate so a
 * track change crossfades instead of cutting.
 */
export class MusicPlayer {
  private readonly decks: { el: HTMLAudioElement; gain: GainNode | null; track: string | null }[] = [];
  private active = -1;
  private wanted: string | null = null;

  constructor(
    private readonly engine: AudioEngine,
    private readonly base: string,
  ) {}

  get playing(): string | null {
    return this.active >= 0 ? (this.decks[this.active]?.track ?? null) : null;
  }

  /** The track asked for, whether or not the context is unlocked yet. */
  get requested(): string | null {
    return this.wanted;
  }

  /** Play a track (looping), crossfading from whatever plays now. Repeated calls with the same id are no-ops. */
  play(track: string): void {
    this.wanted = track;
    if (this.playing === track) return;
    const ctx = this.engine.context;
    const bus = this.engine.musicOut;
    if (!ctx || !bus) return; // before the first gesture; `resume()` picks it up
    const next = this.deck(ctx, bus, this.active === 0 ? 1 : 0);
    const now = ctx.currentTime;
    if (this.active >= 0) {
      const cur = this.decks[this.active]!;
      cur.gain?.gain.cancelScheduledValues(now);
      cur.gain?.gain.setValueAtTime(cur.gain.gain.value, now);
      cur.gain?.gain.linearRampToValueAtTime(0, now + AUDIO.fade);
      const el = cur.el;
      setTimeout(() => {
        if (this.decks[this.active]?.el !== el) el.pause();
      }, (AUDIO.fade + PAUSE_SLACK_S) * 1000);
    }
    next.track = track;
    next.el.src = `${this.base}assets/audio/${track}.ogg`;
    next.el.currentTime = 0;
    next.gain?.gain.cancelScheduledValues(now);
    next.gain?.gain.setValueAtTime(0, now);
    next.gain?.gain.linearRampToValueAtTime(1, now + AUDIO.fade);
    void next.el.play().catch(() => undefined); // autoplay refusal: silence until the next gesture
    this.active = this.decks.indexOf(next);
  }

  /** After the context unlocks, start whatever was asked for while it was unavailable. */
  resume(): void {
    if (this.wanted && this.playing !== this.wanted) this.play(this.wanted);
  }

  private deck(ctx: AudioContext, bus: AudioNode, i: number): { el: HTMLAudioElement; gain: GainNode | null; track: string | null } {
    let d = this.decks[i];
    if (!d) {
      const el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(bus);
      d = { el, gain, track: null };
      this.decks[i] = d;
    }
    return d;
  }

}
