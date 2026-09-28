/**
 * Memoizes an async load per key: every caller of a key shares one in-flight or settled
 * load. A load that fails is forgotten, so the next call tries again (a network blip must
 * not leave a chapter unloadable until reload).
 */
export function onceUntilFailure<K, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const loads = new Map<K, Promise<V>>();
  return (key) => {
    let pending = loads.get(key);
    if (!pending) {
      pending = load(key);
      loads.set(key, pending);
      pending.catch(() => loads.delete(key));
    }
    return pending;
  };
}
