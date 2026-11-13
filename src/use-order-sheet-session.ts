import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SheetScrollPosition } from "./components/product-sheet-grid";
import { readSheetLocal } from "./product-sheet-preferences";

type Draft<T> = { version: 1; timestamp: string; changes: T[] };
export function useOrderSheetDraftStorage<T>(
  key: string,
  changes: T[],
  valid: (draft: unknown) => draft is Draft<T>,
) {
  const [touched, setTouched] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [recovery, setRecovery] = useState<Draft<T> | null>(() => {
    const saved = readSheetLocal<unknown>(key, null);
    return valid(saved) && saved.changes.length ? saved : null;
  });
  useEffect(() => {
    if (!touched) return;
    try {
      if (changes.length)
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            timestamp: new Date().toISOString(),
            changes,
          }),
        );
      else localStorage.removeItem(key);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [touched, changes, key]);
  return { recovery, setRecovery, storageError, setStorageError, setTouched };
}

const scrollHistory = new Map<string, SheetScrollPosition>();
export function useOrderSheetScroll(
  group: string,
  user: string,
  key: string,
  view: string,
) {
  const scrollKey = useMemo(() => {
    const params = new URLSearchParams(key);
    if (view === "seguimiento") params.delete("vista");
    params.delete("pagina");
    params.sort();
    return JSON.stringify([group, user, params.toString()]);
  }, [group, user, key, view]);
  const section = useRef<HTMLElement>(null);
  const viewport = useCallback(
    () =>
      section.current?.querySelector<HTMLElement>(".product-sheet-viewport"),
    [],
  );
  const latestKey = useRef(scrollKey);
  const [initialScroll] = useState(() => scrollHistory.get(scrollKey));
  useLayoutEffect(() => {
    latestKey.current = scrollKey;
  }, [scrollKey]);
  useLayoutEffect(() => {
    const element = viewport();
    if (!element) return;
    return () => {
      const key = latestKey.current;
      scrollHistory.delete(key);
      scrollHistory.set(key, {
        top: element.scrollTop,
        left: element.scrollLeft,
      });
      if (scrollHistory.size > 20) {
        const oldest = scrollHistory.keys().next().value;
        if (oldest !== undefined) scrollHistory.delete(oldest);
      }
    };
  }, [viewport]);
  return { section, viewport, initialScroll };
}
