async (page) => {
  const origin = new URL(page.url()).origin;
  const initialPage = page;
  const checks = [];
  const errors = [];
  const initial = await (await page.request.get(origin + "/api/state")).json();
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const visit = async (path, width = 1440) => {
    const previous = page;
    page = await page.context().newPage();
    page.setDefaultTimeout(8000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        ["warning", "error"].includes(message.type()) &&
        !message.text().startsWith("Failed to load resource:")
      )
        errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + path);
    await page.locator(".page-heading").waitFor();
    if (previous !== initialPage) await previous.close();
  };
  const dialog = () => page.getByRole("dialog").last();
  const field = (path) =>
    dialog().locator(`[data-field-path=${JSON.stringify(path)}]`);
  const audit = async (label) => {
    const notice = page.locator(".error-notice").last();
    await notice.waitFor();
    const result = await page.evaluate(() => {
      const controls = [
        ...document.querySelectorAll(
          'input[aria-invalid="true"],textarea[aria-invalid="true"],.field.invalid .aria-select-control,.aria-select-root[data-invalid] .aria-select-control',
        ),
      ];
      return {
        invalid: controls.length,
        red: controls.every(
          (control) =>
            getComputedStyle(control).borderColor === "rgb(220, 38, 38)",
        ),
        descriptions: controls.every((control) =>
          (control.getAttribute("aria-describedby") ?? "")
            .split(" ")
            .filter(Boolean)
            .some((id) => document.getElementById(id)),
        ),
        hiddenMessages: [...document.querySelectorAll(".field-error")].every(
          (message) => message.classList.contains("visually-hidden"),
        ),
        summaries: document.querySelectorAll(".error-notice").length,
      };
    });
    check(
      result.invalid > 0 && result.red,
      label + ": todos los campos inválidos tienen borde rojo",
    );
    check(
      result.hiddenMessages && result.summaries === 1,
      label + ": un único aviso visible, sin mensajes debajo",
    );
    check(
      result.descriptions,
      label + ": descripciones accesibles de los campos",
    );
    const links = notice.getByRole("link");
    if (await links.count()) {
      await links.first().click();
      check(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-invalid") === "true" ||
            Boolean(document.activeElement?.closest(".field.invalid")),
        ),
        label + ": el resumen enfoca el campo",
      );
    }
  };
  const catalogCases = [
    ["productos", "/catalogos?tab=productos"],
    ["categorias", "/catalogos?tab=categorias", "iva", "1.5"],
    ["costos_maquila", "/catalogos?tab=costos_maquila"],
    ["materiales", "/catalogos?tab=materiales"],
    [
      "tipos_materiales",
      "/catalogos?tab=tipos_materiales",
      "tipo_material",
      initial.tipos_materiales[0].tipo_material,
    ],
    [
      "materiales_asociados",
      "/catalogos?tab=materiales_asociados",
      "id_material",
      "",
    ],
    [
      "producto_corrugado",
      "/catalogos?tab=producto_corrugado",
      "unidades_por_corrugado",
      "1.5",
    ],
    ["proveedor", "/proveedores", "nit", "900.123.404-55"],
    ["direccion_proveedor", "/proveedores?tab=direccion_proveedor"],
    ["contacto", "/proveedores?tab=contacto"],
    ["contacto_interno", "/configuracion", null, null, "Contactos internos"],
    [
      "destinatario_evento",
      "/configuracion",
      null,
      null,
      "Destinatarios sugeridos",
    ],
    ["adjunto_evento", "/configuracion", null, null, "Adjuntos por evento"],
    ["lote_material", "/abastecimiento?tab=lotes"],
  ];
  for (const width of [1440, 375]) {
    for (const [entity, route, invalidPath, value, tab] of catalogCases) {
      await visit(route, width);
      if (tab) await page.getByRole("tab", { name: tab, exact: true }).click();
      if (entity === "materiales_asociados" || entity === "producto_corrugado") {
        await page.getByRole("button", { name: "Editar materiales de " + initial.productos[0].nombre_producto, exact: true }).click();
        await field("corrugado.unidades_por_corrugado").fill(entity === "materiales_asociados" ? "" : "1.5");
        await dialog().getByRole("button", { name: "Guardar cambios", exact: true }).click();
        await audit(`${entity} ${width}`);
        continue;
      }
      const add = page.getByRole("button", { name: "Agregar", exact: true });
      if (await add.count()) await add.first().click();
      else
        await page
          .getByRole("button", { name: /^Editar/ })
          .first()
          .click();
      await dialog().waitFor();
      if (invalidPath) await field(invalidPath).fill(value);
      await dialog()
        .getByRole("button", { name: "Guardar registro", exact: true })
        .click();
      await audit(`${entity} ${width}`);
      if (entity === "productos")
        await page.screenshot({
          path: `tests/evidence/aria/form-validation-products-${width}.png`,
        });
    }
    for (const type of ["producto", "material", "otro"]) {
      await visit(
        type === "producto" ? "/ordenes/productos" : "/ordenes/materiales",
        width,
      );
      await page
        .getByRole("button", { name: "Nueva orden", exact: true })
        .click();
      await field("tipo_orden").selectOption(type);
      await field("lines.0.cantidad_solicitada").fill("1.5");
      await field("lines.0.precio_unitario").fill("incorrecto");
      await dialog()
        .getByRole("button", { name: "Revisar orden", exact: true })
        .click();
      await audit(`Nueva orden ${type} ${width}`);
      if (type === "producto")
        await page.screenshot({
          path: `tests/evidence/aria/form-validation-order-${width}.png`,
        });
    }
    await visit("/facturas", width);
    await page
      .getByRole("button", { name: "Agregar factura", exact: true })
      .click();
    await dialog()
      .getByRole("button", { name: "Guardar factura", exact: true })
      .click();
    await audit(`Factura ${width}`);
    await dialog()
      .getByRole("button", { name: "Seleccionar documento", exact: true })
      .click();
    await field("nombre_archivo").fill("");
    await dialog()
      .getByRole("button", { name: /Guardar placeholder/, exact: true })
      .click();
    const nestedNotice = dialog().locator(".error-notice");
    await nestedNotice.waitFor();
    check(
      (await field("nombre_archivo").getAttribute("aria-invalid")) === "true",
      `Documento anidado ${width}: borde inválido independiente`,
    );
    check(
      (await page.locator("form form").count()) === 0,
      `Documento anidado ${width}: formularios independientes`,
    );
    await visit("/codigos", width);
    await page
      .getByRole("button", { name: "Registrar código", exact: true })
      .click();
    await field("codigo").fill("");
    await dialog()
      .getByRole("button", { name: "Registrar código", exact: true })
      .click();
    await audit(`Registro GS1 ${width}`);
    await visit("/configuracion", width);
    await page
      .locator('[data-field-path="margen_tolerancia_pct"]')
      .fill("1000");
    await page
      .getByRole("button", { name: "Guardar nueva configuración", exact: true })
      .click();
    await audit(`Tolerancia ${width}`);
  }
  await visit("/ordenes/productos");
  await page.getByRole("button", { name: "Nueva orden", exact: true }).click();
  await field("fecha_elaboracion").fill("31/02/2026");
  await field("fecha_solicitada_entrega").focus();
  await audit("Fecha inexistente al salir del campo");
  await field("fecha_elaboracion").fill("24/10/2026");
  await page.locator(".error-notice").waitFor({ state: "hidden" });
  check(
    await field("fecha_elaboracion").evaluate(
      (control) => control === document.activeElement,
    ),
    "Corregir fecha elimina aviso y conserva foco",
  );
  for (const type of ["producto", "material", "otro"]) {
    const order =
      initial.orden_compra.find(
        (row) =>
          row.tipo_orden === type && row.estado_autorizacion === "autorizada",
      ) ?? initial.orden_compra.find((row) => row.tipo_orden === type);
    if (order.estado_autorizacion === "autorizada") {
      await visit("/ordenes/" + order.id);
      if (type === "producto")
        await page
          .getByRole("button", { name: "Agregar lote", exact: true })
          .first()
          .click();
      else
        await page
          .getByRole("button", { name: "Registrar / editar", exact: true })
          .first()
          .click();
      await field("cantidad_recibida").fill("1.5");
      await dialog()
        .getByRole("button", {
          name: type === "producto" ? "Guardar lote" : "Guardar recepción",
          exact: true,
        })
        .click();
      await audit(`Recepción ${type}`);
    }
    await visit("/ordenes/" + order.id);
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await field("fecha_solicitada_entrega").fill("");
    await dialog()
      .getByRole("button", { name: "Revisar orden", exact: true })
      .click();
    await audit(`Editar orden ${type}`);
  }
  await visit("/correos");
  await page
    .getByRole("button", { name: "Preparar correo", exact: true })
    .click();
  await field("orderId").selectOption(initial.orden_compra[0].id);
  await dialog().getByRole("button", { name: "Agregar", exact: true }).click();
  await dialog()
    .getByRole("combobox", { name: /Dirección de destinatario/ })
    .last()
    .fill("incorrecto");
  if (await page.locator(".aria-options").count())
    await page.keyboard.press("Escape");
  const mail = page.locator("section.dialog").last();
  await mail
    .getByRole("button", { name: "Simular envío", exact: true })
    .click();
  await audit("Correo con dirección inválida");
  check(errors.length === 0, "Sin errores ni advertencias JavaScript");
  const final = await (await page.request.get(origin + "/api/state")).json();
  check(
    JSON.stringify(final) === JSON.stringify(initial),
    "El recorrido no guarda ni modifica registros",
  );
  return { checks, errors, widths: [1440, 375], savedRecords: 0 };
};
