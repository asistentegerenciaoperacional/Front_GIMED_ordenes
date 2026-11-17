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
  const discardBounds = await toolbar("Descartar").boundingBox();
  const collapseBounds = await toolbar("Ocultar barra de herramientas").boundingBox();
  check(Math.abs(discardBounds.y - collapseBounds.y) < 2 && collapseBounds.x - (discardBounds.x + discardBounds.width) <= 12,
    "Los controles de edición quedan alineados junto al botón de ocultar la barra");
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
  await toolbar("Más acciones de órdenes").click();
  await page.getByRole("menuitem", { name: "Autorizar 1 OCM" }).click();
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
  check(await toolbar("Comentarios").isDisabled(), "Comentarios no está disponible para conceptos de Otros");
  check(await toolbar("Certificados").isDisabled(), "Certificados se deshabilita para conceptos sin lote de material");
  await toolbar("Acciones de lote").click();
  check(await page.getByRole("menuitem", { name: "Registrar/editar recepción" }).count() === 0, "El menú de lotes no muestra la acción de recepción");
  await page.keyboard.press("Escape");
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
  const lotId = first.id_lote_material;
  const existingDocs = (await state()).documento.filter((doc) => doc.tipo_entidad === "lote_material" && doc.id_entidad === lotId);
  const quality = existingDocs.find((doc) => doc.tipo_documento === "certificado_calidad");
  await command("deleteDocument", { id: quality.id });
  await page.reload();
  await cell(0, "no_orden").click();
  await cell(1, "no_orden").click({ modifiers: ["Shift"] });
  await toolbar("Certificados").click();
  const certs = page.getByRole("dialog", { name: /Certificados · MAT-26-041/ });
  await certs.waitFor();
  check(await certs.getByText(/Certificado de liberación/i).count() > 0, "El botón reúne los certificados del lote compartido");
  const [certificatePage] = await Promise.all([page.waitForEvent("popup"), certs.getByRole("link", { name: "Ver", exact: true }).click()]);
  await certificatePage.waitForLoadState();
  check(certificatePage.url().includes("/api/documents/"), "El certificado existente se puede consultar");
  await certificatePage.close();
  await certs.getByRole("button", { name: "Agregar", exact: true }).click();
  const addCertificate = page.getByRole("dialog", { name: "Agregar placeholder" });
  await addCertificate.getByRole("textbox", { name: "Nombre del archivo" }).fill("Calidad-prueba.html");
  await addCertificate.getByRole("button", { name: "Guardar placeholder" }).click();
  await addCertificate.waitFor({ state: "hidden" });
  check((await state()).documento.some((doc) => doc.id_entidad === lotId && doc.tipo_documento === "certificado_calidad" && doc.nombre_archivo === "Calidad-prueba.html"), "Se agrega el certificado faltante al lote seleccionado");
  await certs.getByRole("button", { name: /Cerrar/ }).click();
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
  await toolbar("Comentarios").click();
  const comments = page.getByRole("dialog", { name: "Comentarios" });
  await comments.getByLabel("Nuevo comentario").fill("Comentario de material de prueba");
  await comments.getByRole("button", { name: "Publicar comentario" }).click();
  await comments.getByText("Comentario de material de prueba").waitFor();
  check(true, "Comentarios publica sobre el renglón de material seleccionado");
  await comments.getByRole("button", { name: "Cerrar" }).click();
  const closeConfirmation = page.getByRole("alertdialog");
  if (await closeConfirmation.count()) await closeConfirmation.getByRole("button", { name: "Descartar cambios" }).click();
  await comments.waitFor({ state: "hidden" });
  await toolbar("Acciones de lote").click();
  check(await page.getByRole("menuitem", { name: /certificado/i }).count() === 0, "El menú de lotes no muestra certificados");
  await page.keyboard.press("Escape");
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
  await toolbar("Acciones de lote").click();
  await page.getByRole("menuitem", { name: "Cerrar lotes (1)" }).click();
  await grid.locator('tr[data-lot-state="cerrado"]').waitFor();
  await cell(0, "no_orden").click();
  await cell(1, "no_orden").click({ modifiers: ["Shift"] });
  await toolbar("Acciones de lote").click();
  await page.getByRole("menuitem", { name: "Anular lotes (2)" }).click();
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
  await toolbar("Acciones de lote").click();
  await page.getByRole("menuitem", { name: "Reabrir lotes (1)" }).click();
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
  await toolbar("Más acciones de órdenes").click();
  await page.getByRole("menuitem", { name: "Autorizar 1 OCM" }).click();
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
  await page.goto(origin + "/ordenes/materiales?q=1601");
  await grid.waitFor();
  const priorDeletion = await state();
  await cell(0, "no_orden").click();
  await toolbar("Eliminar lotes seleccionados").click();
  let confirmation = page.getByRole("dialog", { name: "Eliminar lote" });
  check((await confirmation.innerText()).includes("certificados se conservan"), "La confirmación explica qué datos se conservan");
  await confirmation.getByRole("button", { name: "Cancelar" }).click();
  check((await state()).orden_material.some((line) => line.id === first.id), "Cancelar conserva la fila seleccionada");
  await toolbar("Eliminar lotes seleccionados").click();
  confirmation = page.getByRole("dialog", { name: "Eliminar lote" });
  await confirmation.getByRole("button", { name: "Eliminar lote", exact: true }).click();
  await page.waitForFunction((id) => ![...document.querySelectorAll('[data-sheet-key]')].some((cell) => cell.dataset.sheetKey === `orden_material:${id}`), first.id);
  const afterDeletion = await state();
  check(!afterDeletion.orden_material.some((line) => line.id === first.id) && afterDeletion.orden_material.some((line) => line.id === second.id), "Eliminar afecta solo la fila seleccionada del lote compartido");
  check(JSON.stringify(afterDeletion.lote_material) === JSON.stringify(priorDeletion.lote_material) && JSON.stringify(afterDeletion.documento) === JSON.stringify(priorDeletion.documento), "El lote compartido y sus certificados se conservan");
  return { checks };
};
