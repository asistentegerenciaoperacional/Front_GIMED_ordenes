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
    await page.getByRole("menuitem", { name: option, exact: true }).click();
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
  check(await confirm().locator(".dialog-item-list li").count() === 0,
    "El aviso sin anulación de producto no muestra una lista de afectados");
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
  const affected = confirm().locator(".dialog-item-list li");
  check(await affected.count() === 1 && (await affected.innerText()).includes(order.no_orden) && (await affected.innerText()).includes(product.nombre_producto),
    "El último lote muestra el producto y su OC como elemento de lista");
  const listStyleMatches = await confirm().evaluate((dialog) => {
    const message = getComputedStyle(dialog.querySelector(".dialog-body > p"));
    const item = getComputedStyle(dialog.querySelector(".dialog-item-list li"));
    return ["fontFamily", "fontSize", "fontWeight", "lineHeight", "color"].every((key) => message[key] === item[key]);
  });
  check(listStyleMatches, "La lista comparte el estilo de texto del diálogo");
  await confirm()
    .getByRole("button", { name: "Anular lote", exact: true })
    .click();
  current = await waitLine("anulada");
  return { checks };
};
