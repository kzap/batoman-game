import { describe, expect, it } from 'vitest';
import { LOCKSTEP_INTERACTIVE_TICKS, LOCKSTEP_REPLAY_TICKS, lockstepFromQuery } from '@app/app';

describe('lockstepFromQuery', () => {
  it('leaves the production clock alone unless a lockstep flag is set', () => {
    expect(lockstepFromQuery('')).toBeNull();
    expect(lockstepFromQuery('?level=level-1')).toBeNull();
    expect(lockstepFromQuery('?post=0')).toBeNull();
    expect(lockstepFromQuery('?dof=1')).toBeNull();
    expect(lockstepFromQuery('?edit=1&level=level-3')).toBeNull();
  });

  it('defaults both budgets for ?lockstep=1', () => {
    expect(lockstepFromQuery('?lockstep=1')).toEqual({
      interactive: LOCKSTEP_INTERACTIVE_TICKS,
      replay: LOCKSTEP_REPLAY_TICKS,
    });
  });

  it('honours ticksPerFrame and replayTicks, including a manual zero', () => {
    expect(lockstepFromQuery('?ticksPerFrame=0')).toEqual({ interactive: 0, replay: LOCKSTEP_REPLAY_TICKS });
    expect(lockstepFromQuery('?lockstep=1&ticksPerFrame=8&replayTicks=60')).toEqual({ interactive: 8, replay: 60 });
    expect(lockstepFromQuery('?replayTicks=240')).toEqual({ interactive: LOCKSTEP_INTERACTIVE_TICKS, replay: 240 });
  });

  it('falls back when a count is not a non-negative integer in range', () => {
    expect(lockstepFromQuery('?lockstep=1&ticksPerFrame=nope&replayTicks=-3')).toEqual({
      interactive: LOCKSTEP_INTERACTIVE_TICKS,
      replay: LOCKSTEP_REPLAY_TICKS,
    });
    expect(lockstepFromQuery('?lockstep=1&ticksPerFrame=1.5&replayTicks=10001')).toEqual({
      interactive: LOCKSTEP_INTERACTIVE_TICKS,
      replay: LOCKSTEP_REPLAY_TICKS,
    });
  });
});
