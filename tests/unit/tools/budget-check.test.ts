import { describe, expect, it } from 'vitest';
import type { Budget } from '../../../tools/config';
import { checkBudget } from '../../../tools/validate/budget-check';
import type { FileEntry } from '../../../tools/validate/lib';

const file = (rel: string, size: number): FileEntry => ({ rel, abs: `/dist/${rel}`, size });

const budget: Budget = {
  totalServed: 1000,
  code: 500,
  singleImage: 300,
  singleAudio: 400,
  forbiddenPathPatterns: [/concept-art/i],
};

describe('checkBudget', () => {
  it('passes a small clean build', () => {
    const r = checkBudget([file('index.html', 100), file('assets/app.js', 200), file('assets/a.webp', 100)], budget);
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
      [file('a.webp', 250), file('b.webp', 250), file('c.webp', 250), file('d.webp', 251)],
      budget,
    );
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/served payload/);
  });

  it('fails on oversized single assets', () => {
    expect(checkBudget([file('assets/huge.png', 301)], budget).errors[0]).toMatch(/image limit/);
    expect(checkBudget([file('assets/huge.mp3', 401)], budget).errors[0]).toMatch(/audio limit/);
  });

  it('fails when raw art leaks into the build', () => {
    const r = checkBudget([file('assets/level-1/concept-art-docks.png', 10)], budget);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/forbidden/);
  });
});
