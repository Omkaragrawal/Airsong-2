export type ListenerType<T> = (value: T) => void;

/** A tiny observable value. Subscribers are called immediately with the current value. */
export type StoreType<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: ListenerType<T>) => () => void;
};

export function createStore<T>(initial: T): StoreType<T> {
  let value = initial;
  const listeners = new Set<ListenerType<T>>();

  const get = (): T => value;

  const set = (next: T): void => {
    value = next;
    for (const listener of listeners) {
      listener(value);
    }
  };

  const subscribe = (listener: ListenerType<T>): (() => void) => {
    listeners.add(listener);
    listener(value);
    return (): void => {
      listeners.delete(listener);
    };
  };

  return { get, set, subscribe };
}
