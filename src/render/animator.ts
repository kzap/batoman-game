import type { AtlasJson } from '@content/atlas';
import { SIM_HZ } from '@core/sim/clock';
import type { PlayerPose } from '@game/player';

/**
 * Picks the atlas frame for the player each frame from the sim snapshot's
 * pose, facing-independent. Time comes from the sim tick, so a replay shows
 * the same frames as the original run; the only state kept here is which
 * clip is playing and the tick it started on.
 */

export interface Clip {
  readonly frames: readonly string[];
  readonly fps: number;
  readonly loop: boolean;
}

/** Frame index `ticks` after a clip started; a finished non-looping clip holds its last frame. */
export function clipFrameIndex(clip: Clip, ticks: number): number {
  const i = Math.floor((Math.max(0, ticks) * clip.fps) / SIM_HZ);
  return clip.loop ? i % clip.frames.length : Math.min(i, clip.frames.length - 1);
}

export type PlayerClipName = PlayerPose | 'shoot' | 'shoot_run';

/**
 * Map every pose to a clip using what the batoman atlas offers. The sheet has
 * no dedicated crouch, wallslide, or fall clips, so they borrow the jump
 * clip's anticipation, mid-air, and descending frames.
 */
export function playerClips(atlas: AtlasJson): Record<PlayerClipName, Clip> {
  const a = atlas.animations;
  // The atlas is validated at build time, so a missing clip is a packaging bug: fail at load, not at draw.
  const anim = (name: string): Clip => {
    const c = a[name];
    if (!c) throw new Error(`batoman atlas has no "${name}" animation`);
    return c;
  };
  const slice = (name: string, from: number, to?: number, over: Partial<Clip> = {}): Clip => {
    const c = anim(name);
    const frames = c.frames.slice(from, to);
    return { frames: frames.length ? frames : c.frames, fps: c.fps, loop: c.loop, ...over };
  };
  const jump = anim('jump');
  return {
    idle: anim('idle'),
    run: anim('run'),
    shoot: anim('shoot'),
    shoot_run: anim('shoot_run'),
    hurt: anim('hurt'),
    dead: slice('hurt', 1, 2, { loop: false }),
    jump: slice('jump', 0, 5, { loop: false, fps: jump.fps * 1.5 }),
    fall: slice('jump', 5, 8, { loop: false }),
    wallslide: slice('jump', 6, 7, { loop: false }),
    crouch: slice('jump', 0, 1, { loop: false }),
    slide: slice('jump', 0, 1, { loop: false }),
    dash: slice('run', 3, 4, { loop: false }),
  };
}

/** Which clip a pose shows; shooting swaps idle/run for the arm-out variants. */
export function clipForPose(pose: PlayerPose, shooting: boolean): PlayerClipName {
  if (!shooting) return pose;
  if (pose === 'idle' || pose === 'crouch') return 'shoot';
  if (pose === 'run') return 'shoot_run';
  return pose;
}

export class PlayerAnimator {
  private clipName: PlayerClipName = 'idle';
  private startTick = 0;

  constructor(private readonly clips: Record<PlayerClipName, Clip>) {}

  /** Frame name for this tick. Changing clip restarts the timer; repeating the same clip does not. */
  frameAt(pose: PlayerPose, shooting: boolean, tick: number): string {
    const name = clipForPose(pose, shooting);
    if (name !== this.clipName) {
      this.clipName = name;
      this.startTick = tick;
    }
    const clip = this.clips[name];
    return clip.frames[clipFrameIndex(clip, tick - this.startTick)]!;
  }
}
