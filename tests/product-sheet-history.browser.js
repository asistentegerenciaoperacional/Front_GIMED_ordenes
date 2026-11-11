async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(10000);
  const origin = new URL(page.url()).origin;
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw new Error(await response.text());
    return (await response.json()).result;
  };
  const db = await state();
  const product = db.productos.find(
    (item) =>
      item.activo &&
      db.codigos_barras.some(
        (code) => code.id_producto === item.id && code.estado === "asignado",
      ),
  );
  const { orderId } = await command("createOrder", {
    tipo_orden: "producto",
    id_proveedor: product.id_maquilador,
    fecha_solicitada_entrega: "2099-03-15T12:00:00.000Z",
    lines: [
      {
        id_producto: product.id,
        cantidad_solicitada: 100,
        precio_unitario: "2.50",
      },
    ],
  });
  await command("authorizeOrder", { id: orderId, confirm: true });
  const created = await state();
  const order = created.orden_compra.find((item) => item.id === orderId);
  const line = created.orden_producto.find(
    (item) => item.id_orden_compra === orderId,
  );
  const lot = created.lote_producto.find(
    (item) => item.id_orden_producto === line.id,
  );
  await command("saveLot", {
    row: { ...lot, numero_lote: "HIST-1", ubicacion: null },
  });
  await command("saveLot", {
    row: {
      id_orden_producto: line.id,
      numero_lote: "HIST-2",
      estado: "en_seguimiento",
    },
  });
  await page.evaluate(() => {
    localStorage.setItem("gimed:ui:product-order-sheet", "true");
    localStorage.setItem("gimed:ui:product-sheet-collapsed", "false");
  });
  await page.goto(origin + "/ordenes/productos?q=" + order.no_orden);
  const grid = page.locator(".product-sheet-grid");
  await grid.waitFor();
  const { sheetCell } = await import(
    (await import("node:url")).pathToFileURL(
      (await import("node:path")).resolve("tests/sheet-locator.mjs"),
    ).href
  );
  const cell = (row) => sheetCell(page, row, "ubicacion");
  const undo = page.getByRole("button", { name: "Deshacer", exact: true });
  const redo = page.getByRole("button", { name: "Rehacer", exact: true });
  const status = page.locator(".product-sheet-status");
  const checks = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const values = async (first, second, message) => {
    check(
      (await cell(0).textContent()).trim() === first &&
        (await cell(1).textContent()).trim() === second,
      message,
    );
  };
  const paste = async (text) => {
    await cell(0).click();
    await grid.evaluate((element, value) => {
      const data = new DataTransfer();
      data.setData("text/plain", value);
      element.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
      );
    }, text);
  };
  const edit = async (text) => {
    await cell(0).dblclick();
    const input = cell(0).getByRole("textbox", { name: "Ubicación" });
    await input.fill(text);
    await input.press("Enter");
  };

  check(
    (await undo.isDisabled()) && (await redo.isDisabled()),
    "Historial vacío al abrir",
  );
  await edit("A");
  await paste("B\nC");
  await values("B", "C", "El pegado cambia dos celdas");
  await page.keyboard.press("Control+z");
  await values("A", "", "Un solo deshacer revierte todo el pegado");
  await undo.click();
  await values("", "", "El segundo deshacer revierte la edición anterior");
  await cell(0).click();
  await page.keyboard.press("Control+y");
  await values("A", "", "Ctrl+Y rehace primero la edición individual");
  await page.keyboard.press("Control+Shift+z");
  await values("B", "C", "Ctrl+Mayús+Z rehace el pegado completo");

  await undo.click();
  await edit("A");
  check(await redo.isEnabled(), "Confirmar el mismo valor conserva el futuro");
  await redo.click();
  await values("B", "C", "El pegado sigue disponible después del no-op");
  await cell(0).click();
  await cell(1).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Delete");
  await values("", "", "Suprimir limpia el rango seleccionado");
  await undo.click();
  await values("B", "C", "Un solo deshacer restaura el rango borrado");

  await undo.click();
  await edit("D");
  check(await redo.isDisabled(), "La nueva edición elimina el futuro");
  await undo.click();
  await values("A", "", "La edición previa sigue en el historial");
  await redo.click();
  await values("D", "", "Rehacer sigue la rama nueva");

  const save = page.getByRole("button", { name: /^Guardar 1 cambios$/ });
  await page.route("**/api/commands", (route) =>
    route.request().postDataJSON().name === "saveProductOrderSheet"
      ? route.fulfill({
          status: 409,
          json: { message: "Conflicto de prueba", code: "SHEET_CHANGED" },
        })
      : route.continue(),
  );
  await save.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Conflicto de prueba" })
    .waitFor();
  await undo.click();
  await values(
    "A",
    "",
    "El fallo de Guardar conserva el borrador y el historial",
  );
  await redo.click();
  await page.unroute("**/api/commands");
  await save.click();
  await status.filter({ hasText: "Sin cambios pendientes" }).waitFor();
  check(
    (await undo.isDisabled()) && (await redo.isDisabled()),
    "Guardar cierra ambas pilas",
  );
  check(
    (await state()).lote_producto.find((item) => item.id === lot.id)
      .ubicacion === "D",
    "Solo Guardar persiste la edición",
  );

  await edit("E");
  await undo.click();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  check(
    (await undo.isDisabled()) && (await redo.isDisabled()),
    "Descartar cierra el futuro aun con el borrador vacío",
  );
  await values("D", "", "Descartar conserva el dato guardado");
  return { checks };
};
