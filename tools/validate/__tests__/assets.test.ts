import { describe, expect, it } from 'vitest';
import type { AtlasJson } from '../../../src/content/atlas';
import { atlasFileProblems, expectedAtlasOutputs, expectedBackdropOutputs, ktx2SchemeProblem } from '../assets';

const atlas: AtlasJson = {
  version: 1,
  image: 'drone.webp',
  width: 64,
  height: 32,
  scale: 0.5,
  frames: { hover_00: { x: 0, y: 0, w: 16, h: 16, pivot: { x: 8, y: 8 } } },
  animations: { hover: { fps: 8, loop: true, frames: ['hover_00'] } },
};

describe('expected pipeline outputs', () => {
  it('lists json + webp per recipe and webp, ktx2, and meta per backdrop layer', () => {
    expect(expectedAtlasOutputs('drone', 'art-source/characters/drone.recipe.json', 'public/assets/atlases').map((e) => e.path)).toEqual([
      'public/assets/atlases/drone.json',
      'public/assets/atlases/drone.webp',
    ]);
    expect(expectedBackdropOutputs('level-1', ['background', 'foreground'], 'art-source/level-1/backdrops.json', 'public/assets/backdrops').map((e) => e.path)).toEqual([
      'public/assets/backdrops/level-1/background.webp',
      'public/assets/backdrops/level-1/background.ktx2',
      'public/assets/backdrops/level-1/background.meta.json',
      'public/assets/backdrops/level-1/foreground.webp',
      'public/assets/backdrops/level-1/foreground.ktx2',
      'public/assets/backdrops/level-1/foreground.meta.json',
    ]);
  });
});

describe('atlasFileProblems', () => {
  it('accepts a consistent atlas whose image matches', () => {
    expect(atlasFileProblems('drone', atlas, { width: 64, height: 32 })).toEqual([]);
  });

  it('reports a missing image, a size mismatch, and a wrong image name', () => {
    expect(atlasFileProblems('drone', atlas, null)).toEqual([expect.stringMatching(/missing or unreadable/)]);
    expect(atlasFileProblems('drone', atlas, { width: 128, height: 32 })).toEqual([expect.stringMatching(/128x32 but JSON says 64x32/)]);
    expect(atlasFileProblems('patroller', atlas, { width: 64, height: 32 })).toEqual([expect.stringMatching(/should be "patroller.webp"/)]);
  });

  it('surfaces atlasProblems findings and rejects non-objects', () => {
    const broken = { ...atlas, animations: { hover: { fps: 8, loop: true, frames: ['nope'] } } };
    expect(atlasFileProblems('drone', broken, { width: 64, height: 32 })).toEqual([expect.stringMatching(/unknown frame "nope"/)]);
    expect(atlasFileProblems('drone', 'text', { width: 64, height: 32 })).toEqual(['drone.json is not an object']);
  });
});

describe('ktx2SchemeProblem', () => {
  const header = (scheme: number): Uint8Array => {
    const bytes = new Uint8Array(48);
    new DataView(bytes.buffer).setUint32(44, scheme, true);
    return bytes;
  };

  it('accepts BasisLZ and rejects another scheme or a short file', () => {
    expect(ktx2SchemeProblem('a.ktx2', header(1))).toBeNull();
    expect(ktx2SchemeProblem('a.ktx2', header(2))).toMatch(/scheme 2/);
    expect(ktx2SchemeProblem('a.ktx2', new Uint8Array(10))).toMatch(/shorter than 48/);
  });
});
