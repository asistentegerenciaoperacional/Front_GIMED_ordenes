async (page) => {
  page.setDefaultTimeout(12000);
  const origin = new URL(page.url()).origin,
    checks = [],
    errors = [];
  const check = (valid, name) => {
    if (!valid) throw new Error(name);
    checks.push(name);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  await page.goto(origin + "/ordenes/productos");
  check(
    !(await page.locator(".product-order-sheet").count()),
    "La hoja está desactivada por defecto",
  );
  await page.goto(origin + "/configuracion");
  await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Vista alternativa de la tabla de OC de productos",
    })
    .check();
  await page.goto(origin + "/ordenes/productos");
  await page.locator(".product-sheet-grid").waitFor();
  check(
    Number(
      await page.locator(".product-sheet-grid").getAttribute("aria-colcount"),
    ) === 25,
    "Seguimiento presenta las 25 columnas",
  );
  check(
    !(await page.locator(".stats-grid").count()),
    "No hay tarjetas de resumen en la hoja",
  );
  const first = page.locator(
    '[data-sheet-row="0"][data-column-key="precio_unitario"]',
  );
  const lotKey = await first.getAttribute("data-sheet-key");
  await first.dblclick();
  const editor = page.getByRole("textbox", {
    name: "Precio unitario",
    exact: true,
  });
  await editor.fill("9001,00");
  await editor.press("Enter");
  check(
    (await state()).lote_producto.some((lot) => "lot:" + lot.id === lotKey),
    "La selección tiene identidad de lote estable",
  );
  check(
    (await page.getByRole("button", { name: /Guardar 1 cambios/ }).count()) ===
      1,
    "Editar prepara un borrador sin guardar",
  );
  await page.getByRole("button", { name: /Guardar 1 cambios/ }).click();
  await page.getByText("Sin cambios pendientes", { exact: false }).waitFor();
  const after = await state(),
    lot = after.lote_producto.find((lot) => "lot:" + lot.id === lotKey);
  check(
    after.orden_producto.find((line) => line.id === lot.id_orden_producto)
      .precio_unitario === "9001.00",
    "Guardar aplica la edición al renglón de producto",
  );
  await page
    .getByRole("button", { name: "No autorizadas", exact: true })
    .click();
  check(
    Number(
      await page.locator(".product-sheet-grid").getAttribute("aria-colcount"),
    ) === 10,
    "No autorizadas presenta diez columnas",
  );
  await page.getByRole("button", { name: "Anuladas", exact: true }).click();
  check(
    (await page
      .locator('.product-sheet-grid tbody tr[data-lot-state="anulado"]')
      .count()) > 0,
    "Anuladas conserva los lotes anulados",
  );
  await page.goto(origin + "/ordenes/materiales");
  check(
    !(await page.locator(".product-order-sheet").count()),
    "OCM mantiene su tabla clásica",
  );
  check(errors.length === 0, "Sin errores de página: " + errors.join("; "));
  return { checks };
};
