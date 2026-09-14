import type { AtlasJson } from '@content/atlas';
import { SIM_HZ } from '@core/sim/clock';
import type { EnemyPose } from '@game/enemies';
import type { PlayerPose } from '@game/player';
import type { EnemyLook } from './assets';

/** A rush plays the walk clip this much faster. */
const RUSH_FPS_FACTOR = 1.6;

/**
 * Picks the atlas frame for a character each frame from the sim snapshot's
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

/** Clip lookups on one atlas; a missing clip is a packaging bug, so it fails at load, not at draw. */
function clipSource(atlas: AtlasJson, label: string) {
  const anim = (name: string): Clip => {
    const c = atlas.animations[name];
    if (!c) throw new Error(`${label} atlas has no "${name}" animation`);
    return c;
  };
  const slice = (name: string, from: number, to?: number, over: Partial<Clip> = {}): Clip => {
    const c = anim(name);
    const frames = c.frames.slice(from, to);
    return { frames: frames.length ? frames : c.frames, fps: c.fps, loop: c.loop, ...over };
  };
  return { anim, slice };
}

/** Plays named clips; changing clip restarts the timer, repeating the same clip does not. */
export class ClipAnimator<N extends string> {
  private clipName: N;
  private startTick = 0;

  constructor(
    private readonly clips: Readonly<Record<N, Clip>>,
    initial: N,
  ) {
    this.clipName = initial;
  }

  frameAt(name: N, tick: number): string {
    if (name !== this.clipName) {
      this.clipName = name;
      this.startTick = tick;
    }
    const clip = this.clips[name];
    return clip.frames[clipFrameIndex(clip, tick - this.startTick)]!;
  }
}

export type PlayerClipName = PlayerPose | 'shoot' | 'shoot_run';

/**
 * Map every pose to a clip using what the batoman atlas offers. The sheet has
 * no dedicated crouch, wallslide, or fall clips, so they borrow the jump
 * clip's anticipation, mid-air, and descending frames.
 */
export function playerClips(atlas: AtlasJson): Record<PlayerClipName, Clip> {
  const { anim, slice } = clipSource(atlas, 'batoman');
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
  private readonly clips: ClipAnimator<PlayerClipName>;

  constructor(clips: Record<PlayerClipName, Clip>) {
    this.clips = new ClipAnimator<PlayerClipName>(clips, 'idle');
  }

  frameAt(pose: PlayerPose, shooting: boolean, tick: number): string {
    return this.clips.frameAt(clipForPose(pose, shooting), tick);
  }
}

/**
 * Enemy poses to clips for one look. The idle/move/shoot clip names come from
 * the look (the drone sheet calls its idle "hover"); the boss-only poses
 * borrow: a wind-up holds the first hurt frame, a rush is the walk sped up, a
 * stun holds the second hurt frame, a phase shift and the cloak hold the first
 * idle frame. Death clips never loop so the last frame holds until the sim
 * drops the enemy.
 */
export function enemyClips(atlas: AtlasJson, look: EnemyLook): Record<EnemyPose, Clip> {
  const { anim, slice } = clipSource(atlas, look.atlas);
  const move = anim(look.clips.move);
  const still = slice(look.clips.idle, 0, 1);
  return {
    idle: anim(look.clips.idle),
    move,
    shoot: anim(look.clips.shoot),
    hurt: anim('hurt'),
    death: { ...anim('death'), loop: false },
    cloaked: still,
    windup: slice('hurt', 0, 1, { loop: false }),
    rush: { ...move, fps: move.fps * RUSH_FPS_FACTOR },
    stunned: slice('hurt', 1, 2, { loop: false }),
    shift: still,
  };
}
