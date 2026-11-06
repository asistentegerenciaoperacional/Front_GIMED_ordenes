async (page) => {
  const checks = [];
  const check = (condition, description) => {
    if (!condition) throw new Error(description);
    checks.push(description);
  };
  const origin = new URL(page.url()).origin;
  const key = "gimed:ui:last-product-order";
  const alternative = "gimed:ui:alternative-order-entry";
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const db = await state();
  const first = db.proveedor.find((supplier) => supplier.Es_maquila);
  const second = db.proveedor.find(
    (supplier) => supplier.Es_maquila && supplier.id !== first.id,
  );
  const product = db.productos.find(
    (item) =>
      item.activo &&
      item.id_maquilador === second.id &&
      db.codigos_barras.some(
        (code) => code.id_producto === item.id && code.estado === "asignado",
      ),
  );
  const day = (offset) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const dateText = (value) => value.split("-").reverse().join("/");
  const firstDelivery = day(30);
  const nextDelivery = day(31);
  const form = page.getByRole("dialog", {
    name: "Nueva orden de compra",
    exact: true,
  });
  const field = (role, name) => form.getByRole(role, { name, exact: true });
  const provider = field("combobox", "Proveedor");
  const delivery = field("textbox", "Entrega solicitada");
  const type = field("combobox", "Tipo de orden");
  const open = () =>
    page
      .locator(".page-heading")
      .getByRole("button", { name: "Nueva orden", exact: true })
      .click();
  const select = async (control, record, label) => {
    await control.fill(label);
    await page.locator(`[role="option"][data-key="${record.id}"]`).click();
  };
  const review = () => field("button", "Revisar orden").click();
  const cancel = async () => {
    await field("button", "Cancelar").click();
    await form.waitFor({ state: "hidden" });
  };
  const save = async (type) => {
    const view = page.url();
    const response = page.waitForResponse(
      (item) =>
        item.url().endsWith("/api/commands") &&
        item.request().method() === "POST" &&
        item.request().postDataJSON()?.name === "createOrder",
    );
    await field("button", "Crear orden").click();
    const http = await response;
    const data = await http.json();
    if (!http.ok()) throw new Error(JSON.stringify(data));
    await form.waitFor({ state: "hidden" });
    check(
      page.url() === view,
      "Conserva la URL y los parámetros al crear " + type,
    );
    check(
      await page
        .locator(".toast")
        .getByText("Orden creada", { exact: true })
        .isVisible(),
      "Confirma el guardado en la vista de origen para " + type,
    );
    return (await state()).orden_compra.find(
      (order) => order.id === data.result.orderId,
    );
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/ordenes/productos?vista=no_autorizadas&q=Andina");
  await open();
  check((await delivery.inputValue()) === "", "Primera OC sin fecha guardada");
  await select(provider, second, second.nombre_largo);
  await select(field("combobox", "Producto"), product, product.nombre_producto);
  await delivery.fill(dateText(firstDelivery));
  await review();
  const created = await save("producto en formulario clásico");
  check(
    created.id_proveedor === second.id &&
      created.fecha_solicitada_entrega.slice(0, 10) === firstDelivery,
    "La OC guarda el proveedor y la entrega elegidos",
  );
  const detailLink = page.getByRole("link", {
    name: "OC " + created.no_orden,
    exact: true,
  });
  await detailLink.click();
  check(
    new URL(page.url()).pathname === "/ordenes/" + created.id,
    "El detalle se abre desde el enlace de la nueva orden",
  );
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const edit = page.getByRole("dialog", {
    name: "Editar orden · " + created.no_orden,
    exact: true,
  });
  const editedDelivery = day(32);
  await edit
    .getByRole("textbox", { name: "Entrega solicitada", exact: true })
    .fill(dateText(editedDelivery));
  await edit
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  await edit
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await edit.waitFor({ state: "hidden" });
  check(
    (await state()).orden_compra
      .find((order) => order.id === created.id)
      .fecha_solicitada_entrega.slice(0, 10) === editedDelivery,
    "La edición guarda una entrega diferente",
  );
  await page.goto(origin + "/ordenes/productos?vista=no_autorizadas&q=Andina");
  await page.reload();
  await open();
  check(
    (await provider.inputValue()) === second.nombre_largo &&
      (await delivery.inputValue()) === dateText(firstDelivery),
    "Precarga proveedor y entrega tras recargar aunque se haya editado la orden",
  );
  await type.selectOption("material");
  check(
    (await delivery.inputValue()) === "",
    "Materiales no hereda la fecha precargada",
  );
  await type.selectOption("producto");
  check(
    (await delivery.inputValue()) === dateText(firstDelivery),
    "Volver a Producto recupera la fecha",
  );
  await delivery.fill(dateText(nextDelivery));
  await cancel();
  await page.evaluate(
    (setting) => localStorage.setItem(setting, "true"),
    alternative,
  );
  await open();
  check(
    (await form.locator(".order-entry-sheet").count()) === 1 &&
      (await provider.inputValue()) === second.nombre_largo &&
      (await delivery.inputValue()) === dateText(firstDelivery),
    "La hoja precarga los mismos valores después de cancelar un cambio",
  );
  await delivery.fill(dateText(nextDelivery));
  await select(
    form
      .locator('[data-sheet-row="0"][data-sheet-column="1"]')
      .getByRole("combobox"),
    product,
    product.nombre_producto,
  );
  await review();
  await page.route("**/api/commands", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "SERVER", message: "Guardado de prueba rechazado" },
    }),
  );
  await field("button", "Crear orden").click();
  await form
    .getByText("Guardado de prueba rechazado", { exact: true })
    .waitFor();
  check(
    (await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).delivery,
      key,
    )) === firstDelivery,
    "Un error de API deja la revisión abierta y conserva la entrega recordada",
  );
  await page.unroute("**/api/commands");
  await page.evaluate((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error("Almacenamiento no disponible");
      return setItem.call(this, name, value);
    };
  }, key);
  await save("producto en hoja con almacenamiento bloqueado");
  await open();
  check(
    (await provider.inputValue()) === second.nombre_largo &&
      (await delivery.inputValue()) === dateText(nextDelivery),
    "Si falla la escritura, el próximo formulario usa los valores en memoria",
  );
  await cancel();
  await page.reload();
  const setDefaults = (defaults) =>
    page.evaluate(
      ([key, values]) => localStorage.setItem(key, JSON.stringify(values)),
      [key, defaults],
    );
  await setDefaults({ supplier: second.id, delivery: day(-2) });
  await open();
  check(
    (await provider.inputValue()) === second.nombre_largo &&
      (await delivery.inputValue()) === "",
    "La fecha caducada se descarta y el proveedor válido se conserva",
  );
  await cancel();
  await setDefaults({
    supplier: db.proveedor.find((supplier) => !supplier.Es_maquila).id,
    delivery: "2026-02-31",
  });
  await open();
  check(
    (await provider.inputValue()) === first.nombre_largo &&
      (await delivery.inputValue()) === "",
    "Proveedor sin rol de maquila y fecha inválida usan los valores habituales",
  );
  await cancel();
  return { checks };
};
