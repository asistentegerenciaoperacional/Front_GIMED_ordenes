async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const db = await (await page.request.get(origin + "/api/state")).json();
  const checks = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const rows = () =>
    page
      .locator(".data-table tbody tr")
      .filter({
        has: page.getByRole("button", { name: /^Gestionar / }),
      });
  const names = () => rows().locator("td:first-child a").allTextContents();
  const expectRows = async (documents, label) => {
    const expected = documents.map((row) => row.nombre_archivo);
    await page.waitForFunction((expected) => {
      const actual = [
        ...document.querySelectorAll(".data-table tbody tr td:first-child a"),
      ].map((el) => el.textContent);
      return (
        JSON.stringify(actual.sort()) === JSON.stringify([...expected].sort())
      );
    }, expected);
    check(true, label);
  };
  const open = async (column) => {
    const name = "Filtrar y ordenar " + column;
    await page.getByRole("button", { name, exact: true }).click();
    return page.getByRole("dialog", { name, exact: true });
  };
  const select = async (panel, labels) => {
    await panel
      .getByRole("checkbox", { name: "Seleccionar todos", exact: true })
      .check();
    await panel
      .getByRole("checkbox", { name: "Seleccionar todos", exact: true })
      .uncheck();
    for (const label of labels)
      await panel.getByRole("checkbox", { name: label, exact: true }).check();
    await panel.getByRole("button", { name: "Aplicar", exact: true }).click();
  };
  const clearFilters = async () =>
    page.getByRole("button", { name: /^Limpiar filtros/ }).click();
  await page.goto(origin + "/documentos");
  await expectRows(
    db.documento,
    "Listado inicial conserva todos los documentos",
  );
  check(
    (await page.locator("thead .column-filter-button").count()) === 4,
    "Cuatro columnas de datos con filtro; Acciones sin filtro",
  );
  const search = page.getByRole("textbox", {
    name: "Buscar documentos",
    exact: true,
  });
  const kind = page.getByRole("combobox", {
    name: "Filtrar clase de documento",
    exact: true,
  });
  check(
    (await page
      .getByRole("button", { name: "Limpiar búsqueda", exact: true })
      .count()) === 0,
    "No se muestra limpieza con búsqueda vacía",
  );
  await search.fill("CERTIFICADO");
  const certificates = db.documento.filter((row) =>
    ["certificado_calidad", "certificado_liberacion"].includes(
      row.tipo_documento,
    ),
  );
  await expectRows(
    certificates,
    "Búsqueda por clase sin distinguir mayúsculas",
  );
  await kind.selectOption("certificado_calidad");
  const quality = db.documento.filter(
    (row) => row.tipo_documento === "certificado_calidad",
  );
  await expectRows(quality, "Selector de clase combinado con búsqueda");
  let panel = await open("Clase");
  check(
    await panel
      .getByRole("checkbox", { name: "Certificado de calidad", exact: true })
      .isChecked(),
    "Selector de clase sincronizado con casilla del filtro",
  );
  await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", { name: "Limpiar búsqueda", exact: true })
    .click();
  await expectRows(quality, "Limpiar búsqueda conserva filtro de clase");
  check((await search.inputValue()) === "", "Limpiar búsqueda vacía el campo");
  await kind.selectOption("");
  await expectRows(
    db.documento,
    "Todas las clases quita solo el filtro de clase",
  );

  await select(await open("Propietario"), ["Global"]);
  const global = db.documento.filter(
    (row) => row.tipo_entidad === "global" || row.id_entidad === null,
  );
  await expectRows(global, "Filtro por propietario Global");
  await search.fill("sin coincidencias");
  await expectRows([], "Combinación sin resultados");
  check(
    (await page.locator("thead .column-filter-button").count()) === 4,
    "Cabeceras y filtros disponibles sin resultados",
  );
  check(
    await page
      .getByText("Sin documentos coincidentes", { exact: true })
      .isVisible(),
    "Mensaje de estado vacío",
  );
  panel = await open("Propietario");
  check(
    await panel
      .getByRole("checkbox", { name: "Global", exact: true })
      .isChecked(),
    "Valor seleccionado accesible aunque la búsqueda lo oculte",
  );
  await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
  await clearFilters();
  check(
    (await search.inputValue()) === "sin coincidencias",
    "Limpiar filtros conserva búsqueda",
  );
  await page
    .getByRole("button", { name: "Limpiar búsqueda", exact: true })
    .click();
  await expectRows(
    db.documento,
    "Recuperación de tabla tras limpiar búsqueda y filtros",
  );

  panel = await open("Documento");
  await panel
    .getByRole("combobox", { name: "Condición", exact: true })
    .selectOption("contains");
  await panel
    .getByRole("textbox", { name: "Valor del filtro", exact: true })
    .fill("MAT");
  await panel.getByRole("button", { name: "Aplicar", exact: true }).click();
  const materials = db.documento.filter((row) =>
    row.nombre_archivo.toLowerCase().includes("mat"),
  );
  await expectRows(materials, "Condición de texto en Documento");
  await kind.selectOption("certificado_calidad");
  await expectRows(
    quality.filter((row) => row.nombre_archivo.toLowerCase().includes("mat")),
    "Combinación entre columnas Documento y Clase",
  );
  check(
    await page
      .getByRole("button", { name: "Limpiar filtros (2)", exact: true })
      .isVisible(),
    "Contador de filtros activos",
  );
  await clearFilters();
  await select(await open("Clase"), [
    "Certificado de calidad",
    "Certificado de liberación",
  ]);
  await expectRows(certificates, "Selección múltiple de clases");
  check(
    (await kind.innerText()) === "Filtro de columna aplicado",
    "Selector indica una selección múltiple de la columna",
  );
  await kind.selectOption("");
  await expectRows(
    db.documento,
    "Todas las clases retira una selección múltiple",
  );

  panel = await open("Cargado");
  await panel
    .getByRole("combobox", { name: "Condición", exact: true })
    .selectOption("greater");
  await panel
    .getByRole("textbox", { name: "Valor del filtro", exact: true })
    .fill("01/01/2099");
  await panel.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expectRows([], "Condición de fecha posterior sin coincidencias");
  await (
    await open("Cargado")
  )
    .getByRole("button", { name: "Quitar filtro", exact: true })
    .click();
  await expectRows(
    db.documento,
    "Quitar filtro de fecha restaura los documentos",
  );
  await (
    await open("Documento")
  )
    .getByRole("button", { name: "De Z a A", exact: true })
    .click();
  const descending = [...db.documento].sort((a, b) =>
    b.nombre_archivo.localeCompare(a.nombre_archivo, "es-CO"),
  );
  check(
    JSON.stringify(await names()) ===
      JSON.stringify(descending.map((row) => row.nombre_archivo)),
    "Ordenamiento descendente por Documento",
  );
  await kind.selectOption("factura_fisica");
  await search.fill("FACTURA");
  await page
    .getByRole("button", { name: "Limpiar búsqueda", exact: true })
    .click();
  await clearFilters();
  check(
    JSON.stringify(await names()) ===
      JSON.stringify(descending.map((row) => row.nombre_archivo)),
    "Ambas limpiezas conservan el ordenamiento",
  );

  const first = rows().first();
  const download = await first
    .getByRole("link", { name: /^Descargar / })
    .getAttribute("href");
  check(
    (await page.request.get(origin + download)).ok(),
    "Descarga de documento operativa",
  );
  await first.getByRole("button", { name: /^Gestionar / }).click();
  await page
    .getByRole("dialog", {
      name: "Gestionar documentos del propietario",
      exact: true,
    })
    .waitFor();
  check(true, "Gestionar documentos abre su diálogo");
  await page
    .getByRole("button", { name: /^Cerrar/ })
    .last()
    .click();
  for (const width of [1440, 862, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await search.fill("sin coincidencias");
    await page
      .getByRole("button", { name: "Limpiar búsqueda", exact: true })
      .click();
    await expectRows(
      db.documento,
      "Limpiar búsqueda operativo a " + width + "px",
    );
    panel = await open("Clase");
    check(await panel.isVisible(), "Menú de columna visible a " + width + "px");
    await panel.press("Escape");
    check(
      await page
        .getByRole("button", { name: "Filtrar y ordenar Clase", exact: true })
        .evaluate((el) => el === document.activeElement),
      "Escape devuelve foco a " + width + "px",
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Sin desbordamiento de página a " + width + "px",
    );
    check(
      await kind.evaluate((el) => {
        const label = el.querySelector("span");
        return el.getBoundingClientRect().width >= 180 && label.scrollWidth <= label.clientWidth;
      }),
      "Selector de clase legible a " + width + "px",
    );
    await page.locator(".table-scroll").evaluate((el) => { el.scrollLeft = 0; });
    await page.screenshot({
      path: `tests/evidence/aria/documents-filters-${width}.png`,
      fullPage: true,
    });
  }
  return { checks };
};
