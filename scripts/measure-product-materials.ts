import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { chromium, type Page } from "playwright-core";
import { makeOrderPerformanceFixture } from "../tests/fixtures/order-performance";

const phase = process.argv[2];
assert.ok(phase === "baseline" || phase === "after");
const root = resolve(
  process.env.ARIA_DIST ??
    (phase === "baseline"
      ? "tests/.tmp/product-materials-baseline/dist"
      : "dist"),
);
const evidence = "tests/evidence/product-materials";
await mkdir(evidence, { recursive: true });
const guard = process.env.ARIA_GUARD_FILE ?? "data/database.json";
const original = await readFile(guard);
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
let db = makeOrderPerformanceFixture(6000);
const app = express();
app.get("/api/state", (_request, response) => response.json(db));
app.use(express.static(root, { dotfiles: "allow" }));
app.get("/{*path}", (_request, response) =>
  response.sendFile(resolve(root, "index.html"), { dotfiles: "allow" }),
);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((ok) => server.once("listening", ok));
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const stats = (values: number[]) => ({
  samples: values,
  p95: [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1],
});
const cases = [];
async function measure(
  page: Page,
  event: string,
  condition: string,
  action: () => Promise<unknown>,
) {
  // Browser source is explicit: tsx's named-function helpers must not cross the page boundary.
  await page.evaluate(`(() => {
    const state = window.__materialPerf = { start: null, result: null };
    document.addEventListener(${JSON.stringify(event)}, () => state.start = performance.now(), { once: true, capture: true });
    const inspect = () => {
      if (state.start !== null && (${condition})) requestAnimationFrame(() => requestAnimationFrame(() => state.result = performance.now() - state.start));
      else requestAnimationFrame(inspect);
    }; requestAnimationFrame(inspect);
  })()`);
  await action();
  await page.waitForFunction(
    () => (window as any).__materialPerf.result !== null,
  );
  return page.evaluate<number>(() => (window as any).__materialPerf.result);
}
try {
  for (const [lots, width] of [
    [6000, 1440],
    [6000, 375],
    [60000, 1440],
  ]) {
    db = makeOrderPerformanceFixture(lots);
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(`(() => {
      const inspect = () => {
        if (document.querySelector(".data-table tbody tr"))
          requestAnimationFrame(() =>
            requestAnimationFrame(
              () => (window.__materialLoad = performance.now()),
            ),
          );
        else requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    })()`);
    const loads = [];
    for (let sample = 0; sample < 20; sample++) {
      await page.goto(origin + "/catalogos?tab=materiales_asociados");
      await page.waitForFunction(() => (window as any).__materialLoad > 0);
      loads.push(
        await page.evaluate<number>(() => (window as any).__materialLoad),
      );
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send("HeapProfiler.collectGarbage");
    const memoryBefore = await cdp.send("Runtime.getHeapUsage");
    const interactions: Record<string, number[]> = {};
    const run = async (
      name: string,
      ready: string,
      action: () => Promise<unknown>,
      event = "click",
    ) =>
      (interactions[name] ??= []).push(
        await measure(page, event, ready, action),
      );
    const search = page.getByRole(
      phase === "baseline" ? "textbox" : "searchbox",
      {
        name:
          phase === "baseline"
            ? "Buscar en Materiales por producto"
            : "Buscar productos y materiales",
        exact: true,
      },
    );
    const present =
      phase === "baseline" ? ".catalog-table tbody tr" : ".relation-group-row";
    for (let cycle = 0; cycle < 30; cycle++) {
      await run(
        "search",
        `document.querySelectorAll('${present}').length===0`,
        () => search.fill("sin-resultados-material-perf"),
        "input",
      );
      await run(
        "search-clear",
        `document.querySelectorAll('${present}').length>0`,
        () => search.fill(""),
        "input",
      );
      if (phase === "after")
        await run(
          "expand",
          "!!document.querySelector('.relation-disclosure[data-expanded=true]') && document.querySelector('.relation-disclosure').getAnimations().length===0",
          () =>
            page
              .getByRole("button", {
                name: "Mostrar materiales de Crema corporal · 250 ml",
                exact: true,
              })
              .click(),
        );
      const row = page
        .locator(
          phase === "baseline"
            ? ".catalog-table tbody tr"
            : ".relation-group-row",
        )
        .filter({ hasText: "Crema corporal · 250 ml" })
        .first();
      await row.hover();
      await run(
        "editor-open",
        "!!document.querySelector('[role=dialog]')",
        () => row.getByRole("button", { name: /^Editar/ }).click(),
      );
      await run(
        "editor-close",
        "!document.querySelector('[role=dialog]')",
        () =>
          page
            .getByRole("dialog")
            .getByRole("button", { name: "Cancelar", exact: true })
            .click(),
      );
      if (phase === "after")
        await run(
          "collapse",
          "!document.querySelector('.product-material-history')",
          () =>
            page
              .getByRole("button", {
                name: "Ocultar materiales de Crema corporal · 250 ml",
                exact: true,
              })
              .click(),
        );
    }
    await cdp.send("HeapProfiler.collectGarbage");
    const memoryAfter = await cdp.send("Runtime.getHeapUsage");
    assert.deepEqual(errors, []);
    cases.push({
      lots,
      width,
      fixtureHash: hash(JSON.stringify(db)),
      load: stats(loads),
      interactions: Object.fromEntries(
        Object.entries(interactions).map(([key, values]) => [
          key,
          stats(values),
        ]),
      ),
      memoryBefore,
      memoryAfter,
    });
    await context.close();
    console.log(`${phase}: materiales ${lots} lotes / ${width}px`);
  }
  assert.equal(hash(await readFile(guard)), hash(original));
  await writeFile(
    `${evidence}/${phase}-material-components.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        phase,
        cases,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await new Promise<void>((ok) => server.close(() => ok()));
}
