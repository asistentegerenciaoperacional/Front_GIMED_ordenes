async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const initial = await state();
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const shift = (offset) => {
    const date = new Date(day + "T12:00:00.000Z");
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const previous = shift(-1),
    future = shift(1);
  const inputDay = (value) => value.split("-").reverse().join("/");
  for (const type of ["producto", "material", "otro"]) {
    const payload = {
      tipo_orden: type,
      id_proveedor: initial.proveedor.find((row) =>
        type === "producto"
          ? row.Es_maquila
          : type === "material"
            ? row.Es_materiales
            : row.Es_maquila === false && row.Es_materiales === false,
      ).id,
      fecha_elaboracion: "2000-01-01T12:00:00.000Z",
      fecha_solicitada_entrega: previous + "T12:00:00.000Z",
      lines: [
        {
          ...(type === "producto"
            ? { id_producto: initial.productos[0].id }
            : type === "material"
              ? { id_material: initial.materiales[0].id }
              : { producto: "Servicio" }),
          cantidad_solicitada: 1,
          precio_unitario: "100.00",
        },
      ],
    };
    const response = await page.request.post(origin + "/api/commands", {
      data: { name: "createOrder", payload },
    });
    const error = await response.json();
    check(
      response.status() === 422 && error.code === "VALIDATION",
      "API rechaza entrega pasada para " + type,
    );
    check(
      error.message.includes("no puede ser anterior") &&
        error.fields.fecha_solicitada_entrega === error.message,
      "API devuelve mensaje y error del campo para " + type,
    );
  }
  check(
    JSON.stringify(await state()) === JSON.stringify(initial),
    "Rechazos no modifican órdenes, lotes ni consecutivos",
  );

  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/ordenes/materiales");
    await page
      .getByRole("button", { name: "Nueva orden", exact: true })
      .click();
    const form = page.getByRole("dialog", {
      name: "Nueva orden de compra",
      exact: true,
    });
    await form
      .getByRole("combobox", { name: "Tipo de orden", exact: true })
      .selectOption("otro");
    const elaboration = form.getByRole("textbox", {
      name: "Fecha de elaboración",
      exact: true,
    });
    const delivery = form.getByRole("textbox", {
      name: "Entrega solicitada",
      exact: true,
    });
    check(
      (await elaboration.inputValue()) === inputDay(day) &&
        (await elaboration.evaluate((el) => el.readOnly)),
      "Fecha de elaboración actual y de solo lectura a " + width + "px",
    );
    await form
      .getByRole("combobox", { name: "Producto o concepto", exact: true })
      .fill("Servicio prueba fecha " + width);
    await form
      .getByRole("combobox", { name: "Producto o concepto", exact: true })
      .press("Tab");
    await form
      .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
      .fill("1");
    await form
      .getByRole("textbox", { name: "Precio unitario", exact: true })
      .fill("100");
    await delivery.fill(inputDay(previous));
    await form
      .getByRole("button", { name: "Revisar orden", exact: true })
      .click();
    const banner = form.locator(".error-notice");
    await banner.waitFor();
    check(
      (await banner.innerText()).includes("no puede ser anterior"),
      "La entrega pasada aparece en el banner a " + width + "px",
    );
    check(
      await banner.evaluate((el) => el === document.activeElement),
      "El banner recibe foco a " + width + "px",
    );
    check(
      (await delivery.getAttribute("aria-invalid")) === "true",
      "Entrega marcada inválida a " + width + "px",
    );
    await page.screenshot({
      path: `tests/evidence/aria/order-creation-date-${width}.png`,
      fullPage: true,
    });
    await delivery.fill(inputDay(shift(-2)));
    check(
      await banner.isVisible(),
      "Otra fecha pasada conserva el error a " + width + "px",
    );
    await delivery.fill(inputDay(day));
    await banner.waitFor({ state: "hidden" });
    check(true, "Corregir al mismo día retira el error a " + width + "px");
    await form
      .getByRole("button", { name: "Revisar orden", exact: true })
      .click();
    check(
      await form
        .getByRole("button", { name: "Crear orden", exact: true })
        .isVisible(),
      "Entrega el mismo día permite revisar a " + width + "px",
    );

    // Exercise the real server error after review, as when a draft becomes stale at midnight.
    let rejectOnce = true;
    const intercept = async (route) => {
      const request = route.request();
      if (
        rejectOnce &&
        request.method() === "POST" &&
        request.postDataJSON()?.name === "createOrder"
      ) {
        rejectOnce = false;
        const body = request.postDataJSON();
        await route.continue({
          postData: JSON.stringify({
            ...body,
            payload: {
              ...body.payload,
              fecha_solicitada_entrega: previous + "T12:00:00.000Z",
            },
          }),
        });
      } else await route.continue();
    };
    await page.route("**/api/commands", intercept);
    await form
      .getByRole("button", { name: "Crear orden", exact: true })
      .click();
    await banner.waitFor();
    check(
      (await banner.innerText()).includes("no puede ser anterior") &&
        (await delivery.isVisible()),
      "Error real de API vuelve al formulario con banner a " + width + "px",
    );
    check(
      (await form
        .getByRole("combobox", { name: "Producto o concepto", exact: true })
        .inputValue()) ===
        "Servicio prueba fecha " + width,
      "El error conserva el borrador a " + width + "px",
    );
    check(
      JSON.stringify(await state()) === JSON.stringify(initial),
      "Rechazo final conserva los datos y el consecutivo a " + width + "px",
    );
    await page.unroute("**/api/commands", intercept);
    await delivery.fill(inputDay(future));
    await banner.waitFor({ state: "hidden" });
    await form
      .getByRole("button", { name: "Revisar orden", exact: true })
      .click();
    await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  return { checks };
};
