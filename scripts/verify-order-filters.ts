import { ariaPage } from "../tests/aria-playwright.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import express from "express";
import {
  makeOrderPerformanceFixture,
  ORDER_PERFORMANCE_DAY,
} from "../tests/fixtures/order-performance";
import {
  buildOrderReadModel,
  filterCustomOrders,
  type OrderSummary,
} from "../src/order-read-model";
import { customFilters, type CustomFilterId } from "../src/order-filters";
import { command } from "../server/domain";
import { validateDatabase } from "../server/integrity";

// This fixture server serves the production build and the existing API contract.
// It keeps all test data in memory and never opens a JsonStore/user database.
const originalFile = resolve("data/database.json");
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const originalHash = hash(await readFile(originalFile));
let database = makeOrderPerformanceFixture(6000);
let stateReads = 0;
const app = express();
app.use(express.json());
app.get("/api/state", (_req, res) => {
  stateReads++;
  res.json(structuredClone(database));
});
app.post("/api/commands", (req, res) => {
  try {
    const next = structuredClone(database);
    const result = command(next, req.body.name, req.body.payload);
    validateDatabase(next);
    database = next;
    res.json({ result });
  } catch (error) {
    res.status(422).json({ message: (error as Error).message });
  }
});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((ok) => server.once("listening", ok));
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const checks: string[] = [],
  errors: string[] = [];
const check = (value: unknown, label: string) => {
  assert.ok(value, label);
  checks.push(label);
};
const samples: Record<string, unknown>[] = [];
const evidence = resolve("tests/evidence");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page: Page = ariaPage(await context.newPage());
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const variants = customFilters.flatMap((filter) =>
  filter.options.map((option) => option.id),
);
const visible = (row: OrderSummary) =>
  ["autorizada", "parcialmente_anulada", "cerrada"].includes(row.visible);
const sorted = <T extends OrderSummary>(rows: T[]) =>
  rows.sort(
    (a, b) =>
      (b.fecha_elaboracion ?? "").localeCompare(a.fecha_elaboracion ?? "") ||
      Number(b.no_orden) - Number(a.no_orden),
  );
const ids = (rows: readonly OrderSummary[], offset = 0) =>
  rows.slice(offset, offset + 50).map((row) => row.id);
const expected = (
  model: ReturnType<typeof buildOrderReadModel>,
  filter: CustomFilterId | "",
  day = ORDER_PERFORMANCE_DAY,
) =>
  sorted(
    filterCustomOrders(
      model.orders.filter(
        (row) => row.tipo_orden === "producto" && visible(row),
      ),
      filter,
      day,
    ),
  );
