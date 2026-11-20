import { describe, expect, it } from 'vitest';
import { LOCKSTEP_INTERACTIVE_TICKS, LOCKSTEP_REPLAY_TICKS, lockstepFromQuery } from '@app/lockstep';

describe('lockstepFromQuery', () => {
  it('leaves the production clock alone unless lockstep=1', () => {
    expect(lockstepFromQuery('')).toBeNull();
    expect(lockstepFromQuery('?level=level-1')).toBeNull();
    expect(lockstepFromQuery('?post=0')).toBeNull();
    expect(lockstepFromQuery('?dof=1')).toBeNull();
    expect(lockstepFromQuery('?edit=1&level=level-3')).toBeNull();
    expect(lockstepFromQuery('?ticksPerFrame=0')).toBeNull();
    expect(lockstepFromQuery('?replayTicks=0')).toBeNull();
    expect(lockstepFromQuery('?replayTicks=240')).toBeNull();
    expect(lockstepFromQuery('?lockstep=yes')).toBeNull();
  });

  it('defaults both budgets for ?lockstep=1', () => {
    expect(lockstepFromQuery('?lockstep=1')).toEqual({
      interactive: LOCKSTEP_INTERACTIVE_TICKS,
      replay: LOCKSTEP_REPLAY_TICKS,
    });
  });

  it('honours ticksPerFrame and replayTicks only alongside lockstep=1', () => {
    expect(lockstepFromQuery('?lockstep=1&ticksPerFrame=0')).toEqual({ interactive: 0, replay: LOCKSTEP_REPLAY_TICKS });
    expect(lockstepFromQuery('?lockstep=1&ticksPerFrame=8&replayTicks=60')).toEqual({ interactive: 8, replay: 60 });
  });

  it('rejects a present but invalid count instead of substituting the default', () => {
    expect(lockstepFromQuery('?lockstep=1&ticksPerFrame=nope')).toBeNull();
    expect(lockstepFromQuery('?lockstep=1&replayTicks=-3')).toBeNull();
    expect(lockstepFromQuery('?lockstep=1&ticksPerFrame=1.5')).toBeNull();
    expect(lockstepFromQuery('?lockstep=1&replayTicks=10001')).toBeNull();
    expect(lockstepFromQuery('?lockstep=1&ticksPerFrame=')).toBeNull();
  });
});
