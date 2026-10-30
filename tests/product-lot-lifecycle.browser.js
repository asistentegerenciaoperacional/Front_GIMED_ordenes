async (page) => {
  // This journey answers every confirmation explicitly, including Cancelar.
  // The runner's legacy ariaPage adapter auto-accepts confirmations by default.
  page = page.context().pages()[0];
  page.setDefaultTimeout(12000);
  const origin = new URL(page.url()).origin;
  const checks = [],
    errors = [],
    screenshots = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw new Error(await response.text());
    return (await response.json()).result;
  };
  const same = (actual, expected, label) =>
    check(JSON.stringify(actual) === JSON.stringify(expected), label);
  const expectedStates = (source, lineId, lineState, states) => {
    const expected = structuredClone(source);
    expected.orden_producto.find((line) => line.id === lineId).estado =
      lineState;
    for (const lot of expected.lote_producto)
      if (lot.id_orden_producto === lineId && states[lot.id])
        lot.estado = states[lot.id];
    return expected;
  };
  const screenshot = async (name) => {
    const engine = page.context().browser().browserType().name();
    const path = `tests/evidence/aria/${engine}-lifecycle-${name}.png`;
    await page.screenshot({ path, fullPage: false });
    screenshots.push(path);
  };

  const initial = await state();
  const product = initial.productos.find(
    (item) =>
      item.activo &&
      initial.codigos_barras.some(
        (code) => code.id_producto === item.id && code.estado === "asignado",
      ),
  );
  check(!!product, "La base temporal tiene un producto utilizable");
  const invoice = initial.factura.find(
    (item) => item.id_proveedor === product.id_maquilador,
  );
  check(!!invoice, "La factura del fixture pertenece al proveedor de la orden");
  const order = await command("createOrder", {
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
  await command("authorizeOrder", { id: order.orderId, confirm: true });
  const created = await state();
  const line = created.orden_producto.find(
    (item) => item.id_orden_compra === order.orderId,
  );
  const original = created.lote_producto.find(
    (lot) => lot.id_orden_producto === line.id,
  );
  const first = (
    await command("saveLot", {
      row: {
        ...original,
        numero_lote: "LC-CERRADO",
        cantidad_recibida: 300,
        id_factura: invoice.id,
        estado: "cerrado",
        estado_batch_record: "validado",
        fecha_entrega_batch_record: "2099-02-16T12:00:00.000Z",
        estado_inspeccion: "aprobada",
        fecha_inspeccion: "2099-02-17T12:00:00.000Z",
        fecha_recepcion: "2099-02-18T12:00:00.000Z",
        fecha_confirmacion: "2099-02-19T12:00:00.000Z",
        ubicacion: "Bodega de prueba · conservar",
      },
    })
  ).row;
  const second = (
    await command("saveLot", {
      row: {
        ...first,
        id: undefined,
        numero_lote: "LC-ABIERTO",
        cantidad_recibida: 200,
        estado: "en_seguimiento",
      },
    })
  ).row;
  const third = (
    await command("saveLot", {
      row: {
        ...first,
        id: undefined,
        numero_lote: "LC-ANULADO",
        cantidad_recibida: 100,
        estado: "anulado",
      },
    })
  ).row;
  const ids = [first.id, second.id, third.id];
  const before = await state();
  const card = () => page.locator(".line-card").first();
  const lineDialog = (name) => page.getByRole("dialog", { name, exact: true });
  const form = (name) => lineDialog("Editar lote · " + name);
  const edit = async (name) => {
    await card()
      .getByRole("button", { name: "Editar lote " + name, exact: true })
      .click();
    await form(name).waitFor();
    return form(name);
  };
  const chooseState = async (dialog, value) => {
    await dialog.locator('[data-field-path="estado"]').click();
    await page.getByRole("option", { name: value, exact: true }).click();
  };
  const save = async (dialog) =>
    dialog.getByRole("button", { name: "Guardar lote", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/ordenes/" + order.orderId);
  await card().waitFor();
  check(
    (await page.locator(".lot-identity strong").count()) === 3,
    "El detalle clásico muestra los tres lotes conservados",
  );

  await card().getByRole("button", { name: "Anular", exact: true }).click();
  const cancelProduct = lineDialog("Anular producto");
  await cancelProduct.waitFor();
  check(
    (await cancelProduct.innerText()).includes(
      "Se conservarán sus identificadores",
    ),
    "La confirmación de anulación explica que conservará datos",
  );
  same(await state(), before, "Abrir la confirmación de anulación no escribe");
  await cancelProduct
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await cancelProduct.waitFor({ state: "hidden" });
  same(
    await state(),
    before,
    "Cancelar la anulación del producto conserva la base completa",
  );
  await card().getByRole("button", { name: "Anular", exact: true }).click();
  await cancelProduct
    .getByRole("button", { name: "Anular producto", exact: true })
    .click();
  await cancelProduct.waitFor({ state: "hidden" });
  const annulled = expectedStates(
    before,
    line.id,
    "anulada",
    Object.fromEntries(ids.map((id) => [id, "anulado"])),
  );
  same(
    await state(),
    annulled,
    "Anular producto cambia únicamente sus estados y conserva IDs, cantidades, factura, fechas, documentos y vínculos",
  );
  check(
    (await page.locator(".lot-identity strong").count()) === 3,
    "Anular el producto mantiene visibles sus tres lotes",
  );
  await screenshot("producto-anulado");

  await card().getByRole("button", { name: "Reabrir", exact: true }).click();
  const reopen = lineDialog("Reabrir producto");
  await reopen.waitFor();
  check(
    (await reopen.innerText()).includes(
      "incluidos los que estaban cerrados o anulados",
    ),
    "Reabrir advierte que todos los lotes pasarán a seguimiento",
  );
  await reopen.getByRole("button", { name: "Cancelar", exact: true }).click();
  await reopen.waitFor({ state: "hidden" });
  same(await state(), annulled, "Cancelar la reapertura tampoco escribe");
  await card().getByRole("button", { name: "Reabrir", exact: true }).click();
  await reopen
    .getByRole("button", { name: "Reabrir producto y lotes", exact: true })
    .click();
  await reopen.waitFor({ state: "hidden" });
  const reopened = expectedStates(
    before,
    line.id,
    "en_seguimiento",
    Object.fromEntries(ids.map((id) => [id, "en_seguimiento"])),
  );
  same(
    await state(),
    reopened,
    "Reabrir producto abre todos sus lotes, incluidos cerrados/anulados previos, sin recrear ni perder datos",
  );
  await page.reload();
  await card().waitFor();
  same(
    await state(),
    reopened,
    "Recargar conserva los mismos lotes y datos reabiertos",
  );
  await screenshot("producto-reabierto");

  for (const lot of [first, second]) {
    const dialog = await edit(lot.numero_lote);
    await chooseState(dialog, "Anulado");
    await save(dialog);
    await dialog.waitFor({ state: "hidden" });
    check(
      (await page.getByRole("alertdialog").count()) === 0,
      "Anular " +
        lot.numero_lote +
        " no requiere confirmar mientras quede otro lote activo",
    );
  }
  const partial = expectedStates(reopened, line.id, "en_seguimiento", {
    [first.id]: "anulado",
    [second.id]: "anulado",
  });
  same(
    await state(),
    partial,
    "Anular parte de los lotes conserva activo el producto y todos los demás datos",
  );
  const last = await edit(third.numero_lote);
  await last
    .locator('[data-field-path="ubicacion"]')
    .fill("Edición pendiente que solo debe guardarse al confirmar");
  await chooseState(last, "Anulado");
  await save(last);
  const confirmation = page.getByRole("alertdialog", {
    name: "Confirmar acción",
    exact: true,
  });
  await confirmation.waitFor();
  check(
    (await confirmation.innerText()).includes("también anulará el producto"),
    "El formulario del último lote explica la anulación del producto",
  );
  same(
    await state(),
    partial,
    "La primera solicitud del último lote no guarda ni su estado ni la ubicación pendiente",
  );
  await screenshot("ultimo-lote-confirmacion");
  await confirmation
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await confirmation.waitFor({ state: "hidden" });
  same(
    await state(),
    partial,
    "Cancelar la confirmación del último lote no escribe absolutamente ningún dato",
  );
  check(
    await last.isVisible(),
    "Cancelar conserva abierto el formulario del lote",
  );
  check(
      (await last.locator('[data-field-path="ubicacion"]').inputValue()) ===
      "Edición pendiente que solo debe guardarse al confirmar",
    "Cancelar conserva la edición pendiente para decidir después",
  );
  await save(last);
  await confirmation
    .getByRole("button", { name: "Anular lote y producto", exact: true })
    .click();
  await confirmation.waitFor({ state: "hidden" });
  await last.waitFor({ state: "hidden" });
  const saved = expectedStates(partial, line.id, "anulada", {
    [third.id]: "anulado",
  });
  saved.lote_producto.find((lot) => lot.id === third.id).ubicacion =
    "Edición pendiente que solo debe guardarse al confirmar";
  same(
    await state(),
    saved,
    "Confirmar guarda el último lote y anula el producto atómicamente sin modificar los lotes hermanos",
  );

  const selected = await edit(third.numero_lote);
  await chooseState(selected, "En seguimiento");
  await save(selected);
  await selected.waitFor({ state: "hidden" });
  const selectivelyReopened = expectedStates(saved, line.id, "en_seguimiento", {
    [third.id]: "en_seguimiento",
  });
  same(
    await state(),
    selectivelyReopened,
    "Reabrir un lote desde su formulario reactiva el producto y mantiene anulados los otros lotes",
  );
  await screenshot("lote-reabierto");
  same(
    errors,
    [],
    "Sin errores de JavaScript durante el ciclo clásico completo",
  );
  return {
    checks,
    screenshots,
    orderId: order.orderId,
    productLineId: line.id,
    lotIds: ids,
    pageErrors: errors,
  };
};
