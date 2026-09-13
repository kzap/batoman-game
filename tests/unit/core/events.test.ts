import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@core/sim/events';

interface Events extends Record<string, unknown> {
  hit: { amount: number };
  died: undefined;
}

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    bus.on('hit', fn);
    bus.emit('hit', { amount: 3 });
    expect(fn).toHaveBeenCalledWith({ amount: 3 });
  });

  it('unsubscribes via returned disposer and off()', () => {
    const bus = new EventBus<Events>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on('hit', a);
    bus.on('hit', b);
    offA();
    bus.off('hit', b);
    bus.emit('hit', { amount: 1 });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('once() fires a single time', () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    bus.once('died', fn);
    bus.emit('died', undefined);
    bus.emit('died', undefined);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('tolerates listeners that unsubscribe during emit', () => {
    const bus = new EventBus<Events>();
    const second = vi.fn();
    const off = bus.on('hit', () => off());
    bus.on('hit', second);
    expect(() => bus.emit('hit', { amount: 1 })).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
