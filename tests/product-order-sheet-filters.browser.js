async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(12000);
  const origin = new URL(page.url()).origin,
    checks = [],
    writes = [];
  const check = (value, label) => {
    if (!value) throw new Error(label);
    checks.push(label);
  };
  const db = await (await page.request.get(origin + "/api/state")).json();
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.goto(origin + "/ordenes/productos");
  await page.locator(".product-sheet-grid").waitFor();
  const today = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const add = (days) => {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const orders = new Map(db.orden_compra.map((row) => [row.id, row])),
    lines = new Map(db.orden_producto.map((row) => [row.id, row]));
  const lots = db.lote_producto.filter(
    (lot) =>
      lot.estado !== "anulado" &&
      orders.get(lines.get(lot.id_orden_producto).id_orden_compra)
        .tipo_orden === "producto" &&
      orders.get(lines.get(lot.id_orden_producto).id_orden_compra)
        .estado_autorizacion === "autorizada",
  );
  function expected(id) {
    return lots
      .filter((lot) => {
        const line = lines.get(lot.id_orden_producto),
          order = orders.get(line.id_orden_compra),
          siblings = db.lote_producto.filter(
            (item) =>
              item.id_orden_producto === line.id && item.estado !== "anulado",
          );
        const received =
            (lot.cantidad_recibida ?? 0) > 0 || !!lot.fecha_recepcion,
          open = lot.estado === "en_seguimiento",
          date = order.fecha_solicitada_entrega?.slice(0, 10),
          remaining =
            line.cantidad_solicitada -
            siblings.reduce(
              (sum, item) => sum + (item.cantidad_recibida ?? 0),
              0,
            );
        const links = db.abastecimiento_material.filter(
            (link) => link.id_orden_producto === line.id,
          ),
          document = db.documento.some(
            (doc) =>
              doc.tipo_entidad === "orden_compra" &&
              doc.id_entidad === order.id &&
              doc.tipo_documento === "orden_compra_escaneada",
          );
        switch (id) {
          case "documento_con":
            return document;
          case "documento_sin":
            return !document;
          case "recepciones_sin_factura":
            return received && !lot.id_factura;
          case "entrega_vencida":
            return open && remaining > 0 && date < today;
          case "proximas_7":
          case "proximas_15":
          case "proximas_30":
            return (
              open &&
              remaining > 0 &&
              date >= today &&
              date <= add(Number(id.split("_")[1]))
            );
          case "sin_recepciones":
            return !received;
          case "batch_vencido":
            return (
              open &&
              !!lot.fecha_estimada_batch_record &&
              lot.fecha_estimada_batch_record.slice(0, 10) < today &&
              !lot.fecha_entrega_batch_record
            );
          case "recibido_sin_batch":
            return received && !lot.fecha_entrega_batch_record;
          case "inspeccion_pendiente":
            return !!lot.fecha_entrega_batch_record && !lot.fecha_inspeccion;
          case "recibidos_sin_inspeccion":
            return received && !lot.fecha_inspeccion;
          case "confirmacion_pendiente":
            return received && !lot.fecha_confirmacion;
          case "seguimiento_por_cerrar":
            return (
              line.estado === "en_seguimiento" &&
              siblings.length > 0 &&
              siblings.every((item) => item.estado === "cerrado")
            );
          case "vinculos_con":
            return links.length > 0;
          case "vinculos_sin":
            return links.length === 0;
          case "ocm_pendientes":
            return (
              line.estado !== "anulada" &&
              links.some((link) =>
                db.orden_material.some(
                  (material) =>
                    material.id === link.id_orden_material &&
                    material.estado === "en_seguimiento",
                ),
              )
            );
        }
      })
      .map((lot) => "lot:" + lot.id)
      .sort();
  }
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/commands"))
      writes.push(request.postDataJSON());
  });
  for (const id of [
    "documento_con",
    "documento_sin",
    "recepciones_sin_factura",
    "entrega_vencida",
    "proximas_7",
    "proximas_15",
    "proximas_30",
    "sin_recepciones",
    "batch_vencido",
    "recibido_sin_batch",
    "inspeccion_pendiente",
    "recibidos_sin_inspeccion",
    "confirmacion_pendiente",
    "seguimiento_por_cerrar",
    "vinculos_con",
    "vinculos_sin",
    "ocm_pendientes",
  ]) {
    await page
      .getByRole("button", {
        name: "Filtro personalizado de la hoja",
        exact: true,
      })
      .click();
    await page.locator(`[role="menuitemradio"][data-key="${id}"]`).click();
    await page.waitForFunction(
      (id) => new URLSearchParams(location.search).get("filtro") === id,
      id,
    );
    const actual = await page
      .locator('[data-column-key="no_orden"]')
      .evaluateAll((cells) =>
        cells.map((cell) => cell.dataset.sheetKey).sort(),
      );
    check(
      JSON.stringify(actual) === JSON.stringify(expected(id)),
      `Filtro ${id}: coincide con los lotes correctos y conserva las cabeceras`,
    );
    check(
      (await page.locator(".product-sheet-grid thead th").count()) === 24,
      `Cabeceras disponibles en ${id}`,
    );
  }
  check(
    writes.length === 0,
    "Aplicar los 17 filtros no guarda ni emite comandos",
  );
  await page
    .getByRole("button", { name: "Limpiar filtros", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Filtrar y ordenar Precio unitario",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "De menor a mayor", exact: true })
    .click();
  await page.locator('thead th[aria-sort="ascending"]').waitFor();
  const sortedIds = await page
    .locator('[data-column-key="no_orden"]')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.dataset.sheetKey.slice(4)),
    );
  const prices = sortedIds.map((id) => {
    const lot = db.lote_producto.find((lot) => lot.id === id);
    return Number(lines.get(lot.id_orden_producto).precio_unitario);
  });
  check(
    prices.every((price, index) => index === 0 || price >= prices[index - 1]),
    "El filtro de una columna nueva ordena por el valor numérico",
  );
  check(
    (await page.locator('thead th[aria-sort="ascending"]').count()) === 1,
    "El orden de la columna se anuncia mediante aria-sort",
  );
  await page.goto(origin + "/ordenes/productos");
  await page.locator(".product-sheet-grid").waitFor();
  const link = page.locator(".sheet-ocm-number").first();
  await link.click();
  await page.getByRole("tooltip").waitFor();
  check(
    (await page.getByRole("tooltip").innerText()).includes("Envase"),
    "El número de OCM explica los materiales vinculados por renglón",
  );
  await page.keyboard.press("Escape");
  const order = db.orden_compra.find(
    (order) =>
      order.tipo_orden === "producto" &&
      order.estado_autorizacion === "no_autorizada",
  );
  await page.goto(
    origin + "/ordenes/productos?vista=no_autorizadas&q=" + order.no_orden,
  );
  await page.locator(".product-sheet-grid").waitFor();
  await page
    .locator('[data-sheet-row="0"][data-column-key="id_producto"]')
    .dblclick();
  const combo = page.getByRole("combobox", { name: "Producto", exact: true });
  await combo.fill("Crema");
  await page.getByRole("option").first().waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  check(
    (await page.locator("[data-active]").getAttribute("data-sheet-row")) ===
      "0",
    "Seleccionar en el autocompletado no salta también a la fila siguiente",
  );
  if (
    await page
      .getByRole("button", { name: "Descartar", exact: true })
      .isEnabled()
  )
    await page.getByRole("button", { name: "Descartar", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  if (await confirmation.count())
    await confirmation
      .getByRole("button", { name: "Descartar", exact: true })
      .click();
  const alternateProvider = db.proveedor.find(
    (provider) => provider.Es_maquila && provider.id !== order.id_proveedor,
  );
  await page
    .locator('[data-sheet-row="0"][data-column-key="id_proveedor"]')
    .dblclick();
  const provider = page.getByRole("combobox", {
    name: "Proveedor",
    exact: true,
  });
  await provider.fill(
    alternateProvider.nombre_corto ?? alternateProvider.nombre_largo,
  );
  await page
    .locator(`[role="option"][data-key="${alternateProvider.id}"]`)
    .click();
  const replacement = page.getByRole("dialog", {
    name: "Cambiar proveedor y reemplazar la orden",
    exact: true,
  });
  await replacement.waitFor();
  check(
    (
      await (await page.request.get(origin + "/api/state")).json()
    ).orden_compra.find((item) => item.id === order.id).id_proveedor ===
      order.id_proveedor,
    "Cambiar proveedor abre el reemplazo confirmado sin guardar una FK aislada",
  );
  await replacement
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await page.goto(origin + "/configuracion");
  await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key === "gimed:ui:product-order-sheet" ||
        key === "gimed:draft:product-order-sheet:v1"
      )
        throw new DOMException("blocked", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  const label = page.getByText(
    "Vista alternativa de la tabla de OC de productos",
    { exact: true },
  );
  await label.click();
  await label.click();
  check(
    (await page
      .getByRole("status")
      .filter({ hasText: "La preferencia se mantiene" })
      .count()) === 1,
    "Si falla localStorage, se informa que la preferencia es de sesión",
  );
  await page.locator(".topbar button").first().click();
  await page
    .locator("#app-navigation")
    .getByRole("link", { name: "Órdenes de compra", exact: true })
    .click();
  await page.locator(".product-sheet-grid").waitFor();
  check(
    (await page.locator(".product-order-sheet").count()) === 1,
    "La preferencia bloqueada sigue activa durante la navegación de la sesión",
  );
  await page
    .locator('[data-sheet-row="0"][data-column-key="precio_unitario"]')
    .dblclick();
  const price = page.getByRole("textbox", {
    name: "Precio unitario",
    exact: true,
  });
  await price.fill("321,99");
  await price.press("Enter");
  await page
    .getByText("No se pudo guardar la copia local del borrador.", {
      exact: false,
    })
    .waitFor();
  check(
    true,
    "El fallo de la copia local se informa y la edición sigue disponible",
  );
  return { checks };
};
