import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { chromium, type Page } from "playwright-core";
import { buildMaterialNeeds } from "../shared/material-demand";
import { makeMaterialDemandPerformanceFixture } from "../tests/fixtures/material-demand";

const evidence = resolve("tests/evidence/ocm");
await mkdir(evidence, { recursive: true });
const original = await readFile("data/database.json");
const hash = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
let db = makeMaterialDemandPerformanceFixture(6000);
const app = express();
app.get("/api/state", (_request, response) => response.json(db));
app.use(express.static(resolve("dist"), { dotfiles: "allow" }));
app.get("/{*path}", (_request, response) =>
  response.sendFile(resolve("dist/index.html"), { dotfiles: "allow" }),
);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((ok) => server.once("listening", ok));
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const stats = (values: number[]) => ({
  samples: values,
  median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
  p95: [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1],
});
async function measure(
  page: Page,
  ready: string,
  action: () => Promise<unknown>,
  event = "click",
) {
  await page.evaluate(`(() => {
    const p = window.__demandPerf = {start:null,result:null};
    document.addEventListener(${JSON.stringify(event)},()=>p.start=performance.now(),{once:true,capture:true});
    const inspect=()=>{if(p.start!==null&&(${ready}))requestAnimationFrame(()=>requestAnimationFrame(()=>p.result=performance.now()-p.start));else requestAnimationFrame(inspect);};requestAnimationFrame(inspect);
  })()`);
  await action();
  await page.waitForFunction("window.__demandPerf?.result !== null");
  return page.evaluate<number>("window.__demandPerf.result");
}
const cases: Record<string, unknown>[] = [];
try {
  for (const [lots, width, height] of [
    [6000, 1440, 1000],
    [6000, 375, 812],
    [60000, 1440, 1000],
  ]) {
    db = makeMaterialDemandPerformanceFixture(lots);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await page.addInitScript(
      `window.__demandLongTasks=[];new PerformanceObserver(list=>window.__demandLongTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});`,
    );
    await page.addInitScript(
      `(() => {const inspect=()=>{if(document.querySelectorAll('[data-need]').length===50)requestAnimationFrame(()=>requestAnimationFrame(()=>window.__demandLoad=performance.now()));else requestAnimationFrame(inspect);};requestAnimationFrame(inspect);})();`,
    );
    const route =
      origin +
      "/abastecimiento?tab=pendientes&pendientes_desde=2026-01-01&pendientes_hasta=2028-12-31";
    const loads: number[] = [];
    for (let index = 0; index < 20; index++) {
      await page.goto(route);
      await page.waitForFunction("window.__demandLoad > 0");
      loads.push(await page.evaluate<number>("window.__demandLoad"));
    }
    const metrics: Record<string, number[]> = {};
    const record = async (
      name: string,
      ready: string,
      action: () => Promise<unknown>,
      event = "click",
    ) => {
      (metrics[name] ??= []).push(await measure(page, ready, action, event));
    };
    const search = page.getByRole("searchbox", {
      name: "Buscar OC, producto o material pendiente",
      exact: true,
    });
    for (let index = 0; index < 30; index++) {
      const day = index % 2 ? "01/01/2026" : "02/01/2026";
      const isoDay = index % 2 ? "2026-01-01" : "2026-01-02";
      await page.locator('[id="field-desde"]').fill(day);
      await record(
        "consult",
        `document.querySelector('.material-demand-panel')?.getAttribute('data-range-from')===${JSON.stringify(isoDay)} && document.querySelectorAll('[data-need]').length===50`,
        () =>
          page.getByRole("button", { name: "Consultar", exact: true }).click(),
      );
      await record(
        "search",
        "document.querySelectorAll('[data-need]').length===0",
        () => search.fill("sin-resultados-material"),
        "input",
      );
      await record(
        "search-clear",
        "document.querySelectorAll('[data-need]').length===50",
        () => search.fill(""),
        "input",
      );
      const checkbox = page
        .locator("[data-need]")
        .first()
        .getByRole("checkbox");
      await checkbox.scrollIntoViewIfNeeded();
      await record(
        "select",
        "document.querySelector('.demand-selection-count')?.textContent.startsWith('1 de 7')",
        () => checkbox.check(),
      );
      await record(
        "deselect",
        "document.querySelector('.demand-selection-count')?.textContent.startsWith('0 de 7')",
        () => checkbox.uncheck(),
      );
    }
    const firstMaterials = await page
      .locator("[data-need]")
      .evaluateAll((nodes) => {
        const seen = new Set<string>();
        return nodes
          .map((node) => node.getAttribute("data-need")!)
          .filter((key) => {
            const material = key.split("/")[1];
            if (seen.has(material)) return false;
            seen.add(material);
            return true;
          })
          .slice(0, 7);
      });
    assert.equal(firstMaterials.length, 7);
    for (const key of firstMaterials)
      await page.locator(`[data-need="${key}"]`).getByRole("checkbox").check();
    const prepare = page.getByRole("button", {
      name: "Preparar OCM",
      exact: true,
    });
    await prepare.scrollIntoViewIfNeeded();
    await cdp.send("HeapProfiler.collectGarbage");
    const before = await cdp.send("Runtime.getHeapUsage");
    const memorySamples = [{ cycles: 0, usedSize: before.usedSize }];
    for (let index = 0; index < 30; index++) {
      await record(
        "open-seven-materials",
        "document.querySelectorAll('.dialog .order-form-line').length===7",
        () => prepare.click(),
      );
      await record(
        "close",
        "document.querySelectorAll('[role=dialog]').length===0",
        () =>
          page
            .getByRole("button", { name: "Volver a selección", exact: true })
            .click(),
      );
      if (index % 5 === 4) {
        await cdp.send("HeapProfiler.collectGarbage");
        const memory = await cdp.send("Runtime.getHeapUsage");
        memorySamples.push({ cycles: index + 1, usedSize: memory.usedSize });
      }
    }
    await cdp.send("HeapProfiler.collectGarbage");
    const after = await cdp.send("Runtime.getHeapUsage");
    const measurements = Object.fromEntries(
      Object.entries(metrics).map(([key, values]) => [key, stats(values)]),
    );
    const allNeeds = buildMaterialNeeds(db);
    const interactionPass =
      lots === 60000 ||
      Object.values(measurements).every((value) => value.p95 < 200);
    const memoryPass =
      after.usedSize <=
      before.usedSize + Math.max(before.usedSize * 0.15, 5_000_000);
    const result = {
      lots,
      width,
      orders: db.orden_compra.length,
      productLines: db.orden_producto.length,
      pendingPairs: allNeeds.length,
      fixtureHash: hash(JSON.stringify(db)),
      load: stats(loads),
      interactions: measurements,
      memoryBefore: before,
      memoryAfter: after,
      memorySamples,
      interactionPass,
      memoryPass,
      errors,
      longTasks: await page.evaluate("window.__demandLongTasks"),
      javascript: await page.evaluate(
        "performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).map(r=>({url:r.name,bytes:r.encodedBodySize}))",
      ),
    };
    cases.push(result);
    await writeFile(
      resolve(evidence, "material-demand-performance.json"),
      JSON.stringify(
        {
          browser: browser.version(),
          date: new Date().toISOString(),
          dataHash: hash(original),
          cases,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `OCM measured: ${lots} lots / ${width}px / ${allNeeds.length} pending pairs`,
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert.equal(hash(await readFile("data/database.json")), hash(original));
  assert.ok(
    cases.every((value) => value.interactionPass && value.memoryPass),
    "OCM excede el objetivo de interacción o crecimiento de memoria; conserva las muestras para diagnóstico.",
  );
} finally {
  await browser.close();
  await new Promise<void>((ok) => server.close(() => ok()));
}
