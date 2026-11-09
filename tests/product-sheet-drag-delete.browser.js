async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(12000);
  const checks = [],
    errors = [],
    origin = new URL(page.url()).origin;
  const check = (value, label) => {
    if (!value) throw new Error(label);
    checks.push(label);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw new Error(await response.text());
    return (await response.json()).result;
  };
  let db = await state();
  const product = db.productos.find(
    (p) =>
      p.activo &&
      db.codigos_barras.some(
        (code) => code.id_producto === p.id && code.estado === "asignado",
      ),
  );
  const created = await command("createOrder", {
    tipo_orden: "producto",
    id_proveedor: product.id_maquilador,
    fecha_solicitada_entrega: "2099-02-15T12:00:00.000Z",
    lines: [
      {
        id_producto: product.id,
        cantidad_solicitada: 1000,
        precio_unitario: "2.50",
      },
    ],
  });
  await command("authorizeOrder", { id: created.orderId, confirm: true });
  db = await state();
  const order = db.orden_compra.find((row) => row.id === created.orderId),
    line = db.orden_producto.find((row) => row.id_orden_compra === order.id),
    lot = db.lote_producto.find((row) => row.id_orden_producto === line.id);
  await command("saveLot", {
    row: {
      ...lot,
      numero_lote: "DRAG-A",
      ubicacion: "Bogotá",
      cantidad_recibida: 400,
    },
  });
  await command("saveLot", {
    row: {
      id_orden_producto: line.id,
      numero_lote: "DRAG-B",
      ubicacion: "Cali",
    },
  });
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.goto(origin + "/ordenes/productos?q=" + order.no_orden);
  const { sheetCell, revealSheetColumn } = await import(
    (await import("node:url")).pathToFileURL(
      (await import("node:path")).resolve("tests/sheet-locator.mjs"),
    ).href
  );
  const cell = (row, key) => sheetCell(page, row, key);
  await cell(0, "ubicacion").waitFor();
  await cell(0, "ubicacion").scrollIntoViewIfNeeded();
  check(
    (await cell(0, "ubicacion").evaluate(
      (el) => getComputedStyle(el).cursor,
    )) === "crosshair",
    "El cursor dentro de las celdas es crosshair",
  );
  await cell(0, "fecha_confirmacion").scrollIntoViewIfNeeded();
  const corner = await cell(0, "fecha_confirmacion").boundingBox(),
    opposite = await cell(1, "ubicacion").boundingBox();
  await page.mouse.move(
    corner.x + corner.width / 2,
    corner.y + corner.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    opposite.x + opposite.width / 2,
    opposite.y + opposite.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-range]").length === 4,
  );
  check(
    (await page.locator("[data-range]").count()) === 4 &&
      (await cell(0, "fecha_confirmacion").getAttribute("data-active")) === "true",
    "Arrastrar selecciona un rectángulo y conserva activa la primera celda",
  );
  await cell(0, "ubicacion").scrollIntoViewIfNeeded();
  const a = await cell(0, "ubicacion").boundingBox(),
    b = await cell(1, "ubicacion").boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-range]").length === 2,
  );
  check(
    (await page.locator("[data-range]").count()) === 2,
    "Arrastrar selecciona ambas celdas sin perder el rango al soltar",
  );
  await page.keyboard.press("Delete");
  check(
    (await cell(0, "ubicacion").innerText()).trim() === "" &&
      (await cell(1, "ubicacion").innerText()).trim() === "",
    "Delete vacía ambas celdas seleccionadas",
  );
  check(
    await page
      .getByRole("button", { name: "Guardar 2 cambios", exact: true })
      .isVisible(),
    "Los dos borrados quedan pendientes de guardar",
  );
  check(
    (await state()).lote_producto.find((row) => row.id === lot.id).ubicacion ===
      "Bogotá",
    "Borrar no guarda automáticamente",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  await cell(0, "ubicacion").click();
  await page.keyboard.press("Delete");
  check(
    (await cell(0, "ubicacion").innerText()).trim() === "" &&
      (await cell(1, "ubicacion").innerText()).trim() === "Cali",
    "Delete sobre una celda no modifica su vecina",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  await cell(0, "ubicacion").click();
  await page.locator(".product-sheet-viewport").evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Supr",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    (await cell(0, "ubicacion").innerText()).trim() === "",
    "La variante Supr también vacía la celda activa",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  await cell(0, "ubicacion").click();
  await page.locator(".product-sheet-viewport").evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Del",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    (await cell(0, "ubicacion").innerText()).trim() === "",
    "La variante Del también vacía la celda activa",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  await cell(0, "cantidad_recibida").click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Delete");
  check(
    (await cell(0, "cantidad_recibida").innerText()).trim() === "" &&
      (await cell(0, "precio_unitario").innerText()).includes("2,50"),
    "Un rango mixto vacía la cantidad opcional y conserva el precio obligatorio",
  );
  check(
    (await page
      .locator('[data-column-key="precio_unitario"][data-rejected]')
      .count()) === 1,
    "El precio obligatorio rechazado se identifica",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  await cell(0, "numero_lote").click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Delete");
  check(
    (await cell(0, "numero_lote").innerText()).trim() === "DRAG-A",
    "El lote obligatorio conserva su valor inválido al intentar vaciarlo",
  );
  check(
    (await page
      .locator('[data-column-key="codigo"][data-rejected]')
      .count()) === 1,
    "La celda protegida se señala sin modificarla",
  );
  check(
    (await page
      .locator('[data-column-key="numero_lote"][data-rejected]')
      .count()) === 1,
    "El valor obligatorio inválido se señala",
  );
  await cell(0, "ubicacion").dblclick();
  const input = page.getByRole("textbox", { name: "Ubicación", exact: true });
  await input.waitFor();
  await input.fill("ABC");
  await input.press("Home");
  await input.press("Delete");
  check(
    (await input.inputValue()) === "BC",
    "Delete conserva la edición normal dentro del campo",
  );
  await input.press("Escape");
  check(errors.length === 0, "Sin errores de JavaScript");
  return { checks };
};
