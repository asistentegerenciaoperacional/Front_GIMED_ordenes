async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const db = await state(),
    checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const close = async (form) => {
    await form.getByRole("button", { name: "Cancelar", exact: true }).click();
    const alert = page.getByRole("alertdialog");
    if (await alert.count())
      await alert
        .getByRole("button", { name: "Descartar cambios", exact: true })
        .click();
  };
  const choose = async (input, query, name) => {
    if ((await input.inputValue()) === query)
      await input
        .locator("..")
        .getByRole("button", { name: "Mostrar opciones", exact: true })
        .click();
    else await input.fill(query);
    await page.getByRole("option", { name, exact: true }).click();
  };
  const aurora = db.proveedor.find((p) => p.nombre_corto === "Aurora");
  const andina = db.proveedor.find((p) => p.nombre_corto === "Andina");
  const material = db.materiales.find(
    (m) => m.nombre_material === "Tapa dosificadora",
  );
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/catalogos?tab=productos");
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    let form = page.getByRole("dialog", {
      name: "Agregar · Productos",
      exact: true,
    });
    const provider = form.getByRole("combobox", {
      name: "Maquilador",
      exact: true,
    });
    check(
      await provider.evaluate((el) => el.tagName === "INPUT"),
      "Maquilador usa autocompletado a " + width + "px",
    );
    await provider.fill("Andin");
    check(
      (await page.getByRole("option").count()) === 1,
      "Proveedor filtra al escribir a " + width + "px",
    );
    await provider.press("ArrowDown");
    await provider.press("Enter");
    check(
      (await provider.inputValue()) === andina.nombre_largo,
      "Proveedor se elige con teclado a " + width + "px",
    );
    await provider.fill("proveedor inexistente");
    check(
      await page.getByText("Sin coincidencias", { exact: true }).isVisible(),
      "Sin coincidencias para proveedor a " + width + "px",
    );
    await choose(provider, "Auror", aurora.nombre_largo);
    await close(form);

    await page.goto(origin + "/ordenes/materiales");
    await page
      .getByRole("button", { name: "Nueva orden", exact: true })
      .click();
    form = page.getByRole("dialog", {
      name: "Nueva orden de compra",
      exact: true,
    });
    const supplier = form.getByRole("combobox", {
      name: "Proveedor",
      exact: true,
    });
    const item = form.getByRole("combobox", { name: "Material", exact: true });
    const before = await supplier.inputValue();
    await supplier
      .locator("..")
      .getByRole("button", { name: "Mostrar opciones", exact: true })
      .click();
    check(
      await page.getByText("Favoritos", { exact: true }).isVisible(),
      "Se conserva la sección de favoritos a " + width + "px",
    );
    await supplier.press("Escape");
    await supplier.fill("sin proveedor");
    await supplier.press("Tab");
    check(
      (await supplier.inputValue()) === before,
      "Buscar sin seleccionar no cambia el proveedor de la orden a " +
        width +
        "px",
    );
    await item.fill("dosificadora");
    check(
      (await page.getByRole("option").count()) === 1,
      "Material filtra por nombre a " + width + "px",
    );
    await item.press("ArrowDown");
    await item.press("Enter");
    check(
      (await item.inputValue()).includes(material.nombre_material),
      "Material se elige con teclado a " + width + "px",
    );
    check(
      (await supplier.inputValue()) === before,
      "Cambiar material conserva el proveedor a " + width + "px",
    );
    await supplier
      .locator("..")
      .getByRole("button", { name: "Mostrar opciones", exact: true })
      .click();
    check(
      (await page.getByText("Favoritos", { exact: true }).isVisible()) &&
        (await page
          .getByText("Otros proveedores", { exact: true })
          .isVisible()),
      "Los grupos se actualizan para el material seleccionado a " +
        width +
        "px",
    );
    await supplier.press("Escape");
    await item.fill("material inexistente");
    check(
      await page.getByText("Sin coincidencias", { exact: true }).isVisible(),
      "Sin coincidencias para material a " + width + "px",
    );
    const label =
      String(material.codigo_material).padStart(3, "0") +
      " · " +
      material.nombre_material;
    await choose(item, String(material.codigo_material), label);
    check(
      (await item.inputValue()) === label,
      "Material se busca por código MAIA a " + width + "px",
    );
    await page.screenshot({
      path: `tests/evidence/favorites/autocomplete-${width}.png`,
      fullPage: true,
    });
    await close(form);

    await page.goto(origin + "/facturas");
    await page
      .getByRole("button", { name: "Agregar factura", exact: true })
      .click();
    form = page.getByRole("dialog", { name: "Agregar factura", exact: true });
    const invoiceSupplier = form.getByRole("combobox", {
      name: "Proveedor",
      exact: true,
    });
    await choose(invoiceSupplier, "Auror", aurora.nombre_largo);
    check(
      (await invoiceSupplier.inputValue()) === aurora.nombre_largo,
      "Proveedor de factura usa el mismo autocompletado a " + width + "px",
    );
    await close(form);
  }

  await page.goto(origin + "/proveedores?tab=contacto");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  let form = page.getByRole("dialog", { name: /Agregar.*Contactos/ });
  await choose(
    form.getByRole("combobox", { name: "Proveedor", exact: true }),
    "Andin",
    andina.nombre_largo,
  );
  await form
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill("Contacto autocompletado");
  await form
    .getByRole("textbox", { name: "Correo", exact: true })
    .fill("autocomplete@proveedor.example");
  await form
    .getByRole("button", { name: "Guardar registro", exact: true })
    .click();
  await form.waitFor({ state: "hidden" });
  check(
    (await state()).contacto.some(
      (row) =>
        row.nombre === "Contacto autocompletado" &&
        row.id_proveedor === andina.id,
    ),
    "El contacto guarda el identificador del proveedor elegido",
  );

  await page.goto(origin + "/ordenes/materiales");
  await page.getByRole("button", { name: "Nueva orden", exact: true }).click();
  form = page.getByRole("dialog", {
    name: "Nueva orden de compra",
    exact: true,
  });
  const provider = db.proveedor.find((p) => p.Es_materiales);
  await choose(
    form.getByRole("combobox", { name: "Proveedor", exact: true }),
    provider.nombre_largo,
    provider.nombre_largo,
  );
  const label =
    String(material.codigo_material).padStart(3, "0") +
    " · " +
    material.nombre_material;
  await choose(
    form.getByRole("combobox", { name: "Material", exact: true }),
    "dosificadora",
    label,
  );
  await form
    .getByRole("textbox", { name: "Entrega solicitada", exact: true })
    .fill("31/12/2027");
  await form
    .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
    .fill("100");
  await form
    .getByRole("textbox", { name: "Precio unitario", exact: true })
    .fill("125");
  await form
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  await form.getByRole("button", { name: "Crear orden", exact: true }).click();
  await form.waitFor({ state: "hidden" });
  const saved = await state();
  check(
    saved.orden_material.some(
      (line) =>
        line.id_material === material.id &&
        line.cantidad_solicitada === 100 &&
        saved.orden_compra.find((order) => order.id === line.id_orden_compra)
          ?.id_proveedor === provider.id,
    ),
    "La OCM guarda identificadores de proveedor y material",
  );
  const productOrder = db.orden_compra.find(
    (order) =>
      order.tipo_orden === "producto" &&
      order.estado_autorizacion === "no_autorizada",
  );
  await page.goto(origin + "/ordenes/" + productOrder.id);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  form = page.getByRole("dialog", {
    name: "Editar orden · " + productOrder.no_orden,
    exact: true,
  });
  const orderProvider = form.getByRole("combobox", {
    name: "Proveedor",
    exact: true,
  });
  const originalProvider = await orderProvider.inputValue();
  const originalQuantity = await form
    .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
    .first()
    .inputValue();
  await orderProvider.fill("Auror");
  check(
    (await page
      .getByRole("dialog", {
        name: "Cambiar proveedor y reemplazar la orden",
        exact: true,
      })
      .count()) === 0,
    "Escribir en proveedor no dispara el reemplazo de la OC",
  );
  await page
    .getByRole("option", { name: aurora.nombre_largo, exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Cambiar proveedor y reemplazar la orden",
    exact: true,
  });
  await confirmation.waitFor();
  check(true, "Seleccionar otro proveedor mantiene la confirmación existente");
  await confirmation
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  check(
    (await orderProvider.inputValue()) === originalProvider &&
      (await form
        .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
        .first()
        .inputValue()) === originalQuantity,
    "Cancelar restaura la etiqueta del proveedor y conserva el borrador",
  );
  await form
    .getByRole("textbox", { name: "Entrega solicitada", exact: true })
    .fill("31/12/2027");
  await form
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  const box = form
    .getByRole("combobox", { name: "Referencia de corrugado", exact: true })
    .first();
  await box.fill("Tapa");
  check(
    await page.getByText("Sin coincidencias", { exact: true }).isVisible(),
    "Autocompletado de corrugado excluye otros materiales",
  );
  const corrugated = db.materiales.find(
    (row) =>
      db.tipos_materiales.find((type) => type.id === row.id_tipo_material)
        ?.tipo_material === "Corrugado",
  );
  await choose(box, "corrugada", corrugated.nombre_material);
  check(
    (await box.inputValue()) === corrugated.nombre_material,
    "Corrugado sin código se puede buscar y seleccionar",
  );
  await close(form);
  const authorized = db.orden_compra.find(
    (order) =>
      order.tipo_orden === "producto" &&
      order.estado_autorizacion === "autorizada",
  );
  await page.goto(origin + "/ordenes/" + authorized.id);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  form = page.getByRole("dialog", {
    name: "Editar orden · " + authorized.no_orden,
    exact: true,
  });
  check(
    await form
      .getByRole("combobox", { name: "Proveedor", exact: true })
      .isDisabled(),
    "Proveedor de orden autorizada sigue bloqueado",
  );
  await close(form);
  return { checks };
};
