// API snapshots are immutable. Weak keys release their indexes after a refresh.
const snapshots = new WeakMap<object, Map<string, unknown>>();
export function cachedOrderRead<T>(
  snapshot: object,
  key: string,
  create: () => T,
): T {
  let values = snapshots.get(snapshot);
  if (!values) {
    values = new Map();
    snapshots.set(snapshot, values);
  }
  if (!values.has(key)) values.set(key, create());
  return values.get(key) as T;
}
