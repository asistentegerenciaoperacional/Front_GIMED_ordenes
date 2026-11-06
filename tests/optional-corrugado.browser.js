async (page) => {
  page.setDefaultTimeout(12000);
  const checks = [];
  const check = (condition, description) => {
    if (!condition) throw new Error(description);
    checks.push(description);
  };
  const origin = new URL(page.url()).origin;
  const state = async () => (await page.request.get(origin + "/api/state")).json();
  const initial = await state();
  const product = initial.productos[0];
  const other = initial.productos.find(
    (row) => row.id !== product.id && row.id_maquilador === product.id_maquilador,
  );
  const config = initial.producto_corrugado.find((row) => row.id_producto === other.id);
  const { id_producto, ...corrugado } = config;
  const id_materiales = initial.materiales_asociados
    .filter((row) => row.id_producto === id_producto)
    .map((row) => row.id_material)
    .sort();
  const response = await page.request.post(origin + "/api/commands", {
    data: {
      name: "setProductMaterials",
      payload: { id_producto, id_materiales, corrugado: null, expected: { id_materiales, corrugado } },
    },
  });
  if (!response.ok()) throw new Error(await response.text());
  const suggestion = initial.producto_corrugado.find((row) => row.id_producto === product.id);
  const expected = [
    [null, null],
    [suggestion.id_material, null],
    [null, 0],
    [null, null],
  ];
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 30);
  const delivery = future.toISOString().slice(0, 10).split("-").reverse().join("/");
  const dialog = () => page.locator(".aria-modal-overlay .dialog[role=dialog]").last();
  const button = (name) => dialog().getByRole("button", { name, exact: true });
  const reference = (i) => dialog().getByRole("combobox", { name: "Referencia de corrugado", exact: true }).nth(i);
  const boxes = (i) => dialog().getByRole("spinbutton", { name: "Cantidad de corrugado", exact: true }).nth(i);
  const clearReference = async (i) => {
    const inputPath = `input[data-field-path="lines.${i}.ref_corrugado"]`;
    const input = dialog().locator(inputPath);
    await input.fill("Sin referencia");
    await page.getByRole("option", { name: "Sin referencia", exact: true }).click();
    await input.press("Tab");
    check((await input.inputValue()) === "", "Sin referencia deja vacío el renglón " + (i + 1));
  };
  const review = async () => {
    await button("Revisar orden").click();
    await reference(0).waitFor();
  };
  const assertReview = async (mode) => {
    for (const [index, [ref, quantity]] of expected.entries()) {
      const refValue = await reference(index).inputValue();
      check((ref === null ? refValue === "" : refValue !== "") &&
        (await boxes(index).inputValue()) === (quantity === null ? "" : String(quantity)),
        "Revisión conserva corrugado del renglón " + (index + 1) + " en " + mode);
    }
  };
  const assertSaved = async (id, mode) => {
    const lines = (await state()).orden_producto
      .filter((line) => line.id_orden_compra === id)
      .sort((a, b) => a.posicion - b.posicion);
    check(JSON.stringify(lines.map((line) => [line.ref_corrugado, line.cantidad_corrugado])) === JSON.stringify(expected),
      "Persistencia exacta de ambos campos en " + mode);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const sheet of [false, true]) {
    const mode = sheet ? "hoja" : "clásico";
    await page.goto(origin + "/ordenes/productos");
    await page.evaluate((enabled) => localStorage.setItem("gimed:ui:alternative-order-entry", String(enabled)), sheet);
    const before = new Set((await state()).orden_compra.map((order) => order.id));
    await page.getByRole("button", { name: "Nueva orden", exact: true }).click();
    await dialog().getByRole("textbox", { name: "Entrega solicitada", exact: true }).fill(delivery);
    const entryQuantity = (i) => sheet
      ? dialog().locator(`[data-sheet-row="${i}"][data-sheet-column="2"]`).getByRole("textbox")
      : dialog().getByRole("spinbutton", { name: "Cantidad solicitada", exact: true }).nth(i);
    for (const [i, item] of [product, product, product, other].entries()) {
      if (i && !sheet) await button("Agregar producto").click();
      const picker = sheet
        ? dialog().locator(`[data-sheet-row="${i}"][data-sheet-column="1"]`).getByRole("combobox")
        : dialog().getByRole("combobox", { name: "Producto", exact: true }).nth(i);
      await picker.fill(item.nombre_producto);
      await page.locator(`[role="option"][data-key="${item.id}"]`).click();
    }
    await review();
    const suggested = Math.ceil(product.unidades_lote / suggestion.unidades_por_corrugado) + 5;
    check(Boolean(await reference(0).inputValue()) && (await boxes(0).inputValue()) === String(suggested),
      "Corrugado configurado conserva sus sugerencias en " + mode);
    check((await reference(3).inputValue()) === "" && (await boxes(3).inputValue()) === "",
      "Producto sin corrugado pasa a revisión en " + mode);
    await clearReference(0);
    await boxes(0).fill("");
    await boxes(1).fill("");
    await clearReference(2);
    await boxes(2).fill("0");
    await button("Volver").click();
    await entryQuantity(1).fill("300");
    await review();
    await assertReview(mode);
    await button("Crear orden").click();
    await dialog().waitFor({ state: "hidden" });
    const order = (await state()).orden_compra.find((row) => !before.has(row.id));
    await assertSaved(order.id, mode);

    await page.goto(origin + "/ordenes/" + order.id);
    const savedAmounts = page.locator(".line-packaging > div:nth-child(2) dd");
    await savedAmounts.first().waitFor();
    check((await savedAmounts.allTextContents()).map((value) => value.trim()).join("|") ===
      "Sin informar|Sin informar|0|Sin informar",
      "Detalle distingue cantidad vacía de cero en " + mode);
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await review();
    await assertReview(mode + " después de editar");
    await button("Guardar cambios").click();
    await dialog().waitFor({ state: "hidden" });
    await assertSaved(order.id, mode + " después de editar");
  }
  return { checks };
}
