async (page) => {
  page = page.context().pages()[0];
  const checks = [],
    check = (value, label) => {
      if (!value) throw new Error(label);
      checks.push(label);
    };
  const origin = new URL(page.url()).origin;
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.goto(origin + "/ordenes/productos");
  const viewport = page.locator(".product-sheet-viewport");
  await viewport.waitFor();
  check(
    await page
      .locator(".product-sheet-footer")
      .textContent()
      .then((text) => /500\d lotes/.test(text)),
    "La base temporal carga más de 5000 lotes",
  );
  const mounted = async () =>
    page.locator(".product-sheet-grid tbody tr:not(.sheet-spacer)").count();
  check(
    (await mounted()) < 50,
    "El DOM inicial contiene únicamente la ventana visible y el margen",
  );
  check(
    Number(
      await page.locator(".product-sheet-grid").getAttribute("aria-rowcount"),
    ) > 5000,
    "La tabla anuncia el número total de filas a las ayudas de accesibilidad",
  );
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .click();
  await page.keyboard.press("ArrowDown");
  await page.locator('[data-active][data-sheet-row="1"]').waitFor();
  check(
    (await page.locator("[data-active]").getAttribute("data-sheet-row")) ===
      "1",
    "Flechas navegan con identidad estable",
  );
  for (const fraction of [0.25, 0.75, 1, 0.5, 0]) {
    await viewport.evaluate(
      (element, fraction) =>
        (element.scrollTop =
          (element.scrollHeight - element.clientHeight) * fraction),
      fraction,
    );
    await page.waitForTimeout(100);
    check(
      (await mounted()) < 50,
      `El DOM no crece acumulativamente al recorrer ${fraction * 100}%`,
    );
  }
  const firstCell = page.locator(
    '[data-sheet-row="0"][data-column-key="no_orden"]',
  );
  const firstBox = await firstCell.boundingBox(),
    viewportBox = await viewport.boundingBox();
  await page.mouse.move(
    firstBox.x + firstBox.width / 2,
    firstBox.y + firstBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    viewportBox.x + viewportBox.width - 4,
    firstBox.y + firstBox.height / 2,
    { steps: 5 },
  );
  await page.waitForTimeout(2000);
  await page.mouse.up();
  check(
    (await viewport.evaluate((element) => element.scrollLeft)) > 200,
    "Arrastrar cerca del borde horizontal desplaza hacia más columnas",
  );
  await viewport.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 0;
  });
  await firstCell.scrollIntoViewIfNeeded();
  await page.mouse.move(
    firstBox.x + firstBox.width / 2,
    firstBox.y + firstBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    firstBox.x + firstBox.width / 2,
    viewportBox.y + viewportBox.height - 4,
    { steps: 5 },
  );
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(100);
  check(
    await viewport.evaluate((element) => {
      const table = element.querySelector("table");
      const active = document.getElementById(table.getAttribute("aria-activedescendant"));
      return (
        table.contains(active) &&
        active.dataset.sheetRow === "0" &&
        [...table.querySelectorAll("[data-range]")].some(
          (cell) => Number(cell.dataset.sheetRow) > 25,
        )
      );
    }),
    "Arrastrar alcanza filas virtualizadas y conserva accesible la primera celda",
  );
  await viewport.evaluate((element) => (element.scrollTop = 0));
  await firstCell.waitFor();
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .click();
  for (let index = 0; index < 70; index++)
    await page.keyboard.press("ArrowDown");
  await page.locator('[data-active][data-sheet-row="70"]').waitFor();
  check(
    (await page.locator("[data-active]").getAttribute("data-sheet-row")) ===
      "70",
    "El teclado alcanza filas que estaban desmontadas",
  );
  check(
    (await page
      .locator("[data-active]")
      .evaluate((cell) => cell.closest("tr").getAttribute("aria-rowindex"))) ===
      "72",
    "La posición accesible de la fila es global, no la de la ventana virtual",
  );
  check(
    (await mounted()) < 50,
    "La navegación mantiene acotada la cantidad de filas montadas",
  );
  const top = await page.locator(".product-sheet-grid thead").boundingBox(),
    box = await viewport.boundingBox();
  check(
    Math.abs(top.y - box.y) < 3,
    "Los encabezados permanecen visibles durante el desplazamiento vertical",
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page
    .getByRole("button", { name: "Ocultar barra de herramientas" })
    .click();
  await page.screenshot({ path: "tests/evidence/aria/product-sheet-375.png" });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "El desplazamiento horizontal queda dentro de la hoja en móvil",
  );
  await viewport.evaluate((element) => (element.scrollLeft = 1500));
  check(
    (await viewport.evaluate((element) => element.scrollLeft)) > 1000,
    "Todas las columnas se desplazan horizontalmente",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Mostrar herramientas" }).click();
  await viewport.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 0;
  });
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .waitFor();
  await page.screenshot({ path: "tests/evidence/aria/product-sheet-1440.png" });
  const base = await (await page.request.get(origin + "/api/state")).json();
  const changes = base.lote_producto
    .filter((lot) => lot.numero_lote?.startsWith("VIRTUAL-"))
    .map((lot) => ({
      entity: "lote_producto",
      id: lot.id,
      field: "ubicacion",
      expected: lot.ubicacion,
      value: "Hoja masiva: " + "x".repeat(160),
    }));
  check(
    JSON.stringify(changes).length > 1024 * 1024,
    "El bloque de prueba supera 1 MB y conserva destinos estables",
  );
  const saved = await page.request.post(origin + "/api/commands", {
    data: { name: "saveProductOrderSheet", payload: { changes } },
    timeout: 60000,
  });
  check(
    saved.ok(),
    "El servidor guarda 5000 lotes en una sola operación atómica",
  );
  const after = await (await page.request.get(origin + "/api/state")).json();
  check(
    after.lote_producto
      .filter((lot) => lot.numero_lote?.startsWith("VIRTUAL-"))
      .every((lot) => lot.ubicacion === changes[0].value),
    "Se aplicaron todas las ubicaciones del bloque masivo",
  );
  return { checks };
};
