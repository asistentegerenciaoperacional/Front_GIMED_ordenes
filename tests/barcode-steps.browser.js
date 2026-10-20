async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const db = await (await page.request.get(origin + "/api/state")).json();
  const checks = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const steps = [
    ["creado_gs1", "01 Creado en GS1"],
    ["verificado_sistema", "02 Verificado en sistema"],
    ["asignado", "03 Asignado al producto"],
  ];
  const codes = () => page.locator(".data-table tbody tr td:first-child strong").allTextContents();
  const expected = (status) => db.codigos_barras
    .filter((row) => !status || row.estado === status).map((row) => row.codigo);
  const sameCodes = async (values) => {
    await page.waitForFunction((values) => {
      const actual = [...document.querySelectorAll(".data-table tbody tr td:first-child strong")]
        .map((node) => node.textContent).sort();
      return JSON.stringify(actual) === JSON.stringify([...values].sort());
    }, values);
  };
  const open = async (column) => {
    const name = "Filtrar y ordenar " + column;
    await page.getByRole("button", { name, exact: true }).click();
    return page.getByRole("dialog", { name, exact: true });
  };
  const selectOnly = async (panel, label) => {
    await panel.getByRole("checkbox", { name: "Seleccionar todos", exact: true }).check();
    await panel.getByRole("checkbox", { name: "Seleccionar todos", exact: true }).uncheck();
    await panel.getByRole("checkbox", { name: label, exact: true }).check();
    await panel.getByRole("button", { name: "Aplicar", exact: true }).click();
  };
  await page.goto(origin + "/codigos");
  await sameCodes(expected());
  check(await page.locator('.code-step[aria-pressed="true"]').count() === 0, "Sin paso seleccionado inicialmente");
  const first = page.getByRole("button", { name: steps[0][1], exact: true });
  check(await first.evaluate((el) => getComputedStyle(el).backgroundColor) === "rgb(255, 255, 255)", "Fondo blanco en estado normal");
  await first.hover();
  check(await first.evaluate((el) => getComputedStyle(el).backgroundColor) === "rgb(248, 250, 252)", "Hover con el gris original");
  for (const [status, name] of steps) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
    await sameCodes(expected(status));
    check(await button.getAttribute("aria-pressed") === "true", "Paso activo: " + status);
    check(await page.locator('.code-step[aria-pressed="true"]').count() === 1, "Selección exclusiva: " + status);
    const panel = await open("Estado GS1 / sistema");
    const label = status === "asignado" ? "Asignado" : name.slice(3);
    check(await panel.getByRole("checkbox", { name: label, exact: true }).isChecked(), "El filtro de columna refleja el paso: " + status);
    check(await panel.locator('.column-value-list input:checked').count() === 1, "Una sola casilla de estado seleccionada: " + status);
    await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  await selectOnly(await open("Estado GS1 / sistema"), "Inactivo");
  await sameCodes(expected("inactivo"));
  check(await page.locator('.code-step[aria-pressed="true"]').count() === 0, "Inactivo sigue disponible en el filtro y desactiva los pasos");
  await page.getByRole("button", { name: "Limpiar filtros (1)", exact: true }).click();
  await sameCodes(expected());
  check(await page.locator('.code-step[aria-pressed="true"]').count() === 0, "Limpiar filtros restablece los pasos y todas las filas");

  await page.getByRole("button", { name: steps[2][1], exact: true }).click();
  await (await open("Código")).getByRole("button", { name: "De Z a A", exact: true }).click();
  await sameCodes(expected("asignado"));
  const descending = expected("asignado").sort().reverse();
  check(JSON.stringify(await codes()) === JSON.stringify(descending), "Ordenamiento descendente aplicado");
  await page.getByRole("button", { name: steps[0][1], exact: true }).click();
  await page.getByRole("button", { name: steps[2][1], exact: true }).click();
  await sameCodes(descending);
  check(JSON.stringify(await codes()) === JSON.stringify(descending), "Cambiar de paso conserva el ordenamiento");

  const search = page.getByRole("textbox", { name: "Buscar códigos de barras", exact: true });
  await search.fill(descending[0]);
  await sameCodes([descending[0]]);
  await page.getByRole("button", { name: steps[1][1], exact: true }).click();
  await sameCodes([]);
  check(await search.inputValue() === descending[0], "Cambiar estado conserva la búsqueda incluso sin coincidencias");
  await page.getByRole("button", { name: steps[2][1], exact: true }).click();
  await sameCodes([descending[0]]);
  await page.getByRole("button", { name: "Limpiar búsqueda", exact: true }).click();
  await sameCodes(descending);
  check(await page.locator('.code-step[aria-pressed="true"]').count() === 1, "Limpiar búsqueda conserva el estado");

  await selectOnly(await open("Código"), descending[0]);
  await sameCodes([descending[0]]);
  await page.getByRole("button", { name: steps[0][1], exact: true }).click();
  await sameCodes([]);
  check(await page.getByRole("button", { name: "Limpiar filtros (2)", exact: true }).count() === 1, "El paso conserva el filtro de otra columna");
  await page.getByRole("button", { name: steps[2][1], exact: true }).click();
  await sameCodes([descending[0]]);
  await page.getByRole("button", { name: "Limpiar filtros (2)", exact: true }).click();
  await sameCodes(expected());
  check(JSON.stringify(await codes()) === JSON.stringify(expected().sort().reverse()), "Limpiar filtros conserva el ordenamiento");

  const panel = await open("Estado GS1 / sistema");
  await selectOnly(panel, "Verificado en sistema");
  await sameCodes(expected("verificado_sistema"));
  check(await page.getByRole("button", { name: steps[1][1], exact: true }).getAttribute("aria-pressed") === "true", "Cambiar el estado desde la columna sincroniza el paso activo");
  await (await open("Estado GS1 / sistema")).getByRole("button", { name: "Quitar filtro", exact: true }).click();
  await sameCodes(expected());
  check(await page.locator('.code-step[aria-pressed="true"]').count() === 0, "Quitar el filtro desde la columna desactiva los pasos");

  for (const width of [1440, 803, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const button = page.getByRole("button", { name: steps[0][1], exact: true });
    await button.focus();
    await button.press("Enter");
    await sameCodes(expected("creado_gs1"));
    check(await button.getAttribute("aria-pressed") === "true", "Enter filtra a " + width + "px");
    const next = page.getByRole("button", { name: steps[1][1], exact: true });
    await next.focus();
    await next.press("Space");
    await sameCodes(expected("verificado_sistema"));
    check(await next.getAttribute("aria-pressed") === "true", "Espacio filtra a " + width + "px");
    check(await next.evaluate((el) => el === document.activeElement), "El foco permanece en el paso a " + width + "px");
    check(await page.locator(".code-flow").evaluate((el) => el.getBoundingClientRect().right <= innerWidth), "Pasos dentro del ancho disponible a " + width + "px");
    await page.screenshot({ path: `tests/evidence/aria/barcode-steps-${width}.png`, fullPage: true });
  }
  return { checks };
}
