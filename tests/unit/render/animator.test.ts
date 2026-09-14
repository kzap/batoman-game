import { describe, expect, it } from 'vitest';
import type { AtlasJson } from '@content/atlas';
import { clipForPose, clipFrameIndex, PlayerAnimator, playerClips, type Clip } from '@render/animator';

const frames = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const anim = (prefix: string, n: number, fps: number, loop: boolean) => ({ fps, loop, frames: frames(prefix, n) });

/** Shaped like the real batoman atlas: the same animation names and frame counts. */
const atlas: AtlasJson = {
  version: 1,
  image: 'batoman.webp',
  width: 1024,
  height: 1024,
  scale: 0.5,
  frames: {},
  animations: {
    idle: anim('i', 10, 6, true),
    run: anim('r', 11, 14, true),
    shoot: anim('s', 6, 14, false),
    shoot_run: anim('sr', 9, 14, true),
    hurt: anim('h', 2, 10, false),
    orb: anim('o', 1, 1, true),
    jump: anim('j', 9, 12, false),
  },
};

describe('clipFrameIndex', () => {
  const clip: Clip = { frames: frames('f', 4), fps: 12, loop: true };

  it('advances one frame every SIM_HZ / fps ticks', () => {
    expect(clipFrameIndex(clip, 0)).toBe(0);
    expect(clipFrameIndex(clip, 9)).toBe(0);
    expect(clipFrameIndex(clip, 10)).toBe(1);
    expect(clipFrameIndex(clip, 39)).toBe(3);
  });

  it('loops, or holds the last frame when not looping', () => {
    expect(clipFrameIndex(clip, 40)).toBe(0);
    expect(clipFrameIndex({ ...clip, loop: false }, 40)).toBe(3);
    expect(clipFrameIndex({ ...clip, loop: false }, 4000)).toBe(3);
  });
});

describe('playerClips', () => {
  const clips = playerClips(atlas);

  it('uses the atlas animations directly where they exist', () => {
    expect(clips.idle.frames).toEqual(frames('i', 10));
    expect(clips.run.fps).toBe(14);
    expect(clips.hurt.loop).toBe(false);
  });

  it('borrows jump frames for the poses the sheet has no clip for', () => {
    expect(clips.jump.frames).toEqual(frames('j', 9).slice(0, 5));
    expect(clips.fall.frames).toEqual(['j5', 'j6', 'j7']);
    expect(clips.wallslide.frames).toEqual(['j6']);
    expect(clips.crouch.frames).toEqual(['j0']);
    expect(clips.dash.frames).toEqual(['r3']);
    expect(clips.dead.frames).toEqual(['h1']);
  });

  it('fails at load, not at draw time, when the atlas lacks an animation the clips need', () => {
    const sparse: AtlasJson = { ...atlas, animations: { idle: atlas.animations.idle! } };
    expect(() => playerClips(sparse)).toThrow(/atlas has no "jump" animation/);
  });
});

describe('clipForPose', () => {
  it('swaps in the shooting variants only where the sheet has them', () => {
    expect(clipForPose('idle', false)).toBe('idle');
    expect(clipForPose('idle', true)).toBe('shoot');
    expect(clipForPose('run', true)).toBe('shoot_run');
    expect(clipForPose('crouch', true)).toBe('shoot');
    expect(clipForPose('jump', true)).toBe('jump');
    expect(clipForPose('hurt', true)).toBe('hurt');
  });
});

describe('PlayerAnimator', () => {
  it('restarts the clock when the clip changes and keeps it while the clip repeats', () => {
    const a = new PlayerAnimator(playerClips(atlas));
    expect(a.frameAt('idle', false, 1000)).toBe('i0');
    expect(a.frameAt('idle', false, 1020)).toBe('i1'); // 6 fps: a frame every 20 ticks
    expect(a.frameAt('run', false, 1030)).toBe('r0'); // new clip starts at its first frame
    expect(a.frameAt('run', false, 1030 + 17)).toBe('r1'); // 14 fps: 8.57 ticks per frame
    expect(a.frameAt('run', false, 1030 + 26)).toBe('r3'); // still counting from the clip start
  });

  it('is a pure function of the tick sequence, so a replay shows the same frames', () => {
    const play = (): string[] => {
      const a = new PlayerAnimator(playerClips(atlas));
      const out: string[] = [];
      for (let t = 0; t < 200; t++) out.push(a.frameAt(t < 60 ? 'run' : t < 130 ? 'jump' : 'fall', t > 20 && t < 50, t));
      return out;
    };
    expect(play()).toEqual(play());
    const seq = play();
    expect(seq[0]).toBe('r0');
    expect(seq[30]!.startsWith('sr')).toBe(true);
    expect(seq[129]).toBe('j4'); // the non-looping jump clip holds its apex frame
    expect(seq[199]).toBe('j7'); // and the fall clip holds its last frame
  });
});
