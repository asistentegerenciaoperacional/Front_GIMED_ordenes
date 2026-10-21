async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const checks = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    checks.push(name);
  };
  const sid = (n) => n.toString(16).padStart(24, "0");
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw new Error(await response.text());
    return (await response.json()).result;
  };
  let db = await state();
  const names = Object.fromEntries(
    db.proveedor.map((p) => [p.id, p.nombre_largo ?? p.nombre_corto]),
  );
  await command("saveEntity", {
    entity: "proveedor",
    key: { id: sid(5) },
    row: { ...db.proveedor.find((p) => p.id === sid(5)), Es_materiales: true },
  });
  await command("saveEntity", {
    entity: "tipos_materiales",
    row: { id: sid(500), tipo_material: "Tipo sin favoritos" },
  });
  const open = async (type = "Envase") =>
    page
      .getByRole("button", {
        name: "Editar proveedores de " + type,
        exact: true,
      })
      .click();
  const dialog = () => page.getByRole("dialog", { name: /Editar proveedores/ });
  const final = () =>
    dialog().getByRole("region", { name: "Proveedores seleccionados", exact: true });
  const choice = (id) =>
    dialog().getByRole("checkbox", { name: new RegExp(names[id]) });
  const close = async () => {
    await dialog()
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    const confirmation = page.getByRole("alertdialog");
    if (await confirmation.count())
      await confirmation
        .getByRole("button", { name: "Descartar cambios", exact: true })
        .click();
    await dialog().waitFor({ state: "hidden" });
  };
  await page.goto(origin + "/catalogos?tab=materiales");
  for (const label of [
    "101 · Envase ámbar 250 ml",
    "107 · Envase blanco 100 ml",
  ]) {
    await page
      .getByRole("button", {
        name: "Consultar historial de " + label,
        exact: true,
      })
      .click();
    const history = page.getByRole("dialog", { name: label, exact: true });
    await history
      .getByRole("heading", {
        name: "Proveedores favoritos del tipo Envase",
        exact: true,
      })
      .waitFor();
    check(
      (await history
        .locator(".badge")
        .filter({ hasText: names[sid(3)] })
        .isVisible()) &&
        (await history
          .locator(".badge")
          .filter({ hasText: names[sid(4)] })
          .isVisible()),
      "El material " + label + " hereda los favoritos comunes del tipo",
    );
    await history
      .getByRole("button", { name: "Cerrar " + label, exact: true })
      .click();
  }
  await page.goto(origin + "/catalogos?tab=proveedores_favoritos");
  await page
    .getByRole("heading", {
      name: "Proveedores favoritos por tipo",
      exact: true,
    })
    .waitFor();
  check(
    (await page
      .getByRole("button", { name: "Agregar", exact: true })
      .count()) === 0,
    "Sin Agregar global en favoritos",
  );
  check(
    (await page
      .getByRole("button", { name: /^Editar proveedores de / })
      .count()) === 7,
    "Una fila por cada tipo, incluidos tipos vacíos",
  );
  check(
    await page
      .getByRole("button", {
        name: "Mostrar proveedores de Tipo sin favoritos",
        exact: true,
      })
      .isDisabled(),
    "Despliegue vacío bloqueado; lápiz habilitado",
  );
  await page
    .getByRole("button", { name: "Mostrar proveedores de Envase", exact: true })
    .click();
  check(
    await page
      .locator(".relation-provider-list")
      .first()
      .getByText(names[sid(3)], { exact: true })
      .isVisible(),
    "Proveedores aparecen en la fila desplegada",
  );
  check(
    (await page
      .locator(".relation-details")
      .first()
      .locator("xpath=ancestor::*[@colspan][1]")
      .getAttribute("colspan")) === "3",
    "Detalle abarca las tres columnas",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "tests/evidence/favorites/groups-expanded-1440.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Ocultar proveedores de Envase", exact: true })
    .click();
  const search = page.getByRole("searchbox", {
    name: "Buscar tipo o proveedor",
    exact: true,
  });
  await search.fill(names[sid(3)]);
  await page.locator(".relation-details").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".relation-details").length === 2);
  check(
    (await page.locator(".relation-details").count()) === 2,
    "Buscar proveedor abre los dos tipos asociados",
  );
  await page
    .getByRole("button", { name: "Ocultar proveedores de Envase", exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll(".relation-details").length === 1);
  check(
    (await page.locator(".relation-details").count()) === 1,
    "Los grupos abiertos por búsqueda pueden cerrarse manualmente",
  );
  await search.fill("ningún resultado xyz");
  await page.getByRole("heading", { name: "Sin coincidencias" }).waitFor();
  check(
    (await page
      .getByRole("button", { name: /^Editar proveedores de / })
      .count()) === 0,
    "Búsqueda sin resultados",
  );
  await search.fill("");
  await page
    .getByRole("button", { name: "Editar proveedores de Envase", exact: true })
    .waitFor();

  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await open();
    check(
      await dialog()
        .getByRole("textbox", { name: "Tipo de material", exact: true })
        .isDisabled(),
      `Tipo bloqueado a ${width}px`,
    );
    check(
      (await choice(sid(3)).isChecked()) && (await choice(sid(4)).isChecked()),
      `Selección inicial heredada a ${width}px`,
    );
    const find = dialog().getByRole("searchbox", {
      name: "Buscar proveedores disponibles",
      exact: true,
    });
    await find.fill(names[sid(5)]);
    await choice(sid(5)).check();
    await final().getByRole("button", { name: "Quitar " + names[sid(5)], exact: true }).waitFor();
    check(
      (await final()
        .getByRole("button", { name: /^Quitar / })
        .count()) === 3,
      `Buscar y seleccionar conserva los favoritos ocultos a ${width}px`,
    );
    await find.fill("sin coincidencias xyz");
    check(
      (await dialog()
        .getByText("No hay proveedores coincidentes.", { exact: true })
        .isVisible()) &&
        (await final()
          .getByRole("button", { name: /^Quitar / })
          .count()) === 3,
      `Selección final independiente de la búsqueda a ${width}px`,
    );
    await final()
      .getByRole("button", { name: "Quitar " + names[sid(4)], exact: true })
      .click();
    await find.fill("");
    check(
      !(await choice(sid(4)).isChecked()),
      `Quitar de selección final sincroniza casilla a ${width}px`,
    );
    const stacked = await dialog()
      .locator(".relation-picker")
      .evaluate((el) => {
        const a = el.querySelector(".relation-available-column");
        const b = el.querySelector(".relation-final");
        return (
          Math.abs(
            a.getBoundingClientRect().top - b.getBoundingClientRect().top,
          ) > 30
        );
      });
    check(stacked === (width === 375), `Distribución adaptable a ${width}px`);
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Sin desbordamiento de página a ${width}px`,
    );
    await page.screenshot({
      path: `tests/evidence/favorites/editor-${width}.png`,
      fullPage: true,
    });
    await dialog()
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    check(
      await dialog().isVisible(),
      `Cancelar descarte conserva borrador a ${width}px`,
    );
    await close();
    check(
      (await state()).proveedores_favoritos.filter(
        (r) => r.id_tipo_material === sid(40),
      ).length === 2,
      `Descartar no guarda a ${width}px`,
    );
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Editar proveedores de Envase",
    );
    check(
      await page
        .getByRole("button", {
          name: "Editar proveedores de Envase",
          exact: true,
        })
        .evaluate((el) => el === document.activeElement),
      `Foco vuelve al lápiz a ${width}px`,
    );
  }
  await open("Tipo sin favoritos");
  check(
    await final()
      .getByText("Sin proveedores favoritos para este tipo de material.", {
        exact: true,
      })
      .isVisible(),
    "Selección vacía explicada",
  );
  await choice(sid(3)).focus();
  await choice(sid(3)).press("Space");
  check(await choice(sid(3)).isChecked(), "Selección múltiple con teclado");
  await dialog()
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  check(
    (await state()).proveedores_favoritos.some(
      (r) => r.id_tipo_material === sid(500) && r.id_proveedor === sid(3),
    ),
    "Guardar configura un tipo antes vacío",
  );

  await open();
  await final()
    .getByRole("button", { name: "Quitar " + names[sid(4)], exact: true })
    .click();
  await choice(sid(5)).check();
  await command("setFavoriteSuppliers", {
    id_tipo_material: sid(40),
    id_proveedores: [sid(3)],
    expected_id_proveedores: [sid(3), sid(4)],
  });
  await dialog()
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await dialog().getByRole("alert").waitFor();
  check(
    await final()
      .getByRole("button", { name: "Quitar " + names[sid(5)], exact: true })
      .isVisible(),
    "Conflicto conserva borrador",
  );
  check(
    await dialog()
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .isDisabled(),
    "Conflicto impide sobrescribir sin revisar",
  );
  await dialog()
    .getByRole("button", { name: "Revisar selección actual", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Revisar selección actual", exact: true })
    .click();
  check(
    (await final()
      .getByRole("button", { name: /^Quitar / })
      .count()) === 1,
    "Revisión carga selección guardada más reciente",
  );
  await dialog()
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });

  await open();
  await choice(sid(4)).check();
  await page.route("**/api/commands", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fallo de servicio simulado",
        code: "SERVER",
      }),
    }),
  );
  await dialog()
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await dialog()
    .getByText("Fallo de servicio simulado", { exact: true })
    .waitFor();
  check(
    await choice(sid(4)).isChecked(),
    "Error de servicio conserva borrador",
  );
  await page.unroute("**/api/commands");
  let release;
  let requests = 0;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/commands", async (route) => {
    requests++;
    await pending;
    await route.continue();
  });
  await dialog()
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  check(
    (await dialog()
      .getByRole("button", { name: /^Cerrar Editar proveedores/ })
      .isDisabled()) && (await choice(sid(3)).isDisabled()),
    "Guardar bloquea cierre y selección",
  );
  await page.keyboard.press("Escape");
  check(
    (await dialog().isVisible()) &&
      (await page.getByRole("alertdialog").count()) === 0,
    "Escape no interrumpe un guardado pendiente",
  );
  release();
  await dialog().waitFor({ state: "hidden" });
  await page.unroute("**/api/commands");
  check(requests === 1, "Solo se envía una operación durante el guardado");
  check(
    (await state()).proveedores_favoritos.filter(
      (r) => r.id_tipo_material === sid(40),
    ).length === 2,
    "Reintento guarda todos los cambios juntos",
  );
  await open("Tipo sin favoritos");
  await final()
    .getByRole("button", { name: "Quitar " + names[sid(3)], exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  check(
    !(await state()).proveedores_favoritos.some(
      (r) => r.id_tipo_material === sid(500),
    ),
    "Guardar vacío elimina únicamente las relaciones",
  );

  db = await state();
  const twin = {
    ...db.proveedor.find((p) => p.id === sid(3)),
    id: sid(501),
    nit: "999999991",
  };
  await command("saveEntity", { entity: "proveedor", row: twin });
  await page.reload();
  await open();
  await dialog()
    .getByRole("searchbox", {
      name: "Buscar proveedores disponibles",
      exact: true,
    })
    .fill(names[sid(3)]);
  check(
    (await dialog().getByRole("checkbox").count()) === 2,
    "Homónimos siguen siendo dos opciones con NIT distinto",
  );
  await dialog()
    .getByRole("checkbox", { name: /NIT 999999991/ })
    .check();
  await dialog()
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  check(
    (await state()).proveedores_favoritos
      .filter((r) => r.id_tipo_material === sid(40))
      .map((r) => r.id_proveedor)
      .includes(sid(501)),
    "El homónimo elegido conserva su ID propio",
  );

  await page.screenshot({
    path: "tests/evidence/favorites/groups-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 460 });
  const pencil = page.getByRole("button", {
    name: "Editar proveedores de Tipo sin favoritos",
    exact: true,
  });
  await pencil.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  await pencil.click();
  await close();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Editar proveedores de Tipo sin favoritos",
  );
  check(
    Math.abs((await page.evaluate(() => window.scrollY)) - scroll) <= 1,
    "Cerrar editor conserva el desplazamiento de la tabla",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/ordenes/materiales");
  await page.getByRole("button", { name: "Nueva orden", exact: true }).click();
  const order = page.getByRole("dialog", {
    name: "Nueva orden de compra",
    exact: true,
  });
  const provider = order.getByRole("combobox", { name: "Proveedor", exact: true });
  const before = await provider.inputValue();
  await provider.locator("..").getByRole("button", { name: "Mostrar opciones", exact: true }).click();
  check(
    (await page.getByText("Favoritos", { exact: true }).isVisible()) &&
      (await page.getByText("Otros proveedores", { exact: true }).isVisible()),
    "Selector tiene secciones Favoritos y Otros proveedores",
  );
  check(
    await page
      .getByRole("option", { name: names[sid(5)], exact: true })
      .isVisible(),
    "Otros proveedores siguen disponibles",
  );
  await page.getByRole("option", { name: names[sid(5)], exact: true }).click();
  const material = order.getByRole("combobox", { name: "Material", exact: true });
  await material.selectOption(sid(51));
  check(
    (await provider.inputValue()) === names[sid(5)],
    "Cambiar material conserva proveedor elegido aunque no sea favorito",
  );
  await provider.locator("..").getByRole("button", { name: "Mostrar opciones", exact: true }).click();
  check(
    await page.locator(`[role="option"][data-key="${sid(3)}"]`).isVisible(),
    "Favoritos del nuevo tipo disponibles",
  );
  check(
    (
      await page.locator(`[role="option"][data-key="${sid(3)}"]`).textContent()
    ).includes("NIT") &&
      (
        await page
          .locator(`[role="option"][data-key="${sid(501)}"]`)
          .textContent()
      ).includes("999999991"),
    "Selector distingue proveedores homónimos por NIT",
  );
  await page.keyboard.press("Escape");
  await order.getByRole("button", { name: "Cancelar", exact: true }).click();
  if (await page.getByRole("alertdialog").count())
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Descartar cambios", exact: true })
      .click();
  check(errors.length === 0, "Sin errores de ejecución");
  return { date: new Date().toISOString(), checks, errors };
};
