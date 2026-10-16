async (page) => {
  const origin = new URL(page.url()).origin,
    checks = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  const check = (value, label) => {
    if (!value) throw new Error(label);
    checks.push(label);
  };
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/tests/live-errors.html?fixture=aria");
    const form = page.getByRole("dialog", {
      name: "Controles accesibles",
      exact: true,
    });
    await form.waitFor();
    const product = form.getByRole("combobox", {
      name: "Producto",
      exact: true,
    });
    await product.fill("zzzz sin resultado");
    await page.getByText("Sin coincidencias", { exact: true }).waitFor();
    check(
      (await form
        .locator('[aria-label="Selección guardada"]')
        .textContent()) === "Sin selección",
      "Texto sin coincidencias no sustituye el identificador a " + width,
    );
    await product.fill("repetido");
    await page.getByRole("option").first().waitFor();
    check(
      (await page.getByRole("option").count()) === 2,
      "Nombres iguales mantienen dos opciones a " + width,
    );
    await page.screenshot({
      path: "tests/evidence/aria/combobox-" + width + ".png",
    });
    await page.locator('[role=option][data-key="same-name-2"]').click();
    check(
      (await form
        .locator('[aria-label="Selección guardada"]')
        .textContent()) === "same-name-2",
      "Elección conserva el segundo ID a " + width,
    );
    await product.fill("repetido");
    await page.locator('[role=option][data-key="same-name-1"]').click();
    check(
      (await form
        .locator('[aria-label="Selección guardada"]')
        .textContent()) === "same-name-1",
      "Elección cambia al primer ID con el mismo nombre a " + width,
    );
    const date = form.getByRole("textbox", { name: "Fecha", exact: true });
    await date.fill("24102026");
    check(
      (await date.inputValue()) === "24/10/2026",
      "Pegado añade separadores a " + width,
    );
    await date.fill("24/10/20");
    await date.press("Tab");
    check(
      (await date.getAttribute("aria-invalid")) === "true",
      "Fecha parcial permanece inválida a " + width,
    );
    await date.fill("31/02/2026");
    await date.press("Tab");
    check(
      (await date.getAttribute("aria-invalid")) === "true",
      "Fecha inexistente permanece inválida a " + width,
    );
    await date.fill("24/10/2026");
    await form
      .getByRole("button", { name: "Abrir calendario: Fecha", exact: true })
      .click();
    const calendar = page.getByRole("dialog", {
      name: "Calendario: Fecha",
      exact: true,
    });
    await calendar.waitFor();
    await calendar.getByRole("gridcell").first().waitFor();
    if (width === 1440)
      await page.screenshot({ path: "tests/evidence/aria/calendar-1440.png" });
    await page.keyboard.press("Escape");
    await calendar.waitFor({ state: "hidden" });
    check(
      await form.isVisible(),
      "Calendario anidado cierra sin cerrar formulario a " + width,
    );
    await form
      .getByRole("button", { name: "Abrir calendario: Fecha", exact: true })
      .click();
    await calendar.getByRole("gridcell").first().waitFor();
    await page.waitForFunction(
      () => !!document.activeElement?.closest('[role="gridcell"]'),
    );
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await calendar.waitFor({ state: "hidden" });
    check(
      (await date.inputValue()) === "25/10/2026",
      "Calendario elige la fecha con flechas y Enter a " + width,
    );
    if (width === 1440) {
      await form.getByRole("button", { name: "Tipo", exact: true }).click();
      await page.getByRole("option").first().waitFor();
      await page.screenshot({ path: "tests/evidence/aria/select-1440.png" });
      await page.keyboard.press("Escape");
    }
    const price = form.getByRole("textbox", { name: "Precio", exact: true });
    await price.fill("999999999999.99");
    await price.press("Tab");
    check(
      (await price.inputValue()) === "999999999999.99",
      "Importe conserva todos sus decimales exactos a " + width,
    );
    check(
      (await form
        .getByRole("textbox", { name: "Proveedor", exact: true })
        .getAttribute("readonly")) !== null,
      "Proveedor permanece bloqueado a " + width,
    );
    await form
      .getByRole("button", { name: "Abrir documento", exact: true })
      .click();
    const nested = page.getByRole("dialog", {
      name: "Documento anidado",
      exact: true,
    });
    await nested.waitFor();
    await nested.getByRole("button", { name: "Cancelar", exact: true }).click();
    await nested.waitFor({ state: "hidden" });
    check(
      await form.isVisible(),
      "Documento anidado cancela y conserva el formulario a " + width,
    );
    check(
      await form.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "Formulario contenido en " + width + " px",
    );
    await page.screenshot({
      path: "tests/evidence/aria/controls-" + width + ".png",
    });
  }
  const form = page.getByRole("dialog", {
    name: "Controles accesibles",
    exact: true,
  });
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Confirmar acción",
    exact: true,
  });
  await confirmation.waitFor();
  await confirmation
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await confirmation.waitFor({ state: "hidden" });
  check(
    await form.isVisible(),
    "Cancelar descarte conserva los cambios del formulario",
  );
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Descartar cambios", exact: true })
    .click();
  await form.waitFor({ state: "hidden" });
  check(
    await page
      .getByRole("button", { name: "Abrir formulario", exact: true })
      .isVisible(),
    "Confirmar descarte cierra el formulario",
  );
  await page
    .getByRole("button", { name: "Abrir formulario", exact: true })
    .click();
  await form
    .getByRole("button", { name: "Tipo", exact: true })
    .selectOption("b");
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  await confirmation.waitFor();
  check(
    await confirmation.isVisible(),
    "Un cambio únicamente de selección también protege el borrador",
  );
  await confirmation
    .getByRole("button", { name: "Descartar cambios", exact: true })
    .click();
  check(errors.length === 0, "Sin errores de consola");
  return { checks, errors };
};
