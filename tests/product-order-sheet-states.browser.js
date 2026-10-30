async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(12000);
  const origin = new URL(page.url()).origin,
    checks = [],
    errors = [];
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
    fecha_solicitada_entrega: "2099-03-15T12:00:00.000Z",
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
    first = db.lote_producto.find((row) => row.id_orden_producto === line.id);
  await command("saveLot", {
    row: {
      ...first,
      numero_lote: "HOJA-ESTADO-1",
      cantidad_recibida: 500,
      ubicacion: "Bodega de prueba",
      estado: "cerrado",
    },
  });
  await command("saveLot", {
    row: {
      id_orden_producto: line.id,
      numero_lote: "HOJA-ESTADO-2",
      cantidad_recibida: 500,
      estado: "en_seguimiento",
    },
  });
  await command("saveLot", {
    row: {
      id_orden_producto: line.id,
      numero_lote: "HOJA-ESTADO-3",
      estado: "anulado",
    },
  });
  const baseline = await state(),
    lotIds = baseline.lote_producto
      .filter((lot) => lot.id_orden_producto === line.id)
      .map((lot) => lot.id);
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.goto(origin + "/ordenes/productos?q=" + order.no_orden);
  await page.locator(".product-order-sheet").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".product-sheet-grid tbody tr[data-lot-state]")
        .length === 2,
  );
  const cell = (index) =>
    page.locator(`[data-sheet-row="${index}"][data-column-key="numero_lote"]`);
  const rows = () =>
    page.locator(".product-sheet-grid tbody tr[data-lot-state]");
  const choose = async (menu, option) => {
    await page.getByRole("button", { name: menu, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  const confirm = () => page.getByRole("alertdialog");
  const waitLine = async (expected) => {
    await page.waitForFunction(
      async ({ id, expected }) => {
        const current = await (await fetch("/api/state")).json();
        return (
          current.orden_producto.find((row) => row.id === id)?.estado ===
            expected && !document.querySelector('[role="alertdialog"]')
        );
      },
      { id: line.id, expected },
    );
    const current = await state();
    check(
      current.orden_producto.find((row) => row.id === line.id).estado ===
        expected,
      `Producto en ${expected}`,
    );
    return current;
  };
  check(
    (await rows().count()) === 2,
    "Seguimiento muestra los lotes abierto y cerrado, excluyendo el anulado",
  );
  await cell(0).click();
  await choose("Seguimiento del producto", "Cerrar productos");
  await confirm().waitFor();
  check(
    (await confirm().innerText()).includes("-50.00 %"),
    "El cierre manual explica la desviación fuera del margen",
  );
  await confirm()
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  check(
    JSON.stringify(await state()) === JSON.stringify(baseline),
    "Cancelar el cierre por tolerancia no escribe",
  );
  await choose("Seguimiento del producto", "Cerrar productos");
  await confirm()
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  let closed = await waitLine("cerrada");
  check(
    closed.lote_producto
      .filter((lot) => lot.id_orden_producto === line.id)
      .every(
        (lot) =>
          lot.estado ===
          baseline.lote_producto.find((old) => old.id === lot.id).estado,
      ),
    "Cerrar el producto no cierra automáticamente sus lotes",
  );
  await cell(0).click();
  await choose("Seguimiento del producto", "Reabrir productos");
  await waitLine("en_seguimiento");
  check(
    JSON.stringify(await state()) === JSON.stringify(baseline),
    "Reabrir un producto cerrado conserva los estados y datos de sus lotes",
  );
  await cell(0).click();
  await cell(1).click({ modifiers: ["Shift"] });
  await choose("Estado del lote", "Anular lotes");
  await confirm().waitFor();
  check(
    (await confirm().innerText()).includes("producto"),
    "Anular los últimos lotes explica la anulación del producto",
  );
  check(
    JSON.stringify(await state()) === JSON.stringify(baseline),
    "Abrir la confirmación masiva no escribe",
  );
  await confirm()
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  check(
    JSON.stringify(await state()) === JSON.stringify(baseline),
    "Cancelar la anulación masiva conserva la base completa",
  );
  check(
    (await page.locator("[data-range]").count()) === 2,
    "Cancelar conserva el rango seleccionado",
  );
  await choose("Estado del lote", "Anular lotes");
  await confirm()
    .getByRole("button", { name: "Anular lotes y productos", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".product-sheet-grid tbody tr[data-lot-state]")
        .length === 0,
  );
  let current = await waitLine("anulada");
  check(
    current.lote_producto
      .filter((lot) => lot.id_orden_producto === line.id)
      .every((lot) => lot.estado === "anulado"),
    "Anular el conjunto anula sus lotes y producto atómicamente",
  );
  await page.getByRole("button", { name: "Anuladas", exact: true }).click();
  check(
    (await rows().count()) === 3,
    "Anuladas conserva las tres filas con sus mismos lotes",
  );
  await cell(0).click();
  await choose("Seguimiento del producto", "Reabrir productos");
  await confirm().waitFor();
  check(
    (await confirm().innerText()).includes("todos sus lotes"),
    "Reabrir producto anulado explica que incluye cerrados y anulados",
  );
  const cancelled = await state();
  await confirm()
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  check(
    JSON.stringify(await state()) === JSON.stringify(cancelled),
    "Cancelar la reapertura no modifica estados ni datos",
  );
  await choose("Seguimiento del producto", "Reabrir productos");
  await confirm()
    .getByRole("button", { name: "Reabrir productos y lotes", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".product-sheet-grid tbody tr[data-lot-state]")
        .length === 0,
  );
  current = await waitLine("en_seguimiento");
  check(
    current.lote_producto
      .filter((lot) => lot.id_orden_producto === line.id)
      .every((lot) => lot.estado === "en_seguimiento"),
    "Reabrir producto abre todos sus lotes conservados",
  );
  const withoutState = ({ estado, ...data }) => data;
  check(
    lotIds.every(
      (id) =>
        JSON.stringify(
          withoutState(baseline.lote_producto.find((lot) => lot.id === id)),
        ) ===
        JSON.stringify(
          withoutState(current.lote_producto.find((lot) => lot.id === id)),
        ),
    ),
    "Las acciones conservan íntegramente IDs, recepción, fechas, ubicación y demás datos",
  );
  await page
    .getByRole("button", { name: "En seguimiento", exact: true })
    .click();
  await cell(1).click();
  await choose("Estado del lote", "Anular lotes");
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".product-sheet-grid tbody tr[data-lot-state]")
        .length === 2,
  );
  current = await state();
  check(
    current.orden_producto.find((row) => row.id === line.id).estado ===
      "en_seguimiento",
    "Anular un lote conserva activo el producto mientras queden otros",
  );
  await page.getByRole("button", { name: "Anuladas", exact: true }).click();
  await cell(0).click();
  await choose("Estado del lote", "Reabrir lotes");
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".product-sheet-grid tbody tr[data-lot-state]")
        .length === 0,
  );
  current = await state();
  check(
    current.lote_producto
      .filter((lot) => lot.id_orden_producto === line.id)
      .every((lot) => lot.estado === "en_seguimiento"),
    "Reabrir un lote desde la hoja reactiva solo el destino y mantiene sus hermanos",
  );
  check(
    errors.length === 0,
    "Sin errores de JavaScript durante las transiciones de la hoja",
  );
  return { checks };
};
