import { useSyncExternalStore } from "react";
export const PRODUCT_SHEET_PREFERENCE = "gimed:ui:product-order-sheet";
export const PRODUCT_SHEET_DRAFT = "gimed:draft:product-order-sheet:v1";
export const productSheetDraftKey = (userId: string) => `${PRODUCT_SHEET_DRAFT}:${userId}`;

export function migrateLegacyProductSheetDraft(userId: string) {
  try {
    const draft = localStorage.getItem(PRODUCT_SHEET_DRAFT);
    const destination = productSheetDraftKey(userId);
    if (draft && !localStorage.getItem(destination)) {
      localStorage.setItem(destination, draft);
      localStorage.removeItem(PRODUCT_SHEET_DRAFT);
    }
  } catch {
    // A blocked storage write leaves the legacy draft available for recovery.
  }
}
type Preference = { enabled: boolean; persistent: boolean };
let snapshot: Preference | undefined;
const listeners = new Set<() => void>();
function read(): Preference {
  if (!snapshot) {
    try {
      snapshot = {
        enabled: localStorage.getItem(PRODUCT_SHEET_PREFERENCE) === "true",
        persistent: true,
      };
    } catch {
      snapshot = { enabled: false, persistent: false };
    }
  }
  return snapshot;
}
export function setProductSheetPreference(enabled: boolean) {
  let persistent = true;
  try {
    localStorage.setItem(PRODUCT_SHEET_PREFERENCE, String(enabled));
  } catch {
    persistent = false;
  }
  snapshot = { enabled, persistent };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const refresh = (event: StorageEvent) => {
    if (event.key === PRODUCT_SHEET_PREFERENCE || event.key === null) {
      snapshot = undefined;
      listeners.forEach((current) => current());
    }
  };
  window.addEventListener("storage", refresh);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", refresh);
  };
}
export function useProductSheetPreference() {
  return useSyncExternalStore(subscribe, read, read);
}
export function readSheetLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
