import { describe, expect, it } from 'vitest';
import { parseMusicSpec } from '../audio.js';

describe('parseMusicSpec', () => {
  it('accepts a well-formed spec', () => {
    const spec = parseMusicSpec({ bitrateKbps: 80, tracks: { 'level-1': { source: 'level-1.mp3', title: 'Tondo' } } }, 'music.json');
    expect(Object.keys(spec.tracks)).toEqual(['level-1']);
  });

  it('rejects bad bitrates, ids and tracks', () => {
    expect(() => parseMusicSpec({ bitrateKbps: 8, tracks: {} }, 'm')).toThrow(/bitrateKbps/);
    expect(() => parseMusicSpec({ bitrateKbps: 80, tracks: { 'Bad Id': { source: 'x', title: 'x' } } }, 'm')).toThrow(/bad track id/);
    expect(() => parseMusicSpec({ bitrateKbps: 80, tracks: { ok: { source: 'x' } } }, 'm')).toThrow(/needs source and title/);
    expect(() => parseMusicSpec(null, 'm')).toThrow(/not an object/);
  });
});
