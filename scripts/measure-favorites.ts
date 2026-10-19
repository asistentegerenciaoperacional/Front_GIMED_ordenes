import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { chromium, type Page } from "playwright-core";
import { makeOrderPerformanceFixture } from "../tests/fixtures/order-performance";

const app = express();
let db = makeOrderPerformanceFixture(6000);
app.get("/api/state", (_req, res) => res.json(db));
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((ok) => server.once("listening", ok));
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const cases = [];
const soak = process.argv.includes("--soak");
const cycles = soak ? 600 : 120;
async function measure(
  page: Page,
  event: string,
  condition: string,
  action: () => Promise<unknown>,
) {
  // A browser-owned string avoids tsx/esbuild's Node-only keepNames helpers.
  await page.evaluate(`(() => {
    window.__favoriteMeasure = { start: null, elapsed: null };
    document.addEventListener(${JSON.stringify(event)}, () => {
      window.__favoriteMeasure.start = performance.now();
    }, { once: true, capture: true });
    const inspect = () => {
      if (window.__favoriteMeasure.start !== null && (${condition})) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.__favoriteMeasure.elapsed = performance.now() - window.__favoriteMeasure.start;
        }));
      } else requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  })()`);
  await action();
  await page.waitForFunction(
    () => (window as any).__favoriteMeasure.elapsed !== null,
  );
  return page.evaluate<number>(() => (window as any).__favoriteMeasure.elapsed);
}
const stats = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples, p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
try {
  for (const lots of soak ? [6000] : [6000, 60000]) {
    db = makeOrderPerformanceFixture(lots);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    const heap = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      return {
        ...(await cdp.send("Runtime.getHeapUsage")),
        ...(await cdp.send("Memory.getDOMCounters")),
      };
    };
    await page.goto(origin + "/catalogos?tab=proveedores_favoritos");
    const trigger = page.getByRole("button", {
      name: "Editar proveedores de Envase",
      exact: true,
    });
    await trigger.waitFor();
    const dialog = page.getByRole("dialog", {
      name: "Editar proveedores · Envase",
      exact: true,
    });
    const close = async () => {
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      const confirm = page.getByRole("alertdialog");
      if (await confirm.count())
        await confirm
          .getByRole("button", { name: "Descartar cambios", exact: true })
          .click();
      await dialog.waitFor({ state: "hidden" });
    };
    for (let i = 0; i < 10; i++) {
      await trigger.click();
      await close();
    }
    const memoryBefore = await heap();
    const metrics: Record<string, number[]> = {
      open: [],
      search: [],
      selection: [],
      discardClose: [],
    };
    for (let i = 0; i < 20; i++) {
      metrics.open.push(
        await measure(
          page,
          "click",
          "!!document.querySelector('.relation-picker')",
          () => trigger.click(),
        ),
      );
      const search = dialog.getByRole("searchbox", {
        name: "Buscar proveedores disponibles",
        exact: true,
      });
      metrics.search.push(
        await measure(
          page,
          "input",
          "document.querySelectorAll('.relation-available input[type=checkbox]').length === 1",
          () => search.fill("Aurora"),
        ),
      );
      metrics.selection.push(
        await measure(
          page,
          "click",
          "document.querySelectorAll('.relation-final .relation-selected').length === 3",
          () => dialog.getByRole("checkbox").click(),
        ),
      );
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      metrics.discardClose.push(
        await measure(
          page,
          "click",
          "!document.querySelector('.relation-picker')",
          () =>
            page
              .getByRole("alertdialog")
              .getByRole("button", { name: "Descartar cambios", exact: true })
              .click(),
        ),
      );
    }
    const memorySamples = [];
    for (let cycle = 1; cycle <= cycles; cycle++) {
      await trigger.click();
      if (cycle % 5 === 0) await dialog.getByRole("checkbox").first().click();
      await close();
      if (cycle % 30 === 0) {
        const sample = { cycle, ...(await heap()) };
        memorySamples.push(sample);
        console.log(
          `${lots} lotes; ciclo ${cycle}: ${sample.usedSize} bytes; ${sample.nodes} nodos`,
        );
      }
    }
    const memoryAfter = await heap();
    const growth = memoryAfter.usedSize - memoryBefore.usedSize;
    const limit = Math.max(memoryBefore.usedSize * 0.15, 5_000_000);
    assert.ok(growth <= limit, `Crecimiento de heap ${growth} > ${limit}`);
    assert.deepEqual(errors, []);
    cases.push({
      lots,
      cycles: cycles + 30,
      interactions: Object.fromEntries(
        Object.entries(metrics).map(([key, samples]) => [key, stats(samples)]),
      ),
      memoryBefore,
      memoryAfter,
      memorySamples,
      growth,
      limit,
      passed: true,
    });
    await context.close();
    console.log(
      `Favoritos: ${lots} lotes; ${cycles + 30} ciclos; heap +${growth} bytes`,
    );
  }
  await mkdir("tests/evidence/favorites", { recursive: true });
  await writeFile(
    `tests/evidence/favorites/component${soak ? "-soak" : ""}-performance.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        timing:
          "Evento DOM real hasta resultado visible y dos frames; tiempo de automatización excluido",
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
