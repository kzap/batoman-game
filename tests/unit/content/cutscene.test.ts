import { describe, expect, it } from 'vitest';
import { beatHoldMs, cutsceneProblems, DEFAULT_HOLD_MS, parseCutscene } from '@content/cutscene';

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
      portrait: {
        atlas: 'patroller',
        animation: 'idle',
        tint: 0xd8b4ff,
        crop: { x: 20, y: 0, w: 78, h: 78 },
      },
      holdMs: 3600,
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

  it('rejects a portrait without frame or animation, and a broken camera or crop', () => {
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

    const badCrop = {
      ...valid,
      beats: [{ speaker: 'Ando', text: 'hi', portrait: { atlas: 'patroller', frame: 'idle_00', crop: { x: 0, y: 0, w: 0, h: 10 } }, holdMs: 1 }],
    };
    expect(cutsceneProblems(badCrop).some((p) => p.includes('crop'))).toBe(true);
  });

  it('rejects a portrait with a non-identifier atlas name', () => {
    const bad = {
      ...valid,
      beats: [{ speaker: 'Ando', text: 'hi', portrait: { atlas: 'Bato Man', animation: 'idle' }, holdMs: 1 }],
    };
    expect(cutsceneProblems(bad).some((p) => p.includes('atlas'))).toBe(true);
  });

  it('allows omitting holdMs and resolves the default', () => {
    const noHold = {
      version: 1 as const,
      id: 'level-1',
      beats: [{ speaker: 'Ando', text: 'hi' }],
    };
    expect(cutsceneProblems(noHold)).toEqual([]);
    expect(beatHoldMs(noHold.beats[0])).toBe(DEFAULT_HOLD_MS);
    expect(beatHoldMs({ speaker: 'Ando', text: 'hi', holdMs: 1200 })).toBe(1200);
  });
});
