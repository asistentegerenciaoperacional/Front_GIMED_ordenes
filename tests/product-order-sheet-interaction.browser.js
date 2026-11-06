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
  const initial = await state(),
    product = initial.productos.find(
      (p) =>
        p.activo &&
        initial.codigos_barras.some(
          (code) => code.id_producto === p.id && code.estado === "asignado",
        ),
    );
  const create = async (qty = 500) =>
    command("createOrder", {
      tipo_orden: "producto",
      id_proveedor: product.id_maquilador,
      fecha_solicitada_entrega: "2099-02-15T12:00:00.000Z",
      lines: [
        {
          id_producto: product.id,
          cantidad_solicitada: 1000,
          precio_unitario: "2.50",
        },
        {
          id_producto: product.id,
          cantidad_solicitada: qty,
          precio_unitario: "3.00",
        },
      ],
    });
  const order = await create();
  await command("authorizeOrder", { id: order.orderId, confirm: true });
  let db = await state();
  const owner = db.orden_compra.find((o) => o.id === order.orderId),
    lines = db.orden_producto.filter(
      (line) => line.id_orden_compra === owner.id,
    );
  const first = db.lote_producto.find(
      (lot) => lot.id_orden_producto === lines[0].id,
    ),
    third = db.lote_producto.find(
      (lot) => lot.id_orden_producto === lines[1].id,
    );
  await command("saveDocument", {
    tipo_entidad: "orden_compra",
    id_entidad: owner.id,
    tipo_documento: "orden_compra_escaneada",
    nombre_archivo: "OC-HOJA.html",
  });
  await command("saveLot", {
    row: {
      ...first,
      numero_lote: "HOJA-A",
      estado: "cerrado",
      cantidad_recibida: 400,
      ubicacion: "Bogotá hoja exclusiva",
    },
  });
  await command("saveLot", {
    row: {
      id_orden_producto: lines[0].id,
      numero_lote: "HOJA-B",
      cantidad_recibida: 100,
    },
  });
  await command("saveLot", { row: { ...third, numero_lote: "HOJA-C" } });
  const pending = await create(733),
    pendingOwner = (await state()).orden_compra.find(
      (o) => o.id === pending.orderId,
    );
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/ordenes/productos?q=" + owner.no_orden);
  await page.locator(".product-sheet-grid").waitFor();
  const { sheetCell, revealSheetColumn } = await import(
    (await import("node:url")).pathToFileURL(
      (await import("node:path")).resolve("tests/sheet-locator.mjs"),
    ).href
  );
  const cell = (row, key) => sheetCell(page, row, key);
  const grid = () => page.locator(".product-sheet-viewport");
  const search = () =>
    page.getByRole("searchbox", { name: "Buscar en la hoja de OC" });
  const paste = async (value) =>
    grid().evaluate((element, value) => {
      const data = new DataTransfer();
      data.setData("text/plain", value);
      element.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
      );
    }, value);
  const text = async (row, key) => (await cell(row, key).innerText()).trim();
  check(
    (await text(1, "cantidad_solicitada")) === "600",
    "El segundo lote muestra solicitada menos las 400 recibidas antes",
  );
  await cell(0, "precio_unitario").click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-range]").length === 2,
  );
  check(
    (await page.locator("[data-range]").count()) === 2,
    "Shift+flechas selecciona un rango rectangular",
  );
  await page.evaluate(() => {
    window.__sheetCopiedText = "";
    document.addEventListener(
      "copy",
      (event) => {
        window.__sheetCopiedText = event.clipboardData.getData("text/plain");
      },
      { once: true },
    );
  });
  await page.keyboard.press("Control+C");
  check(
    (await page.evaluate(() => window.__sheetCopiedText)).split("\n").length ===
      2,
    "Ctrl+C copia una matriz compatible con Excel",
  );
  await paste("5,00\n6,00");
  check(
    (await page.locator('[data-column-key="precio_unitario"][data-rejected]').count()) === 2,
    "Dos precios contradictorios del mismo renglón se rechazan",
  );
  check(
    (await state()).orden_producto.find((line) => line.id === lines[0].id)
      .precio_unitario === "2.50",
    "Pegar no guarda automáticamente",
  );
  await paste("5,00\n5,00");
  check(
    (await page
      .getByRole("button", { name: "Guardar 1 cambios", exact: true })
      .count()) === 1,
    "El mismo dato pegado en dos lotes se deduplica",
  );
  check(
    (await text(0, "precio_unitario")).includes("5,00") &&
      (await text(1, "precio_unitario")).includes("5,00"),
    "La edición del renglón se propaga a ambos lotes",
  );
  await search().fill("Bogotá hoja exclusiva");
  check(
    await page
      .locator(".product-sheet-footer")
      .textContent()
      .then((text) => text.startsWith("1 lotes")),
    "La búsqueda filtra la ubicación",
  );
  check(
    (await page.locator("[data-active]").count()) === 0,
    "Cambiar búsqueda limpia la selección y conserva el borrador",
  );
  await cell(0, "ubicacion").dblclick();
  const location = page.getByRole("textbox", {
    name: "Ubicación",
    exact: true,
  });
  await location.fill("Cali hoja exclusiva");
  await location.press("Enter");
  check(
    (await cell(0, "ubicacion").count()) === 1,
    "La fila permanece visible mientras se edita un valor usado por el filtro",
  );
  await search().fill("Cali hoja exclusiva");
  check(
    (await cell(0, "ubicacion").count()) === 1,
    "Volver a aplicar búsqueda usa los valores del borrador",
  );
  await page
    .getByRole("button", { name: "Guardar 2 cambios", exact: true })
    .click();
  await page.getByText("Sin cambios pendientes", { exact: false }).waitFor();
  check(
    (await state()).lote_producto.find((lot) => lot.id === first.id)
      .ubicacion === "Cali hoja exclusiva",
    "Guardar persiste cabecera/renglón/lote sin depender de la posición",
  );
  await search().fill(owner.no_orden);
  await cell(0, "fecha_solicitada_entrega").dblclick();
  let date = cell(0, "fecha_solicitada_entrega").getByRole("textbox");
  await date.fill("30/12/2099");
  await date.press("Enter");
  check(
    (await text(0, "fecha_solicitada_entrega")) === "30/12/2099" &&
      (await text(2, "fecha_solicitada_entrega")) === "30/12/2099",
    "Una fecha de cabecera se propaga a todos los renglones y lotes de la OC",
  );
  await cell(0, "fecha_estimada_batch_record").dblclick();
  await cell(0, "fecha_estimada_batch_record")
    .getByRole("button")
    .last()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  check(
    (await page.locator("[data-active]").getAttribute("data-sheet-row")) ===
      "0",
    "Elegir una fecha en el calendario no salta también de celda",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  const recovery = page.getByRole("dialog", {
    name: "Cambios pendientes en este navegador",
  });
  await recovery.waitFor();
  check(
    (await state()).orden_compra.find((o) => o.id === owner.id)
      .fecha_solicitada_entrega !== "2099-12-30T12:00:00.000Z",
    "La copia de recuperación no se guardó en la base",
  );
  await recovery.getByRole("button").first().click();
  await cell(0, "precio_unitario").dblclick();
  const temporaryPrice = page.getByRole("textbox", {
    name: "Precio unitario",
    exact: true,
  });
  await temporaryPrice.fill("123,00");
  await temporaryPrice.press("Enter");
  await page
    .getByRole("button", { name: "Revisar copia guardada", exact: true })
    .click();
  await recovery
    .getByRole("button", { name: "Recuperar", exact: true })
    .click();
  check(
    !(await text(0, "precio_unitario")).includes("123,00"),
    "Recuperar sustituye las ediciones de la sesión actual en lugar de mezclarlas",
  );
  check(
    (await page
      .getByRole("button", { name: "Guardar 1 cambios", exact: true })
      .count()) === 1,
    "Recuperar devuelve el borrador al modo de edición sin guardarlo",
  );
  db = await state();
  await command("editOrder", {
    ...db.orden_compra.find((o) => o.id === owner.id),
    fecha_solicitada_entrega: "2099-03-01T12:00:00.000Z",
    lines: db.orden_producto.filter(
      (line) => line.id_orden_compra === owner.id,
    ),
  });
  await page
    .getByRole("button", { name: "Guardar 1 cambios", exact: true })
    .click();
  await page
    .getByText(/Los datos cambiaron desde que comenzaste/)
    .first()
    .waitFor();
  check(
    (await page
      .getByRole("button", { name: "Guardar 1 cambios", exact: true })
      .count()) === 1,
    "Un conflicto concurrente conserva el borrador y bloquea la escritura",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  await page.getByRole("button", { name: "Columnas", exact: true }).click();
  await page
    .locator(".product-sheet-column-menu label")
    .filter({ hasText: /^Factura$/ })
    .click();
  await page.keyboard.press("Escape");
  check(
    Number(
      await page.locator(".product-sheet-grid").getAttribute("aria-colcount"),
    ) === 23,
    "El menú oculta una columna de esta hoja",
  );
  await page.reload();
  await page.locator(".product-sheet-grid").waitFor();
  check(
    Number(
      await page.locator(".product-sheet-grid").getAttribute("aria-colcount"),
    ) === 23,
    "Las columnas visibles persisten al recargar",
  );
  await page
    .getByRole("button", { name: "No autorizadas", exact: true })
    .click();
  await search().fill("733");
  await cell(0, "id_producto").click();
  check(
    await page
      .locator(".product-sheet-status")
      .textContent()
      .then((text) => text.includes("OC completas seleccionadas")),
    "Autorizar selecciona la OC completa aunque el filtro oculte un renglón",
  );
  check(
    Number(
      await page.locator(".product-sheet-grid").getAttribute("aria-colcount"),
    ) === 9,
    "La visibilidad de columnas es independiente para No autorizadas",
  );
  await page.getByRole("button", { name: "Más acciones de órdenes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Autorizar 1 OC", exact: true }).click();
  const authorization = page.getByRole("dialog", {
    name: "Autorizar órdenes",
    exact: true,
  });
  await authorization.waitFor();
  await authorization.locator("label.aria-checkbox").click();
  await authorization
    .getByRole("button", { name: "Confirmar autorización", exact: true })
    .click();
  await authorization.waitFor({ state: "hidden" });
  check(
    (await state()).orden_compra.find((o) => o.id === pendingOwner.id)
      .estado_autorizacion === "autorizada",
    "La firma autoriza toda la cabecera, no solo el renglón visible",
  );
  await page
    .getByRole("button", { name: "En seguimiento", exact: true })
    .click();
  await search().fill(owner.no_orden);
  await cell(0, "no_orden").click();
  await cell(0, "precio_unitario").dblclick();
  const discardedPrice = page.getByRole("textbox", {
    name: "Precio unitario",
    exact: true,
  });
  await discardedPrice.fill("9,99");
  await discardedPrice.press("Enter");
  await cell(0, "no_orden").click();
  await cell(2, "no_orden").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Estado del lote", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nuevo lote", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Hay cambios sin guardar", exact: true })
    .getByRole("button", { name: "Descartar y continuar", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "Lotes creados" }).waitFor();
  check((await page.getByRole("dialog", { name: /Nuevos lotes/ }).count()) === 0, "La creación en la hoja no abre un diálogo");
  db = await state();
  check(
    db.lote_producto.filter((lot) =>
      lines.some((line) => line.id === lot.id_orden_producto),
    ).length === 5,
    "Nuevo lote crea uno por cada renglón distinto de la selección",
  );
  await cell(0, "cantidad_solicitada").dblclick();
  const requested = page.getByRole("textbox", {
    name: "Cantidad solicitada",
    exact: true,
  });
  await requested.fill("1200");
  await requested.press("Enter");
  await page
    .getByRole("button", { name: "Estado del lote", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Cerrar lotes", exact: true }).click();
  const resolution = page.getByRole("dialog", {
    name: "Hay cambios sin guardar",
    exact: true,
  });
  await resolution.waitFor();
  const [transition] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/commands") &&
        response.request().postDataJSON()?.name === "setProductLotStates",
    ),
    resolution
      .getByRole("button", { name: "Guardar y continuar", exact: true })
      .click(),
  ]);
  check(
    transition.ok(),
    "Guardar y continuar usa los originales actualizados para la acción de estado",
  );
  await resolution.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Columnas", exact: true }).click();
  await page
    .locator(".product-sheet-column-menu label")
    .filter({ hasText: /^Factura$/ })
    .click();
  await page.keyboard.press("Escape");
  await cell(0, "id_factura").dblclick();
  const invoice = initial.factura.find(
    (invoice) => invoice.id_proveedor === product.id_maquilador,
  );
  await page
    .locator(".sheet-reference-editor")
    .getByRole("combobox")
    .fill(invoice.numero_factura);
  await page
    .getByRole("option", { name: invoice.numero_factura, exact: true })
    .click();
  check(
    (await state()).lote_producto.find((lot) => lot.id === first.id)
      .id_factura === null,
    "El selector de factura reutilizado prepara la relación sin guardarla",
  );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  await cell(0, "no_orden").click();
  await cell(1, "no_orden").click({ modifiers: ["Shift"] });
  check(
    await page
      .getByRole("button", { name: "Imprimir", exact: true })
      .isEnabled(),
    "Varias filas de una misma OC permiten imprimir",
  );
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page
      .getByRole("button", { name: "Ver orden escaneada", exact: true })
      .click(),
  ]);
  await popup.waitForLoadState();
  check(
    popup.url().includes("/api/documents/"),
    "La orden escaneada abre el documento vigente de la cabecera",
  );
  await popup.close();
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  await page.waitForURL(/\/imprimir\?/);
  await page.goBack();
  await page.locator(".product-sheet-grid").waitFor();
  check(
    new URL(page.url()).searchParams.get("q") === owner.no_orden,
    "La impresión conserva el regreso a la consulta de la hoja",
  );
  db = await state();
  await command("saveLot", {
    row: {
      ...db.lote_producto.find((lot) => lot.id === first.id),
      cantidad_recibida: 1300,
    },
  });
  await page.reload();
  await page.locator(".product-sheet-grid").waitFor();
  const excess = page.locator(".sheet-excess-indicator").first();
  await excess.focus();
  await page.getByRole("tooltip").waitFor();
  check(
    (await page.getByRole("tooltip").innerText()).includes("recibidas de más"),
    "La sobreentrega se explica con un triángulo ámbar accesible por teclado",
  );
  await page.keyboard.press("Escape");
  await search().fill("");
  const orders = await page
    .locator('[data-column-key="no_orden"]')
    .allTextContents();
  const other = orders.findIndex((value) => value.trim() !== orders[0].trim());
  await cell(0, "no_orden").click();
  await cell(other, "no_orden").click({ modifiers: ["Shift"] });
  check(
    (await page
      .getByRole("button", { name: "Imprimir", exact: true })
      .isDisabled()) &&
      (await page
        .getByRole("button", { name: "Ver orden escaneada", exact: true })
        .isDisabled()),
    "Imprimir y documento quedan bloqueados al seleccionar varias OC",
  );
  await page
    .getByRole("button", { name: "Ocultar barra de herramientas" })
    .click();
  await page.getByRole("button", { name: "Mostrar herramientas" }).click();
  check(
    await page.locator(".product-sheet-tools").isVisible(),
    "La barra siempre se puede recuperar",
  );
  await page.screenshot({
    path: "tests/evidence/aria/product-sheet-interaction-desktop.png",
  });
  check(errors.length === 0, "Sin errores de JavaScript: " + errors.join("; "));
  return { checks };
};
