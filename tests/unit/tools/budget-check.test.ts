import { describe, expect, it } from 'vitest';
import { forbiddenServedPathReason, type Budget } from '../../../tools/config';
import { checkBudget } from '../../../tools/validate/budget-check';
import type { FileEntry } from '../../../tools/validate/lib';

const file = (rel: string, size: number): FileEntry => ({ rel, size });

const budget: Budget = {
  totalServed: 1000,
  code: 500,
  singleImage: 300,
  singleAudio: 400,
};

describe('forbiddenServedPathReason', () => {
  it('allows pipeline outputs, audio, code, and html', () => {
    expect(forbiddenServedPathReason('assets/atlases/batoman.webp')).toBeNull();
    expect(forbiddenServedPathReason('assets/ui/heart.png')).toBeNull();
    expect(forbiddenServedPathReason('assets/audio/level-1.mp3')).toBeNull();
    expect(forbiddenServedPathReason('assets/index-abc.js')).toBeNull();
    expect(forbiddenServedPathReason('index.html')).toBeNull();
  });

  it('rejects raw art by name', () => {
    expect(forbiddenServedPathReason('assets/level-1/concept-art-docks.png')).toMatch(/raw-art/);
    expect(forbiddenServedPathReason('assets/characters/batoman-sprites.png')).toMatch(/raw-art/);
    expect(forbiddenServedPathReason('art-source/x.webp')).toMatch(/raw-art/);
  });

  it('rejects any raster image that did not come through the pipeline', () => {
    expect(forbiddenServedPathReason('assets/level-1/tileset.png')).toMatch(/outside/);
    expect(forbiddenServedPathReason('assets/level-1/background.webp')).toMatch(/outside/);
    expect(forbiddenServedPathReason('level-select.png')).toMatch(/outside/);
  });
});

describe('checkBudget', () => {
  it('passes a small clean build', () => {
    const r = checkBudget(
      [file('index.html', 100), file('assets/app.js', 200), file('assets/atlases/a.webp', 100)],
      budget,
    );
    expect(r.ok).toBe(true);
  });

  it('ignores source maps when totalling', () => {
    const r = checkBudget([file('assets/app.js', 400), file('assets/app.js.map', 100_000)], budget);
    expect(r.ok).toBe(true);
  });

  it('fails when the code budget is exceeded', () => {
    const r = checkBudget([file('assets/app.js', 600)], budget);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/code payload/);
  });

  it('fails when the total served budget is exceeded', () => {
    const r = checkBudget(
      [
        file('assets/atlases/a.webp', 250),
        file('assets/atlases/b.webp', 250),
        file('assets/atlases/c.webp', 250),
        file('assets/atlases/d.webp', 251),
      ],
      budget,
    );
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/served payload/);
  });

  it('fails on oversized single assets', () => {
    expect(checkBudget([file('assets/atlases/huge.png', 301)], budget).errors[0]).toMatch(/image limit/);
    expect(checkBudget([file('assets/audio/huge.mp3', 401)], budget).errors[0]).toMatch(/audio limit/);
  });

  it('fails when raw art leaks into the build', () => {
    const r = checkBudget([file('assets/level-1/concept-art-docks.png', 10)], budget);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/raw-art/);
  });
});
