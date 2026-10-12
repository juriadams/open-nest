type Listener = (...args: unknown[]) => void;

type TrackedListener = Listener & { original?: Listener };

export class Emitter {
  private listeners = new Map<string, Set<TrackedListener>>();

  on(event: string, fn: Listener): this {
    let set = this.listeners.get(event);

    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    set.add(fn);

    return this;
  }

  once(event: string, fn: Listener): this {
    const wrapped: TrackedListener = (...args) => {
      this.removeListener(event, fn);
      fn(...args);
    };

    wrapped.original = fn;

    return this.on(event, wrapped);
  }

  removeListener(event: string, fn: Listener): this {
    const set = this.listeners.get(event);

    if (!set) return this;

    for (const listener of set) {
      if (listener === fn || listener.original === fn) set.delete(listener);
    }

    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);

    if (!set) return;

    for (const fn of Array.from(set)) fn(...args);
  }
}
