async (page) => {
  page.setDefaultTimeout(8000);
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
  const material = initial.materiales.find((m) => m.codigo_material === 101);
  const product = initial.productos.find((p) =>
    initial.materiales_asociados.some(
      (r) => r.id_producto === p.id && r.id_material === material.id,
    ),
  );
  const orders = [];
  for (const date of ["2027-02-15", "2027-02-22"]) {
    const result = await command("createOrder", {
      tipo_orden: "producto",
      id_proveedor: product.id_maquilador,
      fecha_solicitada_entrega: date + "T12:00:00.000Z",
      lines: [
        {
          id_producto: product.id,
          cantidad_solicitada: 100,
          precio_unitario: "100.00",
        },
      ],
    });
    await command("authorizeOrder", { id: result.orderId, confirm: true });
    orders.push(result.orderId);
  }
  const baseline = await state();
  const lines = orders.map((id) =>
    baseline.orden_producto.find((line) => line.id_orden_compra === id),
  );
  const form = () =>
    page.getByRole("dialog", { name: "Nueva orden de compra", exact: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + "/abastecimiento?tab=pendientes");
    await page.locator('[id="field-desde"]').fill("01/02/2027");
    await page.locator('[id="field-hasta"]').fill("28/02/2027");
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    for (const line of [...lines].reverse())
      await page
        .locator(`[data-need="${line.id}/${material.id}"]`)
        .getByRole("checkbox")
        .check();
    await page
      .getByRole("button", { name: "Elaborar OCM", exact: true })
      .click();
    await form()
      .getByRole("textbox", { name: "Precio unitario", exact: true })
      .fill("100");
    const delivery = form().getByRole("textbox", {
      name: "Entrega solicitada",
      exact: true,
    });
    const banner = form().locator(".error-notice");
    const quantity = form().getByRole("spinbutton", {
      name: "Cantidad solicitada",
      exact: true,
    });
    const beforeQuantity = await quantity.inputValue();
    for (const date of ["15/02/2027", "20/02/2027", "22/02/2027"]) {
      await delivery.fill(date);
      await form()
        .getByRole("button", { name: "Revisar orden", exact: true })
        .click();
      await banner.waitFor();
      check(
        (await banner.innerText()).includes("OCM debe ser anterior") &&
          (await banner.innerText()).includes("15/02/2027"),
        "Banner usa la OC más próxima al rechazar " +
          date +
          " a " +
          width +
          "px",
      );
      check(
        (await delivery.getAttribute("aria-invalid")) === "true",
        "Fecha marcada inválida para " + date + " a " + width + "px",
      );
    }
    check(
      await banner.evaluate((el) => el === document.activeElement),
      "El banner recibe foco a " + width + "px",
    );
    await page.screenshot({
      path: `tests/evidence/ocm/material-delivery-${width}.png`,
      fullPage: true,
    });
    await delivery.fill("16/02/2027");
    check(
      await banner.isVisible(),
      "Corregir a otra fecha inválida conserva el banner a " + width + "px",
    );
    await delivery.fill("14/02/2027");
    await banner.waitFor({ state: "hidden" });
    await form()
      .getByRole("button", { name: "Revisar orden", exact: true })
      .click();
    check(
      await form()
        .getByRole("button", { name: "Crear orden", exact: true })
        .isVisible(),
      "Fecha anterior permite revisar a " + width + "px",
    );

    const intercept = async (route) => {
      const body = route.request().postDataJSON();
      await route.continue({
        postData: JSON.stringify({
          ...body,
          payload: {
            ...body.payload,
            fecha_solicitada_entrega: "2027-02-15T12:00:00.000Z",
          },
        }),
      });
    };
    await page.route("**/api/commands", intercept);
    const pending = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/commands") &&
        response.request().method() === "POST",
    );
    await form()
      .getByRole("button", { name: "Crear orden", exact: true })
      .click();
    const response = await pending;
    const error = await response.json();
    check(
      response.status() === 422 &&
        error.code === "VALIDATION" &&
        error.fields.fecha_solicitada_entrega === error.message,
      "API devuelve error del campo de entrega a " + width + "px",
    );
    await banner.waitFor();
    check(
      (await banner.innerText()).includes("OCM debe ser anterior") &&
        (await delivery.isVisible()),
      "Error real de API vuelve a captura y aparece en el banner a " +
        width +
        "px",
    );
    check(
      (await quantity.inputValue()) === beforeQuantity,
      "Rechazo conserva cantidades y borrador a " + width + "px",
    );
    check(
      JSON.stringify(await state()) === JSON.stringify(baseline),
      "Rechazo conserva órdenes, vínculos y consecutivo a " + width + "px",
    );
    await page.unroute("**/api/commands", intercept);
    await delivery.fill("13/02/2027");
    await banner.waitFor({ state: "hidden" });
    await form()
      .getByRole("button", { name: "Volver a selección", exact: true })
      .click();
    const discard = page.getByRole("alertdialog");
    if (await discard.count())
      await discard
        .getByRole("button", { name: "Descartar cambios", exact: true })
        .click();
    await form().waitFor({ state: "hidden" });
  }
  return { checks };
};
