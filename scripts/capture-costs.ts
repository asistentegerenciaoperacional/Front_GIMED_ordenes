import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.COSTS_PREVIEW_URL ?? "http://127.0.0.1:5173";
try {
  for (const width of [375, 768, 1024, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width === 375,
    });
    const page = await context.newPage();
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/api/"))
        writes.push(request.url());
    });
    await page.goto(origin + "/catalogos?tab=costos_maquila");
    await page
      .getByRole("button", {
        name: "Mostrar costos de Crema corporal · 250 ml",
        exact: true,
      })
      .click();
    const firstCost = page.locator(".maquila-cost-history tbody tr").first();
    await page.waitForTimeout(250);
    await firstCost.hover();
    await firstCost.getByRole("button", { name: /^Editar costo/ }).focus();
    await page.screenshot({
      path: `tests/evidence/costs/current-groups-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: "Agregar costo de Crema corporal · 250 ml",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", {
        name: "Agregar · Costos de maquila",
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: `tests/evidence/costs/current-add-${width}.png`,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    assert.deepEqual(
      writes,
      [],
      "Las capturas de la base local son de solo lectura.",
    );
    await context.close();
  }
} finally {
  await browser.close();
}
