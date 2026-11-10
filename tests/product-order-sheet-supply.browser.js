async (page) => {
  page.setDefaultTimeout(10000);
  const origin = new URL(page.url()).origin;
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
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
  const initial = await state();
  const product = initial.productos[0];
  const envase = initial.materiales.find((m) => m.codigo_material === 101);
  const tapa = initial.materiales.find((m) => m.codigo_material === 102);
  const supplier = initial.proveedor.find((p) => p.Es_materiales);
  const delivery = "2099-02-15T12:00:00.000Z";
  const { orderId } = await command("createOrder", {
    tipo_orden: "producto",
    id_proveedor: product.id_maquilador,
    fecha_solicitada_entrega: delivery,
    lines: [1000, 2000].map((cantidad_solicitada) => ({
      id_producto: product.id,
      cantidad_solicitada,
      precio_unitario: "2.55",
    })),
  });
  await command("authorizeOrder", { id: orderId, confirm: true });
  const { orderId: ocmId } = await command("createOrder", {
    tipo_orden: "material",
    id_proveedor: supplier.id,
    fecha_solicitada_entrega: "2099-02-12T12:00:00.000Z",
    lines: [
      {
        id_material: envase.id,
        cantidad_solicitada: 3500,
        precio_unitario: "0.45",
      },
      {
        id_material: tapa.id,
        cantidad_solicitada: 3500,
        precio_unitario: "0.12",
      },
    ],
  });
  const db = await state();
  const oc = db.orden_compra.find((o) => o.id === orderId);
  const ocm = db.orden_compra.find((o) => o.id === ocmId);
  const [first, second] = db.orden_producto.filter(
    (l) => l.id_orden_compra === orderId,
  );
  const firstLot = db.lote_producto.find(
    (l) => l.id_orden_producto === first.id,
  );
  const materials = db.orden_material.filter(
    (l) => l.id_orden_compra === ocmId,
  );
  const targetFor = (material) =>
    materials.find((l) => l.id_material === material.id);
  await command("saveLot", {
    row: { id_orden_producto: first.id, numero_lote: "OCM-HOJA-B" },
  });
  await command("saveLot", {
    row: {
      id_orden_producto: first.id,
      numero_lote: "OCM-HOJA-ANULADO",
      estado: "anulado",
    },
  });

  const { sheetCell } = await import(
    (await import("node:url")).pathToFileURL(
      (await import("node:path")).resolve("tests/sheet-locator.mjs"),
    ).href
  );
  const grid = page.getByRole("grid");
  const menu = page.getByRole("button", { name: "Más acciones de órdenes" });
  const link = page.getByRole("menuitem", {
    name: "Vincular OCM",
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: "Vincular OCM existente",
    exact: true,
  });
  const draft = page.getByRole("dialog", {
    name: "Hay cambios sin guardar",
    exact: true,
  });
  const submit = dialog.getByRole("button", {
    name: "Vincular OCM",
    exact: true,
  });
  const cell = (row, key = "ocm") => sheetCell(page, row, key);
  const sheet = origin + "/ordenes/productos?q=" + oc.no_orden;
  const openMenuAction = async () => {
    await menu.press("Enter");
    await link.press("Enter");
  };
  const focusGrid = () =>
    page.waitForFunction(() =>
      document.activeElement?.matches(".product-sheet-grid"),
    );
  const focusMenu = () =>
    page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Más acciones de órdenes",
    );
  const close = async () => {
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  };
  const changePrice = async (amount) => {
    await cell(0, "precio_unitario").dblclick();
    const editor = page.getByRole("textbox", {
      name: "Precio unitario",
      exact: true,
    });
    await editor.fill(amount);
    await editor.press("Enter");
    await page.getByRole("button", { name: "Guardar 1 cambios" }).waitFor();
  };
  const choose = async (material) => {
    await dialog
      .getByRole("combobox", { name: "Material pendiente", exact: true })
      .selectOption(material.id);
    await dialog
      .getByRole("combobox", { name: "Renglón de OCM", exact: true })
      .selectOption(targetFor(material).id);
  };
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet);
  await grid.waitFor();
  await menu.click();
  check(await link.isDisabled(), "Vincular requiere una selección");
  await page.keyboard.press("Escape");
  await cell(0, "id_producto").click();
  await cell(2, "id_producto").click({ modifiers: ["Shift"] });
  await menu.click();
  check(
    await link.isDisabled(),
    "Dos renglones distintos de una misma OC quedan bloqueados",
  );
  await page.keyboard.press("Escape");
  await cell(0, "id_producto").click();
  await cell(1, "id_producto").click({ modifiers: ["Shift"] });
  await openMenuAction();
  await dialog.waitFor();
  await close();
  await focusMenu();
  checks.push(
    "El menú admite dos lotes del mismo renglón y recupera el foco al cancelar",
  );

  const mobile = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
  try {
    await mobile.addInitScript(() => {
      localStorage.setItem("gimed:ui:product-order-sheet", "true");
      localStorage.setItem("gimed:ui:product-sheet-collapsed", "false");
    });
    const touch = await mobile.newPage();
    await touch.goto(sheet);
    await touch
      .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
      .tap();
    await touch.getByRole("button", { name: "Más acciones de órdenes" }).tap();
    await touch
      .getByRole("menuitem", { name: "Vincular OCM", exact: true })
      .tap();
    const bounds = await touch
      .getByRole("dialog", { name: "Vincular OCM existente" })
      .boundingBox();
    check(
      bounds && bounds.x >= 0 && bounds.x + bounds.width <= 376,
      "Menú táctil y diálogo a 375 px",
    );
  } finally {
    await mobile.close();
  }

  await page.goto(sheet + "&vista=anuladas");
  await grid.waitFor();
  await cell(0).dblclick();
  await dialog.waitFor();
  await close();
  await focusGrid();
  checks.push(
    "El doble clic desde un lote anulado permite vincular al renglón vigente",
  );

  await page.goto(sheet);
  await grid.waitFor();
  await cell(0).click();
  await grid.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "1605");
    element.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
    );
  });
  check(
    (await cell(0).getAttribute("data-rejected")) === "true",
    "Pegar en OCM vinculadas conserva la protección",
  );
  await changePrice("2,60");
  await openMenuAction();
  await draft.getByRole("button", { name: "Cancelar", exact: true }).click();
  await focusMenu();
  check(
    await page.getByRole("button", { name: "Guardar 1 cambios" }).isVisible(),
    "Cancelar conserva el borrador",
  );
  await openMenuAction();
  await draft
    .getByRole("button", { name: "Guardar y continuar", exact: true })
    .click();
  await dialog.waitFor();
  check(
    (await state()).orden_producto.find((l) => l.id === first.id)
      .precio_unitario === "2.60",
    "Guardar y continuar aplica el precio antes de abrir",
  );
  await close();
  await focusMenu();
  await changePrice("7,00");
  await cell(0).click();
  await page.keyboard.press("F2");
  await draft
    .getByRole("button", { name: "Descartar y continuar", exact: true })
    .click();
  await dialog.waitFor();
  check(
    (await state()).orden_producto.find((l) => l.id === first.id)
      .precio_unitario === "2.60",
    "F2 permite descartar el borrador antes de vincular",
  );

  await choose(tapa);
  const target = targetFor(tapa);
  await command("linkMaterialSupply", {
    id_orden_producto: first.id,
    id_orden_material: target.id,
    expected: {
      id_producto: product.id,
      id_material: tapa.id,
      oc: {
        id_orden: oc.id,
        fecha_solicitada_entrega: delivery,
        cantidad_solicitada: first.cantidad_solicitada,
      },
      ocm: {
        id_orden: ocm.id,
        fecha_solicitada_entrega: ocm.fecha_solicitada_entrega,
        cantidad_solicitada: target.cantidad_solicitada,
        id_proveedor: supplier.id,
      },
    },
  });
  await submit.click();
  const review = dialog.getByRole("button", {
    name: "Revisar opciones actualizadas",
  });
  await review.waitFor();
  check(
    await submit.isDisabled(),
    "El conflicto concurrente conserva el diálogo y bloquea el reintento",
  );
  await review.click();
  await choose(envase);
  const before = await page
    .locator(".product-sheet-viewport")
    .evaluate((el) => [el.scrollTop, el.scrollLeft]);
  await submit.click();
  await dialog.waitFor({ state: "hidden" });
  await focusGrid();
  check(
    (await cell(0).getAttribute("data-active")) === "true",
    "Confirmar desde F2 restaura la celda activa",
  );
  const after = await page
    .locator(".product-sheet-viewport")
    .evaluate((el) => [el.scrollTop, el.scrollLeft]);
  check(
    after[0] === before[0] && Math.abs(after[1] - before[1]) < 2,
    "La hoja conserva el desplazamiento al confirmar",
  );
  for (const row of [0, 1]) {
    check(
      (await cell(row, "costo_total_unitario").innerText()).includes("3,17"),
      `Costo actualizado en el lote ${row + 1}`,
    );
    check(
      (await cell(row).innerText()).includes(ocm.no_orden),
      `OCM actualizada en el lote ${row + 1}`,
    );
  }
  check(
    (await state()).abastecimiento_material.filter(
      (rel) => rel.id_orden_producto === first.id,
    ).length === 2,
    "El conflicto y la confirmación guardan un vínculo por material",
  );
  await cell(0).click({ position: { x: 130, y: 15 } });
  await page.keyboard.press("F2");
  await page
    .getByText("Este producto no tiene materiales pendientes de abastecer.", {
      exact: true,
    })
    .waitFor();
  check(
    (await dialog.count()) === 0,
    "Una cobertura completa muestra el mensaje en la hoja",
  );
  await cell(0)
    .getByRole("button", { name: new RegExp(`OCM ${ocm.no_orden}`) })
    .click();
  await page.waitForURL("**/ordenes/" + ocmId);
  checks.push("El número de OCM sigue abriendo su detalle");

  await page.goto(sheet + "&filtro=vinculos_sin");
  await grid.waitFor();
  await cell(0, "id_producto").click();
  await openMenuAction();
  await choose(tapa);
  await submit.click();
  await dialog.waitFor({ state: "hidden" });
  await focusGrid();
  check(
    (await grid.getAttribute("aria-rowcount")) === "1" &&
      page.url().includes("filtro=vinculos_sin"),
    "Si el filtro retira el renglón, el foco vuelve a la hoja y se mantiene el filtro",
  );
  check(
    (await state()).abastecimiento_material.some(
      (rel) =>
        rel.id_orden_producto === second.id &&
        rel.id_orden_material === target.id,
    ),
    "El filtro no cambia el renglón de destino",
  );
  check(
    (await state()).lote_producto.some((lot) => lot.id === firstLot.id),
    "La vinculación conserva los lotes",
  );
  return { checks };
};
