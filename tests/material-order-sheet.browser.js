async (page) => {
  page = page.context().pages()[0];
  const origin = new URL(page.url()).origin;
  const checks = [];
  const check = (value, label) => {
    if (!value) throw Error(label);
    checks.push(label);
  };
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw Error(await response.text());
  };
  const { sheetCell } = await import(
    (await import("node:url")).pathToFileURL(
      (await import("node:path")).resolve("tests/sheet-locator.mjs"),
    ).href
  );
  const cell = (row, key) => sheetCell(page, row, key);
  const grid = page.getByRole("grid", {
    name: "Órdenes de materiales por renglón",
  });
  const toolbar = (label) =>
    page.getByRole("button", { name: label, exact: true });
  const viewport = page.locator(".product-sheet-viewport");
  const paste = (value) =>
    viewport.evaluate((element, value) => {
      const data = new DataTransfer();
      data.setData("text/plain", value);
      element.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
      );
    }, value);
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto(origin + "/ordenes/materiales");
  await page.locator(".orders-table").waitFor();
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.goto(origin + "/ordenes/materiales?vista=no_autorizadas");
  await grid.waitFor();
  check(
    (await grid.getAttribute("aria-colcount")) === "10",
    "Una preferencia activa OCM y la vista sin autorizar tiene diez columnas",
  );
  await toolbar("Filtrar tipo de orden").click();
  await page.getByRole("option", { name: "Otros", exact: true }).click();
  check(
    (await cell(0, "item").innerText()).includes("Servicio"),
    "El filtro de tipo incluye el concepto de Otros",
  );
  await cell(0, "item").dblclick();
  const concept = page.getByRole("textbox", {
    name: "Material o concepto",
    exact: true,
  });
  await concept.fill("Servicio verificado");
  await concept.press("Enter");
  await toolbar("Guardar 1 cambios").click();
  await page.getByText("Sin cambios pendientes", { exact: true }).waitFor();
  check(
    (await state()).orden_otro[0].producto === "Servicio verificado",
    "Guardar persiste el concepto antes de autorizar",
  );
  await cell(0, "no_orden").click();
  await toolbar("Autorizar 1 OCM").click();
  const auth = page.getByRole("dialog", {
    name: "Autorizar órdenes (1)",
    exact: true,
  });
  await auth.locator("label.aria-checkbox").click();
  await auth.getByRole("button", { name: "Confirmar autorización" }).click();
  await auth.waitFor({ state: "hidden" });
  await toolbar("En seguimiento").click();
  await cell(0, "item").waitFor();
  check(
    (await cell(0, "item").getAttribute("aria-readonly")) === "true",
    "Otros queda bloqueado después de autorizar",
  );
  await cell(0, "no_orden").click();
  await toolbar("Editar orden").click();
  const editOrder = page.getByRole("dialog", { name: /Editar orden/ });
  await editOrder.waitFor();
  check(
    await editOrder
      .locator('input[data-field-path="lines.0.producto"]')
      .isDisabled(),
    "El formulario de detalle protege el mismo concepto",
  );
  await editOrder
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await toolbar("Acciones de renglón").click();
  await page
    .getByRole("menuitem", { name: "Registrar/editar recepción" })
    .click();
  const receipt = page.getByRole("dialog", { name: /Recepción del concepto/ });
  await receipt.locator('input[data-field-path="cantidad_recibida"]').fill("1");
  await receipt.getByRole("button", { name: "Guardar recepción" }).click();
  await receipt.waitFor({ state: "hidden" });
  check(
    (await state()).orden_otro[0].cantidad_recibida === 1,
    "El formulario registra la única recepción de Otros",
  );
  await page.goto(origin + "/ordenes/materiales?q=1601");
  await grid.waitFor();
  check(
    (await grid.getAttribute("aria-colcount")) === "16",
    "Seguimiento muestra las 16 columnas acordadas",
  );
  await toolbar("Filtro personalizado de la hoja").click();
  await page.getByRole("menuitemradio", { name: "Sin OC vinculadas" }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".product-sheet-grid")
        ?.getAttribute("aria-rowcount") === "1",
  );
  await toolbar("Limpiar filtros").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".product-sheet-grid")
        ?.getAttribute("aria-rowcount") === "3",
  );
  check(true, "El filtro de vínculos se aplica a cada renglón de Material");
  check(
    (await cell(0, "id_lote_material").innerText()).trim() === "MAT-26-041" &&
      (await cell(1, "id_lote_material").innerText()).trim() === "MAT-26-041",
    "Dos renglones muestran el mismo lote de material",
  );
  const [first, second] = (await state()).orden_material.filter(
    (line) => line.id_lote_material,
  );
  await cell(0, "cantidad_recibida").click();
  await paste("25");
  await page.reload();
  await page
    .getByRole("dialog", { name: "Cambios pendientes en este navegador" })
    .getByRole("button", { name: "Recuperar" })
    .click();
  check(
    (await cell(0, "cantidad_recibida").innerText()).trim() === "25",
    "Recuperar repone el borrador de OCM",
  );
  check(
    (await state()).orden_material.find((line) => line.id === first.id)
      .cantidad_recibida === first.cantidad_recibida,
    "Recuperar no escribe la recepción",
  );
  await toolbar("Guardar 1 cambios").click();
  await page.getByText("Sin cambios pendientes", { exact: true }).waitFor();
  check(
    (await state()).orden_material.find((line) => line.id === second.id)
      .cantidad_recibida === second.cantidad_recibida,
    "El lote compartido conserva la segunda recepción",
  );
  await cell(0, "no_orden").click();
  await toolbar("Acciones de renglón").click();
  const certificate = page.getByRole("menuitem", {
    name: "Ver certificado de calidad",
  });
  const [certificatePage] = await Promise.all([
    page.waitForEvent("popup"),
    certificate.click(),
  ]);
  await certificatePage.waitForLoadState();
  check(
    certificatePage.url().includes("/api/documents/"),
    "El menú abre el certificado vigente del lote",
  );
  await certificatePage.close();
  const linked = cell(0, "vinculos").getByRole("button", { name: /^OC / });
  await linked.first().click();
  await page.getByRole("link", { name: "Volver a órdenes" }).click();
  await grid.waitFor();
  check(
    new URL(page.url()).searchParams.get("q") === "1601",
    "Volver desde la OC vinculada conserva la consulta",
  );
  await cell(0, "no_orden").click();
  await toolbar("Imprimir").click();
  await page.waitForURL(/\/imprimir\?/);
  await page.getByRole("link", { name: "Volver a órdenes" }).click();
  await grid.waitFor();
  check(
    new URL(page.url()).searchParams.get("q") === "1601",
    "Volver de impresión restaura la hoja filtrada",
  );
  await cell(0, "no_orden").click();
  await toolbar("Acciones de renglón").click();
  await page.getByRole("menuitem", { name: "Cerrar (1)" }).click();
  await grid.locator('tr[data-lot-state="cerrado"]').waitFor();
  await cell(0, "no_orden").click();
  await cell(1, "no_orden").click({ modifiers: ["Shift"] });
  await toolbar("Acciones de renglón").click();
  await page.getByRole("menuitem", { name: "Anular (1)" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmar" })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".product-sheet-grid")
        ?.getAttribute("aria-rowcount") === "2",
  );
  await toolbar("Anuladas").click();
  await grid.locator('tr[data-lot-state="anulado"]').waitFor();
  await cell(0, "no_orden").click();
  await toolbar("Acciones de renglón").click();
  await page.getByRole("menuitem", { name: "Reabrir (1)" }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".product-sheet-grid")
        ?.getAttribute("aria-rowcount") === "1",
  );
  check(
    (await state()).orden_material.find((line) => line.id === second.id)
      .estado === "en_seguimiento",
    "La acción múltiple omite cerrados y permite reabrir desde Anuladas",
  );
  await toolbar("En seguimiento").click();
  await cell(1, "cantidad_recibida").click();
  await paste("31");
  await command("saveReceipt", {
    entity: "orden_material",
    id: second.id,
    row: { cantidad_recibida: 32 },
  });
  await toolbar("Guardar 1 cambios").click();
  await page
    .getByText(/Los datos cambiaron desde/)
    .first()
    .waitFor();
  check(
    (await toolbar("Guardar 1 cambios").count()) === 1,
    "Un conflicto conserva el borrador",
  );
  await page.goto(origin + "/ordenes/materiales?vista=no_autorizadas");
  const recovery = page.getByRole("dialog", {
    name: "Cambios pendientes en este navegador",
  });
  await recovery.getByRole("button", { name: "Descartar copia" }).click();
  const before = await state();
  const unapproved = before.orden_compra.find(
    (order) => order.no_orden === "1602",
  );
  const original = before.orden_material.find(
    (line) => line.id_orden_compra === unapproved.id,
  );
  await command("editOrder", {
    ...unapproved,
    fecha_solicitada_entrega: "2026-10-14T12:00:00.000Z",
    lines: [
      original,
      {
        id_material: before.materiales.find(
          (material) => material.id !== original.id_material,
        ).id,
        cantidad_solicitada: 7393,
        precio_unitario: "20.00",
      },
    ],
  });
  await page.reload();
  await page
    .getByRole("searchbox", { name: "Buscar en la hoja de OC" })
    .fill("7393");
  await cell(0, "no_orden").click();
  await toolbar("Autorizar 1 OCM").click();
  await auth.locator("label.aria-checkbox").click();
  await auth.getByRole("button", { name: "Confirmar autorización" }).click();
  await auth.waitFor({ state: "hidden" });
  const authorized = await state();
  check(
    authorized.orden_compra.find((order) => order.id === unapproved.id)
      .estado_autorizacion === "autorizada" &&
      authorized.orden_material.filter(
        (line) => line.id_orden_compra === unapproved.id,
      ).length === 2,
    "La autorización incluye los renglones ocultos por búsqueda",
  );
  return { checks };
};
