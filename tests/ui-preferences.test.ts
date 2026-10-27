import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_ENTRY_PREFERENCE,
  readOrderEntryPreference,
  readUiPreferences,
  setAlternativeOrderEntry,
} from "../src/ui-preferences";

test("La preferencia es local, está desactivada por defecto y conserva la sesión si falla la escritura", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const stored = new Map<string, string>();
  let blocked = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (blocked) throw new Error("Storage blocked");
        stored.set(key, value);
      },
    },
  });
  try {
    assert.equal(readOrderEntryPreference(), false);
    assert.deepEqual(readUiPreferences(), {
      alternativeOrderEntry: false,
      persistent: true,
    });
    setAlternativeOrderEntry(true);
    assert.equal(stored.get(ORDER_ENTRY_PREFERENCE), "true");
    assert.equal(readOrderEntryPreference(), true);
    setAlternativeOrderEntry(false);
    blocked = true;
    setAlternativeOrderEntry(true);
    assert.equal(stored.get(ORDER_ENTRY_PREFERENCE), "false");
    assert.deepEqual(readUiPreferences(), {
      alternativeOrderEntry: true,
      persistent: false,
    });
    assert.equal(readOrderEntryPreference(), true);
    setAlternativeOrderEntry(false);
    assert.equal(readOrderEntryPreference(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
