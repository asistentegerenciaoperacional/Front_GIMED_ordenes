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
  const materialProvider = initial.proveedor.find((p) => p.Es_materiales);
  const otherProvider = initial.proveedor.find(
    (p) => p.Es_materiales === false && p.Es_maquila === false,
  );
  const created = [];
  for (let i = 0; i < 54; i++) {
    const type = i < 52 ? "producto" : i === 52 ? "material" : "otro";
    const result = await command("createOrder", {
      tipo_orden: type,
      id_proveedor:
        type === "producto"
          ? product.id_maquilador
          : type === "material"
            ? materialProvider.id
            : otherProvider.id,
      fecha_solicitada_entrega: "2099-02-15T12:00:00.000Z",
      lines: [
        {
          ...(type === "producto"
            ? { id_producto: product.id }
            : type === "material"
              ? { id_material: initial.materiales[0].id }
              : { producto: "Servicio de autorización" }),
          cantidad_solicitada: 100,
          precio_unitario: "2.50",
        },
      ],
    });
    created.push(result.orderId);
  }
  const baseline = await state();
  const newest = created[51],
    second = created[50];
  const reference = (id) => {
    const order = baseline.orden_compra.find((o) => o.id === id);
    return `${order.tipo_orden === "producto" ? "OC" : "OCM"} ${order.no_orden}`;
  };
  const url = (group = "productos") =>
    origin + `/ordenes/${group}?vista=no_autorizadas`;
  const row = (id) => page.locator(`[data-selection-key="${id}"]`);
  const checkbox = (id) =>
    page.getByRole("checkbox", {
      name: `Seleccionar ${reference(id)}`,
      exact: true,
    });
  const mode = () => page.locator(".authorization-selection");
  const dialog = () =>
    page.getByRole("dialog", { name: /^Autorizar órdenes \(\d+\)$/ });
  const start = async () =>
    page.getByRole("button", { name: "Autorizar", exact: true }).click();
  const continueButton = () =>
    page.getByRole("button", { name: "Continuar autorización", exact: true });
  const open = async () => continueButton().click();
  const sign = () => dialog().getByRole("checkbox");
  const confirm = () =>
    dialog().getByRole("button", {
      name: "Confirmar autorización",
      exact: true,
    });
  const closed = async (label) => {
    await mode().waitFor({ state: "hidden" });
    check((await page.locator("[data-selection-key]").count()) === 0, label);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url());
  await start();
  check(
    await continueButton().isDisabled(),
    "Continuar deshabilitado sin selección",
  );
  await checkbox(newest).check();
  await row(second)
    .locator('[role="gridcell"], [role="rowheader"], td')
    .nth(2)
    .click();
  check(
    await checkbox(second).isChecked(),
    "Clic de fila selecciona y actualiza la casilla",
  );
  check(
    (await mode().innerText()).includes("2 órdenes seleccionadas"),
    "Contador de selección actualizado",
  );
  await checkbox(second).focus();
  await checkbox(second).press("Space");
  check(
    !(await checkbox(second).isChecked()),
    "Teclado desmarca sin doble alternancia",
  );
  await open();
  check(
    (await dialog().getAttribute("aria-labelledby")) !== null &&
      (await dialog().getByRole("heading", { name: "Autorizar órdenes (1)" }).count()) === 1 &&
      (await dialog().getByRole("heading", { name: /Órdenes a autorizar/ }).count()) === 0,
    "El título muestra la cantidad sin repetir el encabezado de la lista",
  );
  check(
    await dialog().evaluate((node) => {
      const list = node.querySelector(".authorization-orders ul");
      const warning = node.querySelector(".notice.warning");
      return list && warning && !!(list.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        getComputedStyle(list).listStyleType === "disc";
    }),
    "Las órdenes aparecen con viñetas antes del aviso irreversible",
  );
  check(await confirm().isDisabled(), "Firmas obligatorias en el diálogo");
  check(
    (await dialog().locator(".authorization-orders").innerText()).includes(
      reference(newest),
    ),
    "Diálogo lista referencia y proveedor",
  );
  await sign().check();
  await page.keyboard.press("Escape");
  await dialog().waitFor({ state: "hidden" });
  check(
    await checkbox(newest).isChecked(),
    "Cerrar diálogo conserva la selección",
  );
  check(
    (await page.getByRole("alertdialog").count()) === 0,
    "Confirmación de firmas no activa aviso de formulario sin guardar",
  );
  await open();
  check(
    !(await sign().isChecked()),
    "Reabrir exige confirmar las firmas de nuevo",
  );
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await mode().getByRole("button", { name: "Cancelar", exact: true }).click();
  await closed("Cancelar desmonta casillas y sesión");
  await start();
  check(
    !(await checkbox(newest).isChecked()),
    "Reiniciar no recupera selección cancelada",
  );
  await checkbox(newest).check();
  const search = page.getByRole("textbox", {
    name: "Buscar órdenes",
    exact: true,
  });
  await search.fill(reference(newest).split(" ")[1]);
  await closed("Cambiar búsqueda desmonta la sesión");
  check(
    await search.evaluate((el) => el === document.activeElement),
    "Buscar conserva el foco al salir del modo",
  );
  await page.goBack();
  await closed("Volver no restaura la selección anterior");
  await page.goto(url());
  await start();
  await checkbox(newest).check();
  await page
    .getByRole("combobox", { name: "Filtro personalizado", exact: true })
    .selectOption("documento_sin");
  await closed("Filtro personalizado desmonta la sesión");
  await page.goto(url());
  await start();
  await checkbox(newest).check();
  await page
    .getByRole("button", { name: "Filtrar y ordenar Proveedor", exact: true })
    .click();
  await page.locator(".column-sort-actions button").first().click();
  await closed("Ordenar desmonta la sesión");
  await page.goto(url());
  await start();
  await checkbox(newest).check();
  await page
    .getByRole("button", { name: "Filtrar y ordenar Proveedor", exact: true })
    .click();
  await page
    .locator(".column-filter-dialog")
    .getByRole("checkbox")
    .last()
    .click();
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await closed("Filtro de columna desmonta la sesión");
  await page.goto(url());
  await start();
  await checkbox(newest).check();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await closed("Cambiar página desmonta la sesión");
  await start();
  check(
    (await mode().innerText()).includes("0 órdenes"),
    "Página siguiente inicia sesión vacía",
  );
  await page.goto(url());
  await start();
  await checkbox(newest).check();
  await page.getByRole("tab", { name: /^Seguimiento/ }).click();
  await closed("Cambiar vista desmonta la sesión");
  check(
    (await page
      .getByRole("button", { name: "Autorizar", exact: true })
      .count()) === 0,
    "Autorizar oculto fuera de No autorizadas",
  );
  await page.goto(url());
  await start();
  await checkbox(newest).check();
  await page.getByRole("tab", { name: "Materiales", exact: true }).click();
  await closed("Cambiar grupo desmonta la sesión");
  await page.goto(url());
  await start();
  await checkbox(newest).check();
  await row(newest)
    .getByRole("link", { name: reference(newest), exact: true })
    .click();
  check(
    page.url().includes("/ordenes/" + newest),
    "Enlace de fila navega sin alternar selección",
  );
  await page.goBack();
  await closed("Volver desde el detalle no restaura la sesión");

  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(url("materiales"));
    await start();
    await checkbox(created[52]).check();
    await checkbox(created[53]).check();
    await open();
    check(
      (await dialog().locator(".authorization-orders li").count()) === 2,
      "OCM y Otros se listan juntos a " + width,
    );
    check(
      await dialog().evaluate(
        (el) =>
          el.getBoundingClientRect().right <= innerWidth &&
          el.getBoundingClientRect().left >= 0,
      ),
      "Diálogo responsive a " + width,
    );
    const engine = await page.evaluate(() =>
      navigator.userAgent.includes("Firefox")
        ? "firefox"
        : navigator.userAgent.includes("AppleWebKit") &&
            !navigator.userAgent.includes("Chrome")
          ? "webkit"
          : "chromium",
    );
    await page.screenshot({
      path: `tests/evidence/authorization/${engine}-${width}.png`,
      fullPage: true,
    });
    await dialog()
      .getByRole("button", { name: /^Cerrar Autorizar/ })
      .click();
    check(
      await checkbox(created[52]).isChecked(),
      "X conserva selección a " + width,
    );
    await mode().getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url());
  await start();
  await checkbox(newest).check();
  await checkbox(second).check();
  await open();
  await command("authorizeOrder", { id: newest, confirm: true });
  const before = await state();
  await sign().check();
  await confirm().click();
  await dialog().locator(".error-notice").waitFor();
  check(
    (await dialog().locator(".authorization-conflicts").innerText()).includes(
      reference(newest),
    ),
    "Error API identifica la orden modificada concurrentemente",
  );
  check(
    JSON.stringify(await state()) === JSON.stringify(before),
    "Conflicto no autoriza parcialmente ni cambia otros datos",
  );
  check(
    (await dialog().locator(".authorization-orders li").count()) === 1,
    "Recarga descarta solo la selección no disponible",
  );
  check(
    (await confirm().count()) === 0 && (await sign().isDisabled()),
    "Conflicto exige revisar antes de volver a confirmar",
  );
  await dialog()
    .getByRole("button", { name: "Revisar selección", exact: true })
    .click();
  await open();
  await sign().check();
  let release;
  let requests = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/commands", async (route) => {
    if (route.request().postDataJSON().name === "authorizeOrders") {
      requests++;
      await gate;
    }
    await route.continue();
  });
  await confirm().click();
  check(
    await dialog()
      .getByRole("button", { name: "Autorizando…", exact: true })
      .isDisabled(),
    "Enviar bloquea doble confirmación",
  );
  check(
    await dialog()
      .getByRole("button", { name: /^Cerrar Autorizar/ })
      .isDisabled(),
    "Enviar deshabilita X",
  );
  await page.keyboard.press("Escape");
  check(await dialog().isVisible(), "Escape no cierra durante el envío");
  release();
  await dialog().waitFor({ state: "hidden" });
  await page.unroute("**/api/commands");
  await closed("Éxito desmonta la sesión");
  const after = await state();
  check(
    requests === 1 &&
      after.orden_compra.find((o) => o.id === second).estado_autorizacion ===
        "autorizada",
    "Una sola solicitud autoriza la selección revisada",
  );
  check(
    (await page
      .getByRole("link", { name: reference(second), exact: true })
      .count()) === 0,
    "Orden autorizada desaparece de No autorizadas",
  );
  await page.goto(url("materiales"));
  await start();
  await checkbox(created[52]).check();
  await checkbox(created[53]).check();
  await open();
  await sign().check();
  await confirm().click();
  await closed("Éxito múltiple OCM y Otros desmonta la sesión");
  const materialState = await state();
  check(
    created
      .slice(52)
      .every(
        (id) =>
          materialState.orden_compra.find((o) => o.id === id)
            .estado_autorizacion === "autorizada",
      ),
    "OCM y Otros autorizados desde Materiales",
  );
  const individual = created[49];
  await page.goto(origin + "/ordenes/" + individual);
  await start();
  const single = page.getByRole("dialog", {
    name: "Autorizar orden " + reference(individual).split(" ")[1],
    exact: true,
  });
  check(
    (await single.locator(".authorization-orders").count()) === 0,
    "Diálogo individual conserva su presentación sin lista plural",
  );
  await single.getByRole("checkbox").check();
  await single
    .getByRole("button", { name: "Confirmar autorización", exact: true })
    .click();
  await single.waitFor({ state: "hidden" });
  check(
    (await state()).orden_compra.find((o) => o.id === individual)
      .estado_autorizacion === "autorizada",
    "Autorización individual sigue funcionando",
  );
  return { checks };
};
