import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO, AudioEngine } from '@app/audio/engine';
import { Sfx } from '@app/audio/sfx';

/**
 * A minimal AudioContext double: gain nodes record their scheduled values,
 * oscillators and buffer sources count starts. Enough to check the bus
 * graph, ducking and that every cue schedules real nodes.
 */
class FakeParam {
  value: number;
  readonly events: string[] = [];
  constructor(v: number) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number): this {
    this.events.push(`set ${v.toFixed(2)}@${t.toFixed(2)}`);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.events.push(`ramp ${v.toFixed(2)}@${t.toFixed(2)}`);
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.events.push(`exp ${v.toFixed(2)}@${t.toFixed(2)}`);
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number): this {
    this.events.push(`target ${v.toFixed(2)}@${t.toFixed(2)}`);
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class FakeNode {
  readonly connections: FakeNode[] = [];
  connect(n: FakeNode): FakeNode {
    this.connections.push(n);
    return n;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

let started = 0;
class FakeSource extends FakeNode {
  readonly frequency = new FakeParam(440);
  readonly Q = new FakeParam(1);
  type = '';
  buffer: unknown = null;
  start(): void {
    started++;
  }
  stop(): void {}
}

class FakeContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 48000;
  readonly destination = new FakeNode();
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createOscillator(): FakeSource {
    return new FakeSource();
  }
  createBufferSource(): FakeSource {
    return new FakeSource();
  }
  createBiquadFilter(): FakeSource {
    return new FakeSource();
  }
  createBuffer(_c: number, len: number): { getChannelData(): Float32Array } {
    return { getChannelData: () => new Float32Array(len) };
  }
}

describe('AudioEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeContext);
    started = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is inert before unlock, then builds master, music and sfx buses at their levels', () => {
    const e = new AudioEngine();
    expect(e.ready).toBe(false);
    expect(e.sfxOut).toBeNull();
    e.duck(); // no context yet: nothing to do
    e.unlock();
    expect(e.ready).toBe(true);
    const master = (e.context as unknown as FakeContext).destination;
    const music = e.musicOut as unknown as FakeGain;
    const sfx = e.sfxOut as unknown as FakeGain;
    expect(music.gain.value).toBe(AUDIO.music);
    expect(sfx.gain.value).toBe(AUDIO.sfx);
    const masterNode = music.connections[0] as FakeGain;
    expect(masterNode.gain.value).toBe(AUDIO.master);
    expect(masterNode.connections[0]).toBe(master);
    expect(sfx.connections[0]).toBe(masterNode);
  });

  it('ducks the music bus down and back, holds it low while paused, and mutes on toggle', () => {
    const e = new AudioEngine();
    e.unlock();
    const g = (e.musicOut as unknown as FakeGain).gain;
    e.duck(1);
    expect(g.events.some((x) => x.startsWith(`ramp ${AUDIO.duckTo.toFixed(2)}`))).toBe(true);
    expect(g.events.at(-1)).toMatch(new RegExp(`^ramp ${AUDIO.music.toFixed(2)}`));
    e.setPaused(true);
    expect(g.value).toBe(AUDIO.pausedTo);
    e.duck(1); // ignored while paused
    expect(g.value).toBe(AUDIO.pausedTo);
    e.setPaused(false);
    expect(g.value).toBe(AUDIO.music);
    e.setMusicEnabled(false);
    expect(g.value).toBe(0);
    e.setSfxEnabled(false);
    expect(e.sfxOut).toBeNull();
  });

  it('every sfx recipe schedules at least one node and retriggers are rate-limited', () => {
    const e = new AudioEngine();
    e.unlock();
    const sfx = new Sfx(e);
    for (const name of ['jump', 'wallJump', 'land', 'dash', 'plasma', 'nova', 'enemyShot', 'hit', 'weakHit', 'enemyDeath', 'hurt', 'death', 'respawn', 'checkpoint', 'complete', 'gameOver', 'bossPhase', 'bossDefeated', 'menuMove', 'menuConfirm', 'menuBack', 'pause', 'unpause'] as const) {
      const before = started;
      sfx.play(name);
      expect(started, name).toBeGreaterThan(before);
    }
    const before = started;
    sfx.play('hit'); // same clock time as the previous hit: dropped
    expect(started).toBe(before);
  });
});
