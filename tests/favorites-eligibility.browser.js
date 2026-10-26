async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw new Error(await response.text());
    return (await response.json()).result;
  };
  const initial = await state();
  const yes = initial.proveedor.find((p) => p.Es_materiales === true);
  const revoked = initial.proveedor.find(
    (p) => p.Es_materiales === true && p.id !== yes.id,
  );
  const other = initial.proveedor.find(
    (p) => p.Es_materiales === false && p.Es_maquila === false,
  );
  const type = initial.tipos_materiales.find(
    (t) => t.tipo_material === "Envase",
  );
  const changeFlag = async (id, flag) => {
    const db = await state();
    await command("saveEntity", {
      entity: "proveedor",
      key: { id },
      row: { ...db.proveedor.find((p) => p.id === id), Es_materiales: flag },
    });
  };
  await changeFlag(other.id, null);
  const open = () =>
    page
      .getByRole("button", {
        name: "Editar proveedores de Envase",
        exact: true,
      })
      .click();
  const editor = () =>
    page.getByRole("dialog", {
      name: "Editar proveedores · Envase",
      exact: true,
    });
  for (const width of [1440, 375]) {
    await changeFlag(revoked.id, true);
    let db = await state();
    await command("setFavoriteSuppliers", {
      id_tipo_material: type.id,
      id_proveedores: [yes.id, revoked.id],
      expected_id_proveedores: db.proveedores_favoritos
        .filter((r) => r.id_tipo_material === type.id)
        .map((r) => r.id_proveedor),
    });
    await changeFlag(revoked.id, false);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/catalogos?tab=proveedores_favoritos");
    const group = page
      .locator(".relation-group-row")
      .filter({ hasText: "Envase" });
    check(
      (await group.innerText()).includes("1 proveedor"),
      "Cuenta solo favoritos de materiales a " + width + "px",
    );
    await group.locator(".relation-toggle").click();
    const list = page.getByRole("table", {
      name: "Proveedores favoritos de Envase",
      exact: true,
    });
    check(
      (await list.innerText()).includes(yes.nombre_largo) &&
        !(await list.innerText()).includes(revoked.nombre_largo),
      "Listado oculta favoritos cuya bandera se retiró a " + width + "px",
    );
    const search = page.getByRole("textbox", {
      name: "Buscar tipo o proveedor",
      exact: true,
    });
    await search.fill(revoked.nombre_largo);
    await page.getByText("Sin coincidencias", { exact: true }).waitFor();
    check(
      await page.getByText("Sin coincidencias", { exact: true }).isVisible(),
      "Búsqueda no encuentra proveedores no elegibles a " + width + "px",
    );
    await page
      .getByRole("button", { name: "Limpiar búsqueda", exact: true })
      .click();
    await open();
    const form = editor();
    check(
      (await form.getByRole("checkbox").count()) === 1,
      "Editor ofrece solo proveedores con materiales true a " + width + "px",
    );
    check(
      await form
        .getByRole("checkbox", { name: new RegExp(yes.nombre_largo) })
        .isChecked(),
      "Conserva selección elegible a " + width + "px",
    );
    const selected = form.getByRole("region", {
      name: "Proveedores seleccionados",
      exact: true,
    });
    check(
      !(await selected.innerText()).includes(revoked.nombre_largo),
      "Selección final excluye relaciones heredadas no elegibles a " +
        width +
        "px",
    );
    const query = form.getByRole("textbox", {
      name: "Buscar proveedores disponibles",
      exact: true,
    });
    for (const provider of initial.proveedor.filter((p) => p.id !== yes.id)) {
      await query.fill(provider.nombre_largo);
      check(
        (await form.getByRole("checkbox").count()) === 0,
        "No ofrece " + provider.nombre_corto + " a " + width + "px",
      );
    }
    await query.fill("");
    await page.screenshot({
      path: `tests/evidence/favorites/eligibility-${width}.png`,
      fullPage: true,
    });
    await form
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await form.waitFor({ state: "hidden" });
    db = await state();
    check(
      JSON.stringify(
        db.proveedores_favoritos
          .filter((r) => r.id_tipo_material === type.id)
          .map((r) => r.id_proveedor),
      ) === JSON.stringify([yes.id]),
      "Guardar retira relaciones no elegibles solo del tipo editado a " +
        width +
        "px",
    );
  }
  await page.goto(origin + "/catalogos?tab=materiales");
  const material = initial.materiales.find(
    (m) => m.id_tipo_material === type.id,
  );
  await page
    .getByRole("row")
    .filter({ hasText: material.nombre_material })
    .getByRole("button", { name: /^Consultar historial/ })
    .click();
  const history = page.getByRole("dialog");
  const favorites = history
    .locator("h3")
    .filter({ hasText: "Proveedores favoritos del tipo Envase" })
    .locator("+ .inline");
  check(
    (await favorites.innerText()).includes(yes.nombre_largo) &&
      !(await favorites.innerText()).includes(revoked.nombre_largo),
    "Información del material muestra solo favoritos elegibles",
  );
  await history.getByRole("button", { name: /^Cerrar / }).click();

  for (const provider of [
    initial.proveedor.find((p) => p.Es_maquila && !p.Es_materiales),
    other,
    revoked,
  ]) {
    const db = await state();
    const before = JSON.stringify(db);
    const response = await page.request.post(origin + "/api/commands", {
      data: {
        name: "setFavoriteSuppliers",
        payload: {
          id_tipo_material: type.id,
          id_proveedores: [yes.id, provider.id],
          expected_id_proveedores: [yes.id],
        },
      },
    });
    const error = await response.json();
    check(
      response.status() === 422 &&
        error.code === "VALIDATION" &&
        !!error.fields.id_proveedores,
      "API rechaza proveedor no material: " + provider.nombre_corto,
    );
    check(
      JSON.stringify(await state()) === before,
      "API conserva datos al rechazar " + provider.nombre_corto,
    );
  }
  return { checks };
};
