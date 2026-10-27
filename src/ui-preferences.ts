import { useSyncExternalStore } from "react";

export const ORDER_ENTRY_PREFERENCE = "gimed:ui:alternative-order-entry";
type Preferences = { alternativeOrderEntry: boolean; persistent: boolean };
let snapshot: Preferences | undefined;
const listeners = new Set<() => void>();

export function readUiPreferences(): Preferences {
  if (!snapshot) {
    try {
      snapshot = {
        alternativeOrderEntry:
          localStorage.getItem(ORDER_ENTRY_PREFERENCE) === "true",
        persistent: true,
      };
    } catch {
      snapshot = { alternativeOrderEntry: false, persistent: false };
    }
  }
  return snapshot;
}

export function setAlternativeOrderEntry(enabled: boolean) {
  let persistent = true;
  try {
    localStorage.setItem(ORDER_ENTRY_PREFERENCE, String(enabled));
  } catch {
    persistent = false;
  }
  snapshot = { alternativeOrderEntry: enabled, persistent };
  listeners.forEach((listener) => listener());
}

export function readOrderEntryPreference(): boolean {
  if (snapshot?.persistent === false) return snapshot.alternativeOrderEntry;
  try {
    return localStorage.getItem(ORDER_ENTRY_PREFERENCE) === "true";
  } catch {
    return readUiPreferences().alternativeOrderEntry;
  }
}

function subscribe(listener: () => void) {
  if (snapshot?.persistent) snapshot = undefined;
  listeners.add(listener);
  const refresh = (event: StorageEvent) => {
    if (event.key !== ORDER_ENTRY_PREFERENCE && event.key !== null) return;
    snapshot = undefined;
    listeners.forEach((current) => current());
  };
  window.addEventListener("storage", refresh);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", refresh);
  };
}

export function useUiPreferences() {
  return useSyncExternalStore(subscribe, readUiPreferences, readUiPreferences);
}
