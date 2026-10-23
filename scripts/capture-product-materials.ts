import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin =
  process.env.PRODUCT_MATERIALS_PREVIEW_URL ?? "http://127.0.0.1:5173";
try {
  for (const width of [375, 768, 1024, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: width === 375,
    });
    const page = await context.newPage(),
      writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/api/"))
        writes.push(request.url());
    });
    await page.goto(origin + "/catalogos?tab=materiales_asociados");
    for (const product of [
      "Crema corporal · 250 ml",
      "Gel de limpieza · 100 ml",
    ])
      await page
        .getByRole("button", {
          name: "Mostrar materiales de " + product,
          exact: true,
        })
        .click();
    await page.waitForTimeout(250);
    await page
      .getByRole("heading", { name: "Materiales por producto", exact: true })
      .click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `tests/evidence/product-materials/current-groups-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: "Editar materiales de Crema corporal · 250 ml",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", {
        name: "Editar materiales · Crema corporal · 250 ml",
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: `tests/evidence/product-materials/current-editor-${width}.png`,
    });
    if (width === 375) {
      await page
        .getByRole("region", { name: "Materiales seleccionados", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "tests/evidence/product-materials/current-selection-375.png",
      });
    }
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    assert.deepEqual(
      writes,
      [],
      "Capturas de solo lectura, sin escrituras a la API.",
    );
    await context.close();
  }
} finally {
  await browser.close();
}
