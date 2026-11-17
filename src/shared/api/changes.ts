import type { Database } from "../../../shared/models";
import { entities, primaryKey, type Row } from "../../../shared/schema";

export type Changes = Record<string, { upsert: Row[]; remove: string[] }>;
export function applyChanges(snapshot: Database, changes: Changes): Database {
  const next = { ...snapshot };
  for (const name of entities) {
    const change = changes[name];
    if (!change) continue;
    const rows = new Map((snapshot[name] as Row[]).map((row) => [primaryKey(name, row), row]));
    for (const key of change.remove) rows.delete(key);
    for (const row of change.upsert) rows.set(primaryKey(name, row), row);
    Object.assign(next, { [name]: [...rows.values()] });
  }
  return next;
}
