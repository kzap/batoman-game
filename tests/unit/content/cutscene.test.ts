import { describe, expect, it } from 'vitest';
import { cutsceneProblems, parseCutscene } from '@content/cutscene';

const valid = {
  version: 1 as const,
  id: 'level-1',
  beats: [
    {
      speaker: 'Ando',
      text: 'Golden hour on the piers, and that unit is still hunting.',
      portrait: { atlas: 'batoman', animation: 'idle' },
      camera: { x: 6150, y: 64, ms: 1600 },
      holdMs: 3200,
    },
    {
      speaker: 'Sari-sari',
      text: "Anak, 'wag diyan.",
      holdMs: 2000,
    },
  ],
};

describe('cutscene script', () => {
  it('accepts a valid script', () => {
    expect(cutsceneProblems(valid)).toEqual([]);
    expect(parseCutscene(valid).beats).toHaveLength(2);
  });

  it('rejects empty beats and bad structure', () => {
    expect(cutsceneProblems({ version: 1, id: 'level-1', beats: [] })).toContain('beats must not be empty');
    expect(cutsceneProblems({ version: 2, id: 'level-1', beats: valid.beats })[0]).toMatch(/unsupported version/);
    expect(cutsceneProblems({ version: 1, id: 'LEVEL 1', beats: valid.beats })[0]).toMatch(/id must match/);
  });

  it('rejects a portrait without frame or animation, and a broken camera', () => {
    const noFrame = {
      ...valid,
      beats: [{ speaker: 'Ando', text: 'hi', portrait: { atlas: 'batoman' }, holdMs: 1 }],
    };
    expect(cutsceneProblems(noFrame).some((p) => p.includes('needs frame or animation'))).toBe(true);

    const badCam = {
      ...valid,
      beats: [{ speaker: 'Ando', text: 'hi', camera: { x: 1.5, y: 2, ms: -1 }, holdMs: 1 }],
    };
    const problems = cutsceneProblems(badCam);
    expect(problems.some((p) => p.includes('x and .y'))).toBe(true);
    expect(problems.some((p) => p.includes('ms'))).toBe(true);
  });

  it('rejects a portrait with a non-identifier atlas name', () => {
    const bad = {
      ...valid,
      beats: [{ speaker: 'Ando', text: 'hi', portrait: { atlas: 'Bato Man', animation: 'idle' }, holdMs: 1 }],
    };
    expect(cutsceneProblems(bad).some((p) => p.includes('atlas'))).toBe(true);
  });
});
