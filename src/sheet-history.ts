type Entry<T> = { before: T; after: T };
export type SheetHistoryDirection = "undo" | "redo";
type CheckReplay<T> = (next: T, current: T) => void;

/** Values are immutable draft snapshots. A grouped edit publishes one snapshot. */
export function createSheetHistory<T>(
  initial: T,
  equal: (left: T, right: T) => boolean,
) {
  const pasado: Entry<T>[] = [];
  const futuro: Entry<T>[] = [];
  const listeners = new Set<() => void>();
  let snapshot = { value: initial, canUndo: false, canRedo: false };

  const publish = (value: T) => {
    snapshot = {
      value,
      canUndo: pasado.length > 0,
      canRedo: futuro.length > 0,
    };
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    record(next: T) {
      if (equal(snapshot.value, next)) return false;
      pasado.push({ before: snapshot.value, after: next });
      futuro.length = 0;
      publish(next);
      return true;
    },
    move(direction: SheetHistoryDirection, check?: CheckReplay<T>) {
      const undo = direction === "undo";
      const from = undo ? pasado : futuro;
      const to = undo ? futuro : pasado;
      const entry = from.at(-1);
      if (!entry) return false;
      const next = undo ? entry.before : entry.after;
      // Check the entire transition before publishing any change or moving the entry.
      check?.(next, snapshot.value);
      to.push(entry);
      from.pop();
      publish(next);
      return true;
    },
    reset(value: T) {
      pasado.length = 0;
      futuro.length = 0;
      publish(value);
    },
  };
}
