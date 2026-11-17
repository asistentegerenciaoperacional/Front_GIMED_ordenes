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
    await page.getByRole("menuitem", { name: option === "Nuevo lote" ? option : new RegExp(`^${option} [(][0-9]+[)]$`) }).click();
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
  check(
    (await page
      .getByRole("button", { name: "Seguimiento del producto", exact: true })
      .count()) === 0,
    "La hoja no contiene el menú de acciones del producto",
  );
  const lotCell = (name) =>
    page
      .locator('[data-column-key="numero_lote"]')
      .filter({ hasText: name })
      .first();
  await lotCell("HOJA-ESTADO-2").click();
  await choose("Estado del lote", "Cerrar lotes");
  let current = await waitLine("cerrada");
  check(
    (await confirm().count()) === 0,
    "Cerrar el último abierto no solicita confirmación por tolerancia",
  );
  check(
    current.lote_producto.find((lot) => lot.id === first.id).estado ===
      "cerrado",
    "El hermano cerrado conserva su estado",
  );
  await lotCell("HOJA-ESTADO-2").click();
  await choose("Estado del lote", "Reabrir lotes");
  await waitLine("en_seguimiento");
  check(
    JSON.stringify(await state()) === JSON.stringify(baseline),
    "Reabrir un lote restaura su estado sin modificar hermanos",
  );

  await lotCell("HOJA-ESTADO-2").click();
  await choose("Estado del lote", "Anular lotes");
  await confirm().waitFor();
  check(
    (await confirm().innerText()).includes("producto quedará cerrado"),
    "El aviso distingue el cierre del producto al quedar un hermano cerrado",
  );
  await confirm()
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  check(
    JSON.stringify(await state()) === JSON.stringify(baseline),
    "Cancelar conserva íntegra la base",
  );
  await choose("Estado del lote", "Anular lotes");
  await confirm()
    .getByRole("button", { name: "Anular lote", exact: true })
    .click();
  current = await waitLine("cerrada");
  await rows().first().waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".product-sheet-grid tbody tr[data-lot-state]")
        .length === 1,
  );
  await lotCell("HOJA-ESTADO-1").click();
  await choose("Estado del lote", "Anular lotes");
  await confirm().waitFor();
  check(
    (await confirm().innerText()).includes("también el producto"),
    "Anular el último no anulado explica la anulación del producto",
  );
  await confirm()
    .getByRole("button", { name: "Anular lote", exact: true })
    .click();
  current = await waitLine("anulada");
  await page.getByRole("button", { name: "Anuladas", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".product-sheet-grid tbody tr[data-lot-state]")
        .length === 3,
  );
  check(
    (await rows().count()) === 3,
    "Anuladas conserva los tres lotes con sus mismos datos",
  );
  await lotCell("HOJA-ESTADO-1").click();
  await page.getByRole("button", { name: "Estado del lote", exact: true }).click();
  const annulledCreate = page.getByRole("menuitem", { name: "Nuevo lote", exact: true });
  check(
    await annulledCreate.isEnabled(),
    "Nuevo lote está habilitado sobre un producto anulado",
  );
  await page.keyboard.press("Escape");
  await annulledCreate.waitFor({ state: "hidden" });
  await choose("Estado del lote", "Reabrir lotes");
  current = await waitLine("en_seguimiento");
  check(
    current.lote_producto.filter(
      (lot) => lot.id_orden_producto === line.id && lot.estado === "anulado",
    ).length === 2,
    "Reabrir el lote seleccionado deja anulados sus hermanos",
  );
  await page
    .getByRole("button", { name: "En seguimiento", exact: true })
    .click();
  await lotCell("HOJA-ESTADO-1").click();
  await choose("Estado del lote", "Nuevo lote");
  await page.waitForFunction(async (lineId) => {
    const snapshot = await (await fetch("/api/state")).json();
    return snapshot.lote_producto.filter((lot) => lot.id_orden_producto === lineId).length === 4;
  }, line.id);
  current = await state();
  check(
    current.lote_producto.filter((lot) => lot.id_orden_producto === line.id)
      .length === 4,
    "Nuevo lote desde la hoja crea una posición abierta sin duplicar recepción",
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
    "Los datos de los lotes originales permanecen intactos",
  );
  await page.reload();
  await page.locator(".product-order-sheet").waitFor();
  check(
    JSON.stringify(await state()) === JSON.stringify(current),
    "Recargar conserva los cambios persistidos",
  );
  await page.goto(
    origin +
      "/ordenes/productos?filtro=seguimiento_por_cerrar&q=" +
      order.no_orden,
  );
  await page.locator(".product-order-sheet").waitFor();
  check(
    (
      await page
        .getByRole("button", {
          name: "Filtro personalizado de la hoja",
          exact: true,
        })
        .innerText()
    ).includes("Sin filtro personalizado"),
    "El filtro retirado se interpreta como Sin filtro personalizado",
  );
  await page
    .getByRole("button", {
      name: "Filtro personalizado de la hoja",
      exact: true,
    })
    .click();
  check(
    (await page
      .getByRole("menuitemradio", {
        name: "Seguimiento por cerrar",
        exact: true,
      })
      .count()) === 0,
    "El filtro retirado no aparece en el menú",
  );
  await page.keyboard.press("Escape");
  check(
    errors.length === 0,
    "Sin errores de JavaScript durante las transiciones de la hoja",
  );
  return { checks };
};