async function waitRows(
  rows: readonly OrderSummary[],
  offset = 0,
  target: Page = page,
) {
  const values = ids(rows, offset);
  await target.waitForFunction(
    ({ values, count }) => {
      const table = document.querySelector(".orders-table");
      if (!table) return false;
      const links = [
        ...table.querySelectorAll<HTMLAnchorElement>(".order-link"),
      ];
      const actual = links.map((link) =>
        new URL(link.href).pathname.split("/").pop(),
      );
      const ready = table.classList.contains("virtual-table")
        ? Number(table.getAttribute("aria-rowcount")) === values.length + 1 &&
          actual.length > 0 &&
          links.every(
            (link) =>
              values[
                Number(
                  link.closest("[role=row]")?.getAttribute("aria-rowindex"),
                ) - 2
              ] === new URL(link.href).pathname.split("/").pop(),
          )
        : JSON.stringify(actual) === JSON.stringify(values);
      return (
        ready &&
        document
          .querySelector(".table-footer [aria-live]")
          ?.textContent?.startsWith(count + " órdenes en esta vista")
      );
    },
    { values, count: rows.length },
  );
  if (await target.locator(".virtual-table").count()) {
    // Verify every page item through the actual windowed DOM, then restore the viewport.
    const actual = await target.evaluate(`(async()=>{
      await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
      const table=document.querySelector('.orders-table'),saved=scrollY,found=new Map();
      const top=table.getBoundingClientRect().top+scrollY,bottom=top+table.getBoundingClientRect().height;
      const frame=()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(()=>ok())));
      const collect=()=>table.querySelectorAll('.order-link').forEach(link=>found.set(Number(link.closest('[role=row]')?.getAttribute('aria-rowindex'))-2,new URL(link.href).pathname.split('/').pop()));
      for(let y=Math.max(0,top-80);y<bottom;y+=Math.max(250,innerHeight-150)){window.scrollTo({top:y,behavior:'instant'});await frame();collect();}
      window.scrollTo({top:saved,behavior:'instant'});await frame();
      return [...found].sort((a,b)=>a[0]-b[0]).map(([,id])=>id);
    })()`);
    assert.deepEqual(
      actual,
      values,
      "Todas las filas virtualizadas conservan ID y posición",
    );
  }
}
async function renderedRowCount() {
  const grid = page.locator(".orders-table");
  const count = await grid.getAttribute("aria-rowcount");
  return count ? Number(count) - 1 : grid.locator("tbody tr").count();
}
async function optionCount() {
  await page
    .getByRole("combobox", { name: "Filtro personalizado", exact: true })
    .click();
  const count = await page.getByRole("option").count();
  await page.keyboard.press("Escape");
  return count;
}
async function selectMeasured(
  filter: CustomFilterId | "",
  rows: readonly OrderSummary[],
) {
  // A JavaScript string keeps the browser callback independent of tsx name helpers.
  const measure = `({ filter, values, count }) => new Promise((ok, fail) => {
    const start = performance.now();
    const control = document.querySelector(".custom-filter-select");
    document.addEventListener("click",()=>{ window.__filterStarted=performance.now(); },{capture:true,once:true});
    const timeout = setTimeout(() => fail(new Error("Timed out waiting for filtered rows")), 15000);
    const inspect = () => {
      const actual = Array.from(document.querySelectorAll(".orders-table .order-link"))
        .map((link) => new URL(link.href).pathname.split("/").pop());
      const table=document.querySelector(".orders-table");
      const ready = (table?.classList.contains("virtual-table") ? Number(table.getAttribute("aria-rowcount"))===values.length+1 && actual.length>0 && actual.every(id=>values.includes(id)) : JSON.stringify(actual)===JSON.stringify(values)) &&
        document.querySelector(".table-footer [aria-live]")?.textContent?.startsWith(count + " órdenes en esta vista") &&
        (new URLSearchParams(location.search).get("filtro") ?? "") === filter;
      if (ready) requestAnimationFrame(() => { clearTimeout(timeout); ok(performance.now() - (window.__filterStarted ?? start)); });
      else requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  })`;
  await page
    .getByRole("combobox", { name: "Filtro personalizado", exact: true })
    .click();
  const pending = page.evaluate<number>(
    `(${measure})(${JSON.stringify({ filter, values: ids(rows), count: rows.length })})`,
  );
  await page
    .getByRole("option")
    .locator(`[data-key=${JSON.stringify(filter)}]`)
    .count();
  await page
    .locator(`[role="option"][data-key=${JSON.stringify(filter)}]`)
    .click();
  return pending;
}
function stats(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return {
    medianMs: ordered[Math.floor(ordered.length / 2)],
    p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
    maxMs: ordered.at(-1),
    samples: values,
  };
}
async function screenshot(name: string) {
  await page.screenshot({
    path: resolve(evidence, name + ".png"),
    fullPage: false,
  });
}

