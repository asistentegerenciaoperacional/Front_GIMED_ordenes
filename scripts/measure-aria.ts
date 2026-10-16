import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import express from "express";
import { chromium, type Page } from "playwright-core";
import { makeOrderPerformanceFixture } from "../tests/fixtures/order-performance";

const phase = process.argv[2] ?? "after";
const quick = process.argv.includes("--quick");
const soak = process.argv.includes("--soak");
const soakCycles = Number(
  process.argv.find((arg) => arg.startsWith("--cycles="))?.split("=")[1] ?? 300,
);
assert.ok(Number.isInteger(soakCycles) && soakCycles > 0 && soakCycles <= 1000);
const scenario = process.argv
  .find((arg) => arg.startsWith("--scenario="))
  ?.split("=")[1];
const profiling = process.env.ARIA_PROFILE === "1";
const reportName =
  phase +
  (scenario ? "-" + scenario : "") +
  (quick ? "-quick" : "") +
  (soak ? "-soak" : "") +
  "-performance.json";
assert.ok(["baseline", "after"].includes(phase));
const root = resolve(
  process.env.ARIA_DIST ??
    (phase === "baseline" ? "tests/.tmp/aria-baseline/dist" : "dist"),
);
const evidence = resolve("tests/evidence/aria");
await mkdir(evidence, { recursive: true });
const original = await readFile("data/database.json");
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
let db = makeOrderPerformanceFixture(6000);
const api = express();
api.get("/api/state", (_req, res) => res.json(db));
api.use(express.static(root, { dotfiles: "allow" }));
api.get("/{*path}", (_req, res) =>
  res.sendFile(resolve(root, "index.html"), { dotfiles: "allow" }),
);
const server = api.listen(0, "127.0.0.1");
await new Promise<void>((ok) => server.once("listening", ok));
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = "http://127.0.0.1:" + address.port;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};
async function arm(page: Page, condition: string, event = "click") {
  await page.evaluate(
    "(() => { const p = window.__ariaPerf = {start:null,result:null}; const listener = () => { if(p.start === null) p.start = performance.now(); }; document.addEventListener(" +
      JSON.stringify(event) +
      ", listener, {capture:true,once:true}); const inspect = () => { if(p.start !== null && (" +
      condition +
      ")) { requestAnimationFrame(() => requestAnimationFrame(() => {p.result=performance.now()-p.start;})); } else requestAnimationFrame(inspect); }; requestAnimationFrame(inspect); })()",
  );
}
async function finish(page: Page) {
  await page.waitForFunction(
    "window.__ariaPerf?.result !== null && window.__ariaPerf?.result !== undefined",
  );
  return page.evaluate<number>("window.__ariaPerf.result");
}
async function closeDialog(page: Page) {
  await page
    .locator(".dialog .dialog-footer")
    .last()
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  const discard = page.getByRole("button", {
    name: "Descartar cambios",
    exact: true,
  });
  if (await discard.count()) await discard.click();
}
const cases: Record<string, unknown>[] = [];
try {
  for (const [lots, width, height, throttle] of (scenario === "stress"
    ? [[6000, 375, 812, 4]]
    : [
        [6000, 1440, 1000, 1],
        [6000, 375, 812, 1],
        [60000, 1440, 1000, 1],
      ]
  ).filter((_, index) =>
    scenario && scenario !== "stress"
      ? index === ["desktop", "mobile", "large"].indexOf(scenario)
      : !quick || index === 0,
  )) {
    db = makeOrderPerformanceFixture(lots);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.addInitScript(
      `window.__ariaLongTasks=[];new PerformanceObserver(list=>window.__ariaLongTasks.push(...list.getEntries().map(entry=>entry.duration))).observe({type:'longtask',buffered:true});`,
    );
    await page.addInitScript(`{
      const inspect=()=>{
        const table=document.querySelector('.orders-table');
        const count=document.querySelectorAll('.orders-table .order-link').length;
        if(table && (table.getAttribute('aria-rowcount')==='51'?count>0:count===50)){
          requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__ariaLoadResult=performance.now();}));
        }else requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    }`);
    page.setDefaultTimeout(15000);
    page.on("dialog", (dialog) => dialog.accept());
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    const loads: number[] = [];
    let initialResources: unknown[] = [];
    for (let i = 0; i < (quick ? 5 : 20); i++) {
      await page.goto(origin + "/ordenes/productos");
      await page.waitForFunction("window.__ariaLoadResult>0");
      loads.push(await page.evaluate("window.__ariaLoadResult"));
      if (i === 0)
        initialResources = await page.evaluate(
          "performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).map(r=>({url:r.name,bytes:r.encodedBodySize}))",
        );
    }
    const metrics: Record<string, number[]> = {};
    const filterTrigger = page.getByRole("button", {
      name: "Filtrar y ordenar Total",
      exact: true,
    });
    const openFilter = async () => {
      await filterTrigger.scrollIntoViewIfNeeded();
      await page.evaluate(
        "new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))",
      );
      await measure(
        "filter-open",
        "Array.from(document.querySelectorAll('.column-filter-panel')).some(p=>p.getClientRects().length)",
        () => filterTrigger.click(),
      );
    };
    const measure = async (
      name: string,
      ready: string,
      action: () => Promise<unknown>,
      event = "click",
    ) => {
      await arm(page, ready, event);
      await action();
      (metrics[name] ??= []).push(await finish(page));
    };
    for (let i = 0; i < (quick ? 5 : 30); i++) {
      if (profiling && i === 3) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.start");
      }
      await measure(
        "search",
        "document.querySelectorAll('.orders-table .order-link').length === 0",
        () =>
          page
            .getByRole("textbox", { name: "Buscar órdenes", exact: true })
            .fill("sinresultadoszz"),
        "input",
      );
      await measure(
        "search-clear",
        "(document.querySelector('.orders-table')?.getAttribute('aria-rowcount') === '51' && document.querySelectorAll('.orders-table .order-link').length > 0 || document.querySelectorAll('.orders-table .order-link').length === 50)",
        () =>
          page
            .getByRole("textbox", { name: "Buscar órdenes", exact: true })
            .fill(""),
        "input",
      );
      await measure(
        "pagination",
        "document.body.textContent.includes('Página 2 de')",
        () =>
          page.getByRole("button", { name: "Siguiente", exact: true }).click(),
      );
      await page.getByRole("button", { name: "Anterior", exact: true }).click();
      await measure("dialog-open", "!!document.querySelector('.dialog')", () =>
        page.getByRole("button", { name: "Nueva orden", exact: true }).click(),
      );
      await measure("dialog-close", "!document.querySelector('.dialog')", () =>
        closeDialog(page),
      );
      await openFilter();
      await measure(
        "sort",
        "!Array.from(document.querySelectorAll('.column-filter-panel')).some(p=>p.getClientRects().length) && document.querySelector('.orders-table [aria-sort=\"" +
          (i % 2 ? "descending" : "ascending") +
          "\"]')!==null",
        () =>
          page
            .getByRole("button", {
              name: i % 2 ? "De mayor a menor" : "De menor a mayor",
              exact: true,
            })
            .click(),
      );
      await openFilter();
      await measure(
        "filter-close",
        "!Array.from(document.querySelectorAll('.column-filter-panel')).some(p=>p.getClientRects().length)",
        () =>
          page
            .getByRole("button", {
              name: "Cerrar filtros de Total",
              exact: true,
            })
            .click(),
      );
      if (profiling && i === 8) {
        const { profile } = await cdp.send("Profiler.stop");
        await writeFile(
          "tests/.tmp/aria-" + (scenario ?? lots + "-" + width) + ".cpuprofile",
          JSON.stringify(profile),
        );
      }
    }
    // A selection is measured from its commit event, not the automation overhead of opening the menu.
    for (let i = 0; i < (quick ? 5 : 30); i++) {
      const native = page.locator("select.custom-filter-select");
      if (await native.count()) {
        await native.focus();
        await native.press("Home");
        await measure(
          "selection-filter",
          "location.search.includes('filtro=documento_con')",
          () => native.press("ArrowDown"),
          "keydown",
        );
        await native.press("Home");
      } else {
        await page
          .getByRole("button", { name: "Filtro personalizado", exact: true })
          .click();
        await measure(
          "selection-filter",
          "location.search.includes('filtro=documento_con')",
          () =>
            page
              .getByRole("option", {
                name: "Con documento de la orden",
                exact: true,
              })
              .click(),
        );
        await page
          .getByRole("button", { name: "Filtro personalizado", exact: true })
          .click();
        await page
          .getByRole("option", {
            name: "Sin filtro personalizado",
            exact: true,
          })
          .click();
      }
    }
    for (let i = 0; i < (quick ? 5 : 20); i++) {
      await measure(
        "navigation-detail",
        "!!document.querySelector('.line-card')",
        () => page.locator(".order-link").first().click(),
      );
      await measure(
        "navigation-return",
        "!!document.querySelector('.orders-table')",
        () =>
          page
            .getByRole("link", { name: "Volver a órdenes", exact: true })
            .click(),
      );
    }
    const stabilize = async () => {
      await page.waitForTimeout(750);
      await cdp.send("HeapProfiler.collectGarbage");
      await page.evaluate(
        "new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))",
      );
      await cdp.send("HeapProfiler.collectGarbage");
    };
    await stabilize();
    const memoryBefore = await cdp.send("Runtime.getHeapUsage");
    const memoryCycleSamples = [{ cycles: 0, usedSize: memoryBefore.usedSize }];
    for (let i = 0; i < (soak ? soakCycles : quick ? 10 : 50); i++) {
      await page
        .getByRole("button", { name: "Nueva orden", exact: true })
        .click();
      await closeDialog(page);
      if ((i + 1) % 10 === 0) {
        await stabilize();
        memoryCycleSamples.push({
          cycles: i + 1,
          usedSize: (await cdp.send("Runtime.getHeapUsage")).usedSize,
        });
      }
    }
    await stabilize();
    const memoryAfter = await cdp.send("Runtime.getHeapUsage");
    if (process.env.ARIA_HEAP_SNAPSHOT === "1") {
      const chunks: string[] = [];
      cdp.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) =>
        chunks.push(chunk),
      );
      await cdp.send("HeapProfiler.takeHeapSnapshot");
      await writeFile("tests/.tmp/aria-heap.heapsnapshot", chunks.join(""));
    }
    const resources = await page.evaluate(
      "performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).map(r=>({url:r.name,bytes:r.encodedBodySize}))",
    );
    assert.deepEqual(errors, []);
    const longTasks = await page.evaluate<number[]>("window.__ariaLongTasks");
    const rendered = await page.evaluate(
      "({rows:document.querySelectorAll('.orders-table [role=row]').length,cells:document.querySelectorAll('.orders-table [role=gridcell],.orders-table [role=rowheader]').length})",
    );
    cases.push({
      lots,
      width,
      height,
      throttle,
      load: stats(loads),
      interactions: Object.fromEntries(
        Object.entries(metrics).map(([k, v]) => [k, stats(v)]),
      ),
      memoryBefore,
      memoryAfter,
      memoryCycleSamples,
      initialResources,
      resources,
      longTasks,
      rendered,
    });
    await writeFile(
      resolve(evidence, reportName),
      JSON.stringify(
        {
          phase,
          browser: browser.version(),
          date: new Date().toISOString(),
          quick,
          baselineCommit: "bd37e32c943477dd36c6936c8453160c0abf34b9",
          cases,
          dataHash: hash(original),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(phase + " measured " + lots + " lots at " + width + "px");
    await context.close();
  }
  assert.equal(hash(await readFile("data/database.json")), hash(original));
  const report = {
    phase,
    browser: browser.version(),
    date: new Date().toISOString(),
    baselineCommit: "bd37e32c943477dd36c6936c8453160c0abf34b9",
    cases,
    dataHash: hash(original),
  };
  await writeFile(
    resolve(evidence, reportName),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Report: tests/evidence/aria/" + reportName);
} finally {
  await browser.close();
  await new Promise<void>((ok) => server.close(() => ok()));
}
