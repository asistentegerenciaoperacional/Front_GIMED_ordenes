import type { Database } from "../shared/models";

/** Canonicalize equal string values in a freshly parsed, privately owned snapshot.
 * This changes storage references only: IDs, dates, decimals and JSON stay exact.
 * The temporary pool is released before React receives the snapshot.
 */
export function shareSnapshotStrings(snapshot: Database): Database {
  const strings = new Map<string, string>();
  for (const rows of Object.values(snapshot)) {
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const value: unknown = Reflect.get(row, key);
        if (key === "id" || typeof value !== "string") continue;
        const shared = strings.get(value);
        if (shared === undefined) strings.set(value, value);
        else Reflect.set(row, key, shared);
      }
    }
  }
  return snapshot;
}
