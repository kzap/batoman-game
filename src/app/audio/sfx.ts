import type { AudioEngine } from './engine';

/**
 * Procedural sound effects: every cue is a few oscillators and noise bursts
 * with envelopes, built on demand from the recipes below. No files, so the
 * payload is unchanged and a cue is retuned by editing numbers here. Swap a
 * recipe for a sample player later and nothing upstream changes.
 */

export type SfxName =
  | 'jump'
  | 'wallJump'
  | 'land'
  | 'dash'
  | 'plasma'
  | 'nova'
  | 'enemyShot'
  | 'hit'
  | 'weakHit'
  | 'enemyDeath'
  | 'hurt'
  | 'death'
  | 'respawn'
  | 'checkpoint'
  | 'complete'
  | 'gameOver'
  | 'bossPhase'
  | 'bossDefeated'
  | 'menuMove'
  | 'menuConfirm'
  | 'menuBack'
  | 'pause'
  | 'unpause';

type Wave = OscillatorType;

interface Voice {
  readonly ctx: AudioContext;
  readonly out: AudioNode;
  readonly t: number;
}

/** Minimum gap between two plays of the same cue, so a burst of hits does not stack into a wall of noise. */
const RETRIGGER_S: Partial<Record<SfxName, number>> = { hit: 0.03, weakHit: 0.03, plasma: 0.04, enemyShot: 0.04, land: 0.08 };
/** Nodes stop a little after their envelope reaches silence so the exponential tail is not clipped. */
const TAIL_S = 0.03;

/** One oscillator with a pitch glide and a linear attack/exponential decay envelope. */
function tone(v: Voice, wave: Wave, from: number, to: number, dur: number, gain: number, delay = 0): void {
  const osc = v.ctx.createOscillator();
  const g = v.ctx.createGain();
  const t0 = v.t + delay;
  osc.type = wave;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.01, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(v.out);
  osc.start(t0);
  osc.stop(t0 + dur + TAIL_S);
}

/** One second of white noise per context, built once. Deterministic (an LCG, not Math.random) so a cue sounds the same every run. */
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 0x2545f491;
    for (let i = 0; i < d.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = s / 2147483648 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

function noise(v: Voice, dur: number, gain: number, filter: { type: BiquadFilterType; from: number; to: number; q?: number }, delay = 0): void {
  const src = v.ctx.createBufferSource();
  src.buffer = noiseBuffer(v.ctx);
  const f = v.ctx.createBiquadFilter();
  f.type = filter.type;
  f.Q.value = filter.q ?? 1;
  const t0 = v.t + delay;
  f.frequency.setValueAtTime(filter.from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, filter.to), t0 + dur);
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(v.out);
  src.start(t0, 0, dur + TAIL_S);
}

/** A short run of notes (Hz) with a fixed spacing; the mini fanfares. */
function arpeggio(v: Voice, wave: Wave, notes: readonly number[], spacing: number, noteDur: number, gain: number): void {
  notes.forEach((n, i) => tone(v, wave, n, n, noteDur, gain, i * spacing));
}

const RECIPES: Record<SfxName, (v: Voice) => void> = {
  jump: (v) => tone(v, 'square', 320, 640, 0.12, 0.18),
  wallJump: (v) => tone(v, 'square', 420, 900, 0.12, 0.18),
  land: (v) => noise(v, 0.07, 0.35, { type: 'lowpass', from: 600, to: 120 }),
  dash: (v) => noise(v, 0.2, 0.3, { type: 'bandpass', from: 400, to: 2400, q: 0.7 }),
  plasma: (v) => {
    tone(v, 'sawtooth', 1100, 380, 0.09, 0.16);
    noise(v, 0.05, 0.12, { type: 'highpass', from: 3000, to: 6000 });
  },
  nova: (v) => {
    tone(v, 'sine', 140, 38, 0.55, 0.5);
    tone(v, 'sawtooth', 900, 120, 0.3, 0.2);
    noise(v, 0.45, 0.4, { type: 'lowpass', from: 4000, to: 200 });
  },
  enemyShot: (v) => tone(v, 'triangle', 520, 190, 0.11, 0.16),
  hit: (v) => {
    noise(v, 0.05, 0.3, { type: 'highpass', from: 2000, to: 5000 });
    tone(v, 'square', 1400, 900, 0.05, 0.1);
  },
  weakHit: (v) => {
    noise(v, 0.08, 0.35, { type: 'highpass', from: 1500, to: 6000 });
    tone(v, 'square', 1800, 2600, 0.09, 0.14);
  },
  enemyDeath: (v) => {
    arpeggio(v, 'square', [880, 660, 440, 220], 0.05, 0.09, 0.16);
    noise(v, 0.3, 0.35, { type: 'lowpass', from: 2500, to: 150 });
  },
  hurt: (v) => {
    tone(v, 'sawtooth', 260, 70, 0.24, 0.3);
    noise(v, 0.12, 0.2, { type: 'bandpass', from: 900, to: 300, q: 2 });
  },
  death: (v) => {
    tone(v, 'sawtooth', 400, 40, 0.8, 0.3);
    tone(v, 'square', 200, 30, 0.8, 0.15, 0.05);
  },
  respawn: (v) => arpeggio(v, 'triangle', [440, 660, 880], 0.07, 0.14, 0.16),
  checkpoint: (v) => arpeggio(v, 'sine', [880, 1320], 0.11, 0.25, 0.22),
  complete: (v) => arpeggio(v, 'square', [523, 659, 784, 1047], 0.12, 0.3, 0.16),
  gameOver: (v) => arpeggio(v, 'sawtooth', [392, 330, 262, 196], 0.28, 0.5, 0.18),
  bossPhase: (v) => {
    arpeggio(v, 'square', [330, 494, 330, 494], 0.14, 0.13, 0.18);
    noise(v, 0.5, 0.3, { type: 'lowpass', from: 3000, to: 300 });
  },
  bossDefeated: (v) => {
    tone(v, 'sine', 120, 30, 1.2, 0.5);
    noise(v, 1.0, 0.5, { type: 'lowpass', from: 5000, to: 100 });
    arpeggio(v, 'square', [523, 659, 784, 1047, 1319], 0.16, 0.5, 0.14);
  },
  menuMove: (v) => tone(v, 'square', 700, 700, 0.04, 0.08),
  menuConfirm: (v) => arpeggio(v, 'square', [660, 990], 0.06, 0.1, 0.12),
  menuBack: (v) => tone(v, 'square', 500, 300, 0.09, 0.1),
  pause: (v) => tone(v, 'triangle', 600, 300, 0.15, 0.14),
  unpause: (v) => tone(v, 'triangle', 300, 600, 0.15, 0.14),
};

export class Sfx {
  private readonly last = new Map<SfxName, number>();

  constructor(private readonly engine: AudioEngine) {}

  play(name: SfxName): void {
    const ctx = this.engine.context;
    const out = this.engine.sfxOut;
    if (!ctx || !out || !this.engine.ready) return;
    const gap = RETRIGGER_S[name];
    const now = ctx.currentTime;
    if (gap !== undefined && now - (this.last.get(name) ?? -Infinity) < gap) return;
    this.last.set(name, now);
    RECIPES[name]({ ctx, out, t: now });
  }
}
