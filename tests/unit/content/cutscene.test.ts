import { describe, expect, it } from 'vitest';
import { beatHoldMs, cutsceneProblems, DEFAULT_HOLD_MS, fitPortraitDisplay, parseCutscene, PORTRAIT_MAX_EDGE } from '@content/cutscene';

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
        backdrop: 'town',
        crop: { x: 80, y: 400, w: 280, h: 280 },
      },
      holdMs: 3600,
    },
  ],
};

describe('cutscene script', () => {
  it('accepts a valid script with atlas and backdrop portraits', () => {
    expect(cutsceneProblems(valid)).toEqual([]);
    expect(parseCutscene(valid).beats).toHaveLength(2);
  });

  it('rejects empty beats and bad structure', () => {
    expect(cutsceneProblems({ version: 1, id: 'level-1', beats: [] })).toContain('beats must not be empty');
    expect(cutsceneProblems({ version: 2, id: 'level-1', beats: valid.beats })[0]).toMatch(/unsupported version/);
    expect(cutsceneProblems({ version: 1, id: 'LEVEL 1', beats: valid.beats })[0]).toMatch(/id must match/);
  });

  it('rejects a portrait without atlas/backdrop, and a broken crop or camera', () => {
    const noSource = {
      ...valid,
      beats: [{ speaker: 'Ando', text: 'hi', portrait: { animation: 'idle' }, holdMs: 1 }],
    };
    expect(cutsceneProblems(noSource).some((p) => p.includes('exactly one of atlas or backdrop'))).toBe(true);

    const noFrame = {
      ...valid,
      beats: [{ speaker: 'Ando', text: 'hi', portrait: { atlas: 'batoman' }, holdMs: 1 }],
    };
    expect(cutsceneProblems(noFrame).some((p) => p.includes('needs frame or animation'))).toBe(true);

    const backdropNoCrop = {
      ...valid,
      beats: [{ speaker: 'Sari-sari', text: 'hi', portrait: { backdrop: 'town' }, holdMs: 1 }],
    };
    expect(cutsceneProblems(backdropNoCrop).some((p) => p.includes('need a crop'))).toBe(true);

    const badCam = {
      ...valid,
      beats: [{ speaker: 'Ando', text: 'hi', camera: { x: 1.5, y: 2, ms: -1 }, holdMs: 1 }],
    };
    const problems = cutsceneProblems(badCam);
    expect(problems.some((p) => p.includes('x and .y'))).toBe(true);
    expect(problems.some((p) => p.includes('ms'))).toBe(true);
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

  it('fits large crops into the portrait box without upscaling small frames', () => {
    expect(fitPortraitDisplay(90, 120)).toEqual({ w: 90, h: 120 });
    expect(fitPortraitDisplay(280, 280)).toEqual({ w: PORTRAIT_MAX_EDGE, h: PORTRAIT_MAX_EDGE });
    expect(fitPortraitDisplay(600, 300)).toEqual({ w: PORTRAIT_MAX_EDGE, h: PORTRAIT_MAX_EDGE / 2 });
  });
});
