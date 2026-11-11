import { useState, useSyncExternalStore } from "react";
import { createSheetHistory } from "./sheet-history";

export function useSheetHistory<T>(
  initial: T,
  equal: (left: T, right: T) => boolean,
) {
  const [history] = useState(() => createSheetHistory(initial, equal));
  const snapshot = useSyncExternalStore(history.subscribe, history.getSnapshot);
  return { history, ...snapshot };
}
