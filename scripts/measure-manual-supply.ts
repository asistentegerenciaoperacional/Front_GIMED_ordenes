import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { chromium, type Page } from "playwright-core";
import { buildMaterialNeeds } from "../shared/material-demand";
import { materialSupplyCandidates } from "../shared/material-supply";
import { makeMaterialDemandPerformanceFixture } from "../tests/fixtures/material-demand";

const evidence = resolve("tests/evidence/manual-supply");
await mkdir(evidence, { recursive: true });
const hash = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const original = hash(await readFile("data/database.json"));
let db = makeMaterialDemandPerformanceFixture(6000);
const app = express();
app.get("/api/state", (_req, res) => res.json(db));
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((ok) => server.once("listening", ok));
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const cases: unknown[] = [];
const stats = (samples: number[]) => ({
  samples,
  p95: [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1],
});
async function measure(
  page: Page,
  ready: string,
  action: () => Promise<unknown>,
  event = "click",
) {
  await page.evaluate(`(() => {
    const m = window.__linkPerf = {start:null,result:null};
    document.addEventListener(${JSON.stringify(event)},()=>m.start=performance.now(),{once:true,capture:true});
    const inspect=()=>{if(m.start!==null&&(${ready}))requestAnimationFrame(()=>requestAnimationFrame(()=>m.result=performance.now()-m.start));else requestAnimationFrame(inspect);};requestAnimationFrame(inspect);
  })()`);
  await action();
  await page.waitForFunction("window.__linkPerf.result!==null");
  return page.evaluate<number>("window.__linkPerf.result");
}
try {
  for (const lots of [6000, 60000]) {
    db = makeMaterialDemandPerformanceFixture(lots);
    const need = buildMaterialNeeds(db).find(
      (need) => materialSupplyCandidates(db, need.material.id).length > 50,
    )!;
    assert.ok(need);
    const candidates = materialSupplyCandidates(db, need.material.id);
    const target = candidates.at(-1)!;
    const index = db.orden_producto
      .filter((line) => line.id_orden_compra === need.order.id)
      .findIndex((line) => line.id === need.line.id);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      "window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true})",
    );
    await page.goto(`${origin}/ordenes/${need.order.id}`);
    const trigger = page
      .locator(".line-card")
      .nth(index)
      .getByRole("button", { name: "Vincular OCM existente", exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const dialog = page.getByRole("dialog", {
      name: "Vincular OCM existente",
      exact: true,
    });
    const material = dialog.getByRole("combobox", {
      name: "Material pendiente",
      exact: true,
    });
    const targetInput = dialog.getByRole("combobox", {
      name: "Renglón de OCM",
      exact: true,
    });
    const metrics: Record<string, number[]> = {};
    const record = async (
      name: string,
      ready: string,
      action: () => Promise<unknown>,
      event = "click",
    ) => (metrics[name] ??= []).push(await measure(page, ready, action, event));
    for (let sample = 0; sample < 20; sample++) {
      await record("dialog-open", "!!document.querySelector('.dialog')", () =>
        trigger.click(),
      );
      await material.fill(need.material.nombre_material!);
      await material.press("ArrowDown");
      await record(
        "material-selection",
        "!!document.querySelector('input[aria-label=\"Renglón de OCM\"]:not(:disabled)')",
        () =>
          page
            .locator(`[role="option"][data-key="${need.material.id}"]`)
            .click(),
      );
      await targetInput.fill("");
      await record(
        "menu-open",
        "!!document.querySelector('[role=listbox]')",
        () => targetInput.press("ArrowDown"),
        "keydown",
      );
      assert.ok(
        (await page.locator('[role="option"][data-key]').count()) <= 51,
        "Colección renderizada acotada",
      );
      const query = "OCM " + target.order.no_orden;
      await record(
        "search-all-candidates",
        `document.querySelector('input[aria-label="Renglón de OCM"]')?.value===${JSON.stringify(query)}&&!!document.querySelector('[role="option"][data-key="${target.line.id}"]')`,
        () => targetInput.fill(query),
        "input",
      );
      await record(
        "material-order-selection",
        "!!document.querySelector('.dialog .summary-grid')",
        () =>
          page.locator(`[role="option"][data-key="${target.line.id}"]`).click(),
      );
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await record(
        "dialog-close",
        "!document.querySelector('.dialog[role=dialog]')",
        () =>
          page
            .getByRole("alertdialog")
            .getByRole("button", { name: "Descartar cambios", exact: true })
            .click(),
      );
    }
    const cdp = await context.newCDPSession(page);
    const heap = async () => {
      await page.evaluate(
        () =>
          new Promise((ok) =>
            requestAnimationFrame(() => requestAnimationFrame(ok)),
          ),
      );
      await cdp.send("HeapProfiler.collectGarbage");
      return (await cdp.send("Runtime.getHeapUsage")).usedSize;
    };
    const before = await heap();
    const cycleSamples = [{ cycles: 0, bytes: before }];
    for (let cycle = 1; cycle <= 50; cycle++) {
      await trigger.click();
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      if (cycle % 10 === 0)
        cycleSamples.push({ cycles: cycle, bytes: await heap() });
    }
    const after = await heap();
    const memoryPass = after <= before + Math.max(before * 0.15, 5_000_000);
    cases.push({
      lots,
      candidates: candidates.length,
      fixtureHash: hash(JSON.stringify(db)),
      interactions: Object.fromEntries(
        Object.entries(metrics).map(([name, values]) => [name, stats(values)]),
      ),
      before,
      after,
      memoryPass,
      cycleSamples,
      longTasks: await page.evaluate("window.__longTasks"),
      errors,
    });
    await writeFile(
      resolve(evidence, "new-flow-performance.json"),
      JSON.stringify(
        { browser: browser.version(), dataHash: original, cases },
        null,
        2,
      ) + "\n",
    );
    assert.deepEqual(errors, []);
    assert.ok(memoryPass, "El selector retiene memoria tras cerrar");
    console.log(
      `Manual link: ${lots} lots, ${candidates.length} candidates; bounded DOM and stable heap passed`,
    );
    await context.close();
  }
  assert.equal(hash(await readFile("data/database.json")), original);
} finally {
  await browser.close();
  await new Promise<void>((ok) => server.close(() => ok()));
}
