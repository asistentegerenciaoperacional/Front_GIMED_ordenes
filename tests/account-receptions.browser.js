async (page) => {
  page.setDefaultTimeout(8000);
  const checks = [];
  const id = (number) => number.toString(16).padStart(24, "0");
  const base = new URL(page.url()).origin;
  const api = (path) => page.request.get(base + path);
  await page.getByRole("heading", { name: "Iniciar sesión" }).waitFor();
  if (
    (await api("/api/state")).status() !== 401 ||
    (await api(`/api/documents/${id(170)}/content`)).status() !== 401
  )
    throw new Error("Un visitante anónimo obtuvo datos o documentos.");
  checks.push("Las órdenes y los documentos requieren sesión");
  const signIn = async (email) => {
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill("local-test-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
  };
  await signIn("externo@example.com");
  await page.getByText("Esta cuenta no tiene acceso a GIMED.").waitFor();
  await signIn("ana@example.com");
  await page.getByRole("button", { name: "Cerrar sesión" }).waitFor();
  if (!(await api(`/api/documents/${id(170)}/content`)).ok())
    throw new Error(
      "Una cuenta autorizada no puede abrir un documento directo.",
    );
  checks.push(
    "Inicio de sesión, cuenta ajena rechazada y documentos habilitados",
  );

  await page.goto(`${base}/ordenes/${id(100)}`);
  await page
    .getByRole("button", { name: "Comentarios", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Comentarios" });
  await dialog
    .getByText("Este renglón todavía no tiene comentarios.")
    .waitFor();
  for (const text of [
    "Primer seguimiento de producto",
    "Segundo seguimiento de producto",
  ]) {
    await dialog.getByLabel("Nuevo comentario").fill(text);
    await dialog.getByRole("button", { name: "Publicar comentario" }).click();
    await dialog
      .locator(".comment-list")
      .getByText(text, { exact: true })
      .waitFor();
  }
  const commentAuthors = await dialog
    .locator(".comment-list strong")
    .allTextContents();
  const commentDates = await dialog.locator(".comment-list time").count();
  if (commentDates !== 2 || commentAuthors.join(",") !== "Ana,Ana")
    throw new Error(
      `Fechas y autores obtenidos: ${commentDates}, ${commentAuthors.join(", ")}`,
    );
  checks.push("Publicación y lectura de varios comentarios de producto");

  await page.goto(`${base}/proveedores?tab=direccion`);
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  const catalog = page.getByRole("dialog", { name: "Agregar · Direcciones y bodegas" });
  await catalog.getByRole("button", { name: "Tipo de ubicación" }).click();
  await page.getByRole("option", { name: "Propia", exact: true }).click();
  await catalog.getByRole("textbox", { name: "Nombre de la bodega" }).fill("Bodega GIMED de prueba");
  await catalog.getByRole("textbox", { name: "Ciudad" }).fill("Bogotá");
  await catalog.getByRole("button", { name: "Guardar registro" }).click();
  await catalog.waitFor({ state: "hidden" });
  const address = (await (await api("/api/state")).json()).direccion.find(
    (item) => item.nombre_dir === "Bodega GIMED de prueba",
  );
  await page.goto(`${base}/ordenes/${id(120)}`);
  await page
    .getByRole("button", { name: "Comentarios", exact: true })
    .first()
    .click();
  await dialog
    .getByText("Este renglón todavía no tiene comentarios.")
    .waitFor();
  await dialog.getByLabel("Nuevo comentario").fill("Material en revisión");
  await dialog.getByRole("button", { name: "Publicar comentario" }).click();
  await dialog
    .locator(".comment-list")
    .getByText("Material en revisión")
    .waitFor();
  await dialog.getByRole("button", { name: "Cerrar Comentarios", exact: true }).click();

  await page
    .getByRole("button", { name: /registrar.*editar/i })
    .first()
    .click();
  const receipt = page.getByRole("dialog", { name: /Recepción del material/i });
  await receipt.getByRole("button", { name: "Ubicación de recepción" }).click();
  await page
    .getByRole("option", { name: "Bodega GIMED de prueba", exact: true })
    .click();
  await receipt
    .getByRole("button", { name: "Guardar recepción", exact: true })
    .click();
  await receipt.waitFor({ state: "hidden" });
  const state = await (await api("/api/state")).json();
  if (
    state.orden_material.find((line) => line.id === id(140)).id_direccion !==
    address.id
  )
    throw new Error("La recepción no guardó el ID de la bodega.");
  checks.push(
    "El material admite comentarios y recepción en una bodega propia",
  );

  await page.evaluate(() => localStorage.setItem("gimed:ui:product-order-sheet", "true"));
  await page.goto(`${base}/ordenes/productos?q=2801`);
  await page.locator(".product-sheet-viewport").evaluate((viewport) => {
    viewport.scrollLeft = viewport.scrollWidth;
  });
  const location = page.locator('[data-sheet-row="0"][data-column-key="ubicacion"]');
  await location.dblclick();
  await location.getByRole("button", { name: "Ubicación" }).click();
  await page.getByRole("option", { name: "Bodega GIMED de prueba", exact: true }).click();
  await page.getByRole("button", { name: /^Guardar 1 cambios$/ }).click();
  await page.waitForFunction(async (addressId) =>
    (await (await fetch("/api/state")).json()).lote_producto.some((lot) => lot.id_direccion === addressId),
    address.id,
  );
  checks.push("La hoja de productos guarda la referencia de bodega por lote");

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByRole("heading", { name: "Iniciar sesión" }).waitFor();
  if ((await api("/api/state")).status() !== 401)
    throw new Error("La sesión sigue activa después de salir.");
  checks.push("Cerrar sesión retira la interfaz y el acceso a los datos");
  return { checks };
};
