import test from "node:test";
import assert from "node:assert/strict";
import { cachedOrderRead } from "../src/order-read-cache";
test("Los índices se reutilizan al navegar y se invalidan al recibir otro snapshot", () => {
  const snapshot = {},
    replacement = {};
  let builds = 0;
  const create = () => ({ revision: ++builds });
  const first = cachedOrderRead(snapshot, "products", create);
  assert.equal(cachedOrderRead(snapshot, "products", create), first);
  assert.notEqual(cachedOrderRead(snapshot, "materials", create), first);
  assert.notEqual(cachedOrderRead(replacement, "products", create), first);
  assert.equal(builds, 3);
});