try {
  // Fix Date alone. Playwright Clock also substitutes performance APIs, so it
  // belongs only in the separate calendar test, never in performance samples.
  await page.addInitScript(`{
    const RealDate = Date, fixed = RealDate.parse("${ORDER_PERFORMANCE_DAY}T17:00:00Z");
    globalThis.Date = new Proxy(RealDate, {
      construct(target, args) { return Reflect.construct(target, args.length ? args : [fixed]); },
      apply() { return new RealDate(fixed).toString(); },
      get(target, property) { return property === "now" ? () => fixed : Reflect.get(target, property); }
    });
  }`);
  let model = buildOrderReadModel(database);
  await page.goto(origin + "/ordenes/productos");
  await waitRows(expected(model, ""));
  check(
    (await optionCount()) === 18,
    "Productos ofrece 17 variantes y una opción para retirar el filtro",
  );
  await screenshot("40-filtros-personalizados-escritorio");
  const readsBeforeQueries = stateReads;
  for (const filter of variants) {
    await page
      .getByRole("combobox", { name: "Filtro personalizado", exact: true })
      .selectOption(filter);
    await waitRows(expected(model, filter));
    check(
      new URL(page.url()).searchParams.get("filtro") === filter,
      `Variante ${filter}: resultados y URL correctos`,
    );
  }
  await page
    .getByRole("combobox", { name: "Filtro personalizado", exact: true })
    .selectOption("");
  await waitRows(expected(model, ""));
  check(
    (await renderedRowCount()) === 50,
    "El listado monta como máximo cincuenta órdenes",
  );
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await waitRows(expected(model, ""), 50);
  check(
    new URL(page.url()).searchParams.get("pagina") === "2",
    "Siguiente conserva página dos en la URL",
  );
  await screenshot("41-paginacion-ordenes");
  await page
    .getByRole("combobox", { name: "Filtro personalizado", exact: true })
    .selectOption("batch_vencido");
  await waitRows(expected(model, "batch_vencido"));
  check(
    !new URL(page.url()).searchParams.has("pagina"),
    "Cambiar el filtro vuelve a la primera página",
  );

  await page
    .getByRole("button", {
      name: "Filtrar y ordenar Orden / tipo",
      exact: true,
    })
    .click();
  check(
    (await page
      .locator(".column-filter-panel")
      .getByRole("checkbox")
      .count()) ===
      expected(model, "batch_vencido").length + 1,
    "Los valores de columna incluyen todas las páginas del resultado",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await waitRows(expected(model, "batch_vencido"), 50);
  const listUrl = page.url();
  await page
    .locator(".orders-table .order-link")
    .nth(5)
    .scrollIntoViewIfNeeded();
  const detailScroll = await page.evaluate(() => scrollY);
  await page.locator(".orders-table .order-link").nth(5).click();
  await page
    .getByRole("link", { name: "Volver a órdenes", exact: true })
    .click();
  await waitRows(expected(model, "batch_vencido"), 50);
  await page.waitForFunction(
    (top) => Math.abs(scrollY - top) < 2,
    detailScroll,
  );
  check(
    page.url() === listUrl &&
      Math.abs((await page.evaluate(() => scrollY)) - detailScroll) < 2,
    "Volver del detalle recupera filtro, página y desplazamiento",
  );
  const printLink = page
    .locator(".orders-table [role=row][data-key]")
    .nth(5)
    .getByRole("link", { name: /^Imprimir OC / });
  await printLink.scrollIntoViewIfNeeded();
  const printScroll = await page.evaluate(() => scrollY);
  await printLink.click();
  await page
    .getByRole("link", { name: "Volver a órdenes", exact: true })
    .click();
  await waitRows(expected(model, "batch_vencido"), 50);
  await page.waitForFunction((top) => Math.abs(scrollY - top) < 2, printScroll);
  check(
    page.url() === listUrl &&
      Math.abs((await page.evaluate(() => scrollY)) - printScroll) < 2,
    "Volver de impresión recupera filtro, página y desplazamiento",
  );

  await page
    .getByRole("button", { name: "Filtrar y ordenar Estado", exact: true })
    .click();
  const menu = page.locator(".column-filter-panel");
  await menu
    .getByRole("checkbox", { name: "Seleccionar todos", exact: true })
    .uncheck();
  await menu
    .getByRole("checkbox", { name: "Parcialmente anulada", exact: true })
    .check();
  await menu.getByRole("button", { name: "Aplicar", exact: true }).click();
  await waitRows(
    expected(model, "batch_vencido").filter(
      (row) => row.visible === "parcialmente_anulada",
    ),
  );
  check(
    (await page
      .getByRole("combobox", { name: "Filtro personalizado" })
      .inputValue()) === "batch_vencido",
    "El filtro personalizado se intersecta con el de columna",
  );
  await page
    .getByRole("combobox", { name: "Filtro personalizado" })
    .selectOption("");
  await waitRows(
    expected(model, "").filter((row) => row.visible === "parcialmente_anulada"),
  );
  check(
    new URL(page.url()).searchParams.has("filtros"),
    "Sin filtro personalizado conserva los filtros de columna",
  );
  await page
    .getByRole("combobox", { name: "Filtro personalizado" })
    .selectOption("batch_vencido");
  await page
    .getByRole("textbox", { name: "Buscar órdenes", exact: true })
    .fill("crema");
  await waitRows(
    expected(model, "batch_vencido").filter(
      (row) =>
        row.visible === "parcialmente_anulada" &&
        row.searchText.includes("crema"),
    ),
  );
  await page
    .getByRole("button", { name: "Limpiar filtros (2)", exact: true })
    .click();
  await waitRows(
    expected(model, "").filter((row) => row.searchText.includes("crema")),
  );
  check(
    (await page
      .getByRole("textbox", { name: "Buscar órdenes" })
      .inputValue()) === "crema",
    "Limpiar filtros conserva la búsqueda y retira personalizado y columna",
  );
  check(
    stateReads === readsBeforeQueries,
    "Filtros, búsqueda, columnas, paginación y navegación interna reutilizan el snapshot",
  );

  await page
    .getByRole("button", {
      name: "Ayuda de filtros personalizados",
      exact: true,
    })
    .click();
  check(
    (await page.locator("[role=dialog] .filter-help-entry").count()) === 13,
    "La ayuda contiene los trece filtros",
  );
  check(
    (await page
      .getByRole("dialog")
      .getByText("No cuentan otros renglones de esa OCM.", { exact: false })
      .count()) === 1,
    "La ayuda explica que solo cuentan los renglones vinculados de la OCM",
  );
  await screenshot("42-ayuda-filtros-escritorio");
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    check(
      await page.evaluate(
        () => !!document.activeElement?.closest("[role=dialog]"),
      ),
      "El teclado permanece dentro del diálogo de ayuda " + i,
    );
  }
  await page.keyboard.press("Escape");
  check(
    await page
      .getByRole("button", { name: "Ayuda de filtros personalizados" })
      .evaluate((button) => button === document.activeElement),
    "Escape devuelve el foco al botón de ayuda",
  );

  await page.goto(
    origin + "/ordenes/materiales?filtro=batch_vencido&pagina=999999",
  );
  await page.getByRole("combobox", { name: "Filtro personalizado" }).waitFor();
  check(
    (await optionCount()) === 11,
    "Materiales y Otros ofrecen únicamente las diez variantes comunes",
  );
  check(
    (await page
      .getByRole("combobox", { name: "Filtro personalizado" })
      .inputValue()) === "",
    "Una variante incompatible en URL se ignora",
  );
  await page
    .getByRole("combobox", { name: "Filtrar tipo de orden" })
    .selectOption("otro");
  await page
    .getByRole("combobox", { name: "Filtro personalizado" })
    .selectOption("recepciones_sin_factura");
  check(
    (await renderedRowCount()) > 0,
    "Otros consulta recepciones desde sus renglones",
  );

  await page.goto(origin + "/ordenes/productos?filtro=documento_sin");
  await waitRows(expected(model, "documento_sin"));
  const trigger = page
    .getByRole("button", { name: /^Agregar orden firmada para OC / })
    .first();
  const reference = (await trigger.getAttribute("aria-label"))!.replace(
    "Agregar orden firmada para ",
    "",
  );
  await trigger.click();
  await page
    .getByRole("textbox", { name: "Nombre del archivo", exact: true })
    .fill("filtro-documento.html");
  await page
    .getByRole("button", { name: "Guardar placeholder", exact: true })
    .click();
  await page.locator("[role=dialog]").waitFor({ state: "hidden" });
  model = buildOrderReadModel(database);
  await waitRows(expected(model, "documento_sin"));
  check(
    (await page.getByRole("link", { name: reference, exact: true }).count()) ===
      0,
    "Guardar documento actualiza el filtro y retira la orden de Sin documento",
  );
  await page.reload();
  await waitRows(expected(model, "documento_sin"));
  check(
    (await page
      .getByRole("combobox", { name: "Filtro personalizado" })
      .inputValue()) === "documento_sin",
    "Recargar conserva el filtro activo",
  );

  const excluded = expected(model, "documento_con")[0];
  await page.goto(
    origin + "/ordenes/productos?filtro=documento_sin&q=" + excluded.no_orden,
  );
  await page
    .getByText("La orden existe y está excluida por los filtros actuales.", {
      exact: true,
    })
    .waitFor();
  check(
    (await page
      .getByRole("button", { name: "Crear nueva orden", exact: true })
      .count()) === 0,
    "Una orden filtrada no se presenta como inexistente",
  );

  for (const lotCount of [6000, 60000]) {
    database = makeOrderPerformanceFixture(lotCount);
    model = buildOrderReadModel(database);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + "/ordenes/productos");
    await waitRows(expected(model, ""));
    const load = await page.evaluate(async () => {
      await new Promise<void>((ok) =>
        requestAnimationFrame(() => requestAnimationFrame(() => ok())),
      );
      const resource = performance
        .getEntriesByType("resource")
        .find((entry) =>
          entry.name.endsWith("/api/state"),
        ) as PerformanceResourceTiming;
      const preparation = performance.getEntriesByName("orders:prepare").at(-1);
      return {
        firstResultsMs: performance.now(),
        stateDurationMs: resource?.duration,
        responseBytes: resource?.decodedBodySize,
        modelPreparationMs: preparation?.duration,
        modelStart: preparation?.startTime,
      };
    });
    const reads = stateReads;
    const times: number[] = [];
    for (let round = 0; round < 3; round++)
      for (const filter of variants)
        times.push(await selectMeasured(filter, expected(model, filter)));
    const measurements = stats(times);
    samples.push({
      lotCount,
      orders: database.orden_compra.length,
      viewport: "1440x1000",
      cpuRate: 1,
      load,
      ...measurements,
    });
    if (lotCount === 6000)
      check(
        measurements.p95Ms < 200,
        "Con 6.000 lotes, p95 de actualización visible inferior a 200 ms en escritorio",
      );
    check(
      stateReads === reads,
      `Las 51 selecciones con ${lotCount} lotes reutilizan el snapshot`,
    );
    check(
      (await page.evaluate(
        () => performance.getEntriesByName("orders:prepare").at(-1)?.startTime,
      )) === load.modelStart,
      `Las selecciones con ${lotCount} lotes reutilizan el modelo preparado`,
    );
    if (lotCount === 6000) {
      await page.setViewportSize({ width: 375, height: 812 });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const mobileTimes: number[] = [];
      for (let round = 0; round < 3; round++)
        for (const filter of variants)
          mobileTimes.push(
            await selectMeasured(filter, expected(model, filter)),
          );
      samples.push({
        lotCount,
        orders: database.orden_compra.length,
        viewport: "375x812",
        cpuRate: 4,
        ...stats(mobileTimes),
      });
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "El selector no desborda en móvil con CPU limitada",
      );
      await page.locator(".custom-filter-control").scrollIntoViewIfNeeded();
      await screenshot("43-filtros-personalizados-movil");
      await page
        .getByRole("button", { name: "Ayuda de filtros personalizados" })
        .click();
      await screenshot("44-ayuda-filtros-movil");
      check(
        await page
          .locator("[role=dialog]")
          .evaluate(
            (dialog) => dialog.getBoundingClientRect().width <= innerWidth,
          ),
        "La ayuda se adapta a móvil",
      );
      await page.keyboard.press("Escape");
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await cdp.detach();
      await page.setViewportSize({ width: 1024, height: 820 });
      await page
        .getByRole("button", { name: "Abrir navegación", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Fijar navegación", exact: true })
        .click();
      await page.waitForFunction(() => {
        const navigation = document.getElementById("app-navigation");
        const main = document.querySelector(".main-area");
        return (
          navigation &&
          main &&
          main.getBoundingClientRect().left + 1 >=
            navigation.getBoundingClientRect().right
        );
      });
      await page.locator(".custom-filter-control").scrollIntoViewIfNeeded();
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "El selector se adapta con navegación fijada en tablet",
      );
      await screenshot("45-filtros-personalizados-fijada");
      await page
        .getByRole("button", { name: "Desfijar navegación", exact: true })
        .click();
      await page.keyboard.press("Escape");
    }
  }

  // Separate clock page: the timing samples above used the real performance clock.
  database = makeOrderPerformanceFixture(120);
  model = buildOrderReadModel(database);
  const clockPage: Page = ariaPage(await context.newPage());
  clockPage.on("pageerror", (error) => errors.push(error.message));
  await clockPage.clock.install({ time: new Date("2026-10-10T04:59:40Z") });
  await clockPage.clock.pauseAt(new Date("2026-10-10T04:59:50Z"));
  await clockPage.goto(origin + "/ordenes/productos?filtro=batch_vencido");
  await waitRows(expected(model, "batch_vencido"), 0, clockPage);
  const clockReads = stateReads;
  await clockPage.clock.fastForward(10001);
  await waitRows(expected(model, "batch_vencido", "2026-10-10"), 0, clockPage);
  check(
    stateReads === clockReads,
    "El vencimiento cambia a medianoche de Bogotá sin descargar datos",
  );
  await clockPage.clock.setFixedTime(new Date("2026-10-11T12:00:00Z"));
  await clockPage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await waitRows(expected(model, "batch_vencido", "2026-10-11"), 0, clockPage);
  check(true, "Recuperar foco actualiza el día de referencia");
  await clockPage.close();
  check(
    errors.length === 0,
    "Sin errores JavaScript en los filtros, ayuda y mediciones",
  );
  check(
    hash(await readFile(originalFile)) === originalHash,
    "El archivo del usuario conserva íntegramente su SHA-256",
  );
  const report = {
    date: new Date().toISOString(),
    passed: true,
    checks,
    errors,
    stateReads,
    originalDataSha256: originalHash,
    method:
      "Production Vite build, in-memory fixture API with structuredClone; actual Date fixed, real performance clock. Three rounds of all17 variants; input change through matching DOM results and two animation frames. Load is one observation per volume; no JsonStore/disk validation in load timings.",
    scenarios: samples,
  };
  await writeFile(
    resolve(evidence, "order-filters-browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        checks: checks.length,
        scenarios: samples.map(({ samples, ...summary }) => summary),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    await page.evaluate(() =>
      [...document.querySelectorAll(".column-filter-button")]
        .slice(0, 2)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            rect: r.toJSON(),
            hit: document
              .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              ?.outerHTML.slice(0, 300),
            parents: el.parentElement?.parentElement?.outerHTML.slice(0, 500),
          };
        }),
    ),
  );
  await page
    .screenshot({
      path: resolve(evidence, "order-filters-failure.png"),
      fullPage: false,
    })
    .catch(() => undefined);
  console.error(
    await page
      .locator("body")
      .innerText()
      .catch(() => ""),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise<void>((ok, fail) =>
    server.close((error) => (error ? fail(error) : ok())),
  );
}
