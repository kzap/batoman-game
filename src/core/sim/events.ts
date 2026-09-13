type Listener<T> = (payload: T) => void;

/**
 * Minimal typed event bus. `E` maps event names to payload types.
 * Used by the sim to announce state changes (damage, death, checkpoint) without
 * knowing who listens - the renderer, HUD, and audio subscribe independently.
 */
export class EventBus<E extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof E, Set<Listener<never>>>();

  on<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(event, fn);
  }

  once<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    const off = this.on(event, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof E>(event: K, fn: Listener<E[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy so listeners that unsubscribe during emit don't break iteration.
    for (const fn of [...set]) (fn as Listener<E[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
