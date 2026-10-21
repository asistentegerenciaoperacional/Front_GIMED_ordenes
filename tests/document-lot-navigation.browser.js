async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const db = await (await page.request.get(origin + "/api/state")).json();
  const checks = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const certificates = db.documento.filter((doc) => doc.tipo_entidad === "lote_material");
  const lot = db.lote_material.find((row) => row.id === certificates[0].id_entidad);
  const modal = () => page.getByRole("dialog", { name: lot.numero_lote, exact: true });
  const lotTab = () => page.getByRole("tab", { name: "Lotes y certificados", exact: true });
  const close = () => modal().getByRole("button", { name: /^Cerrar/ }).click();
  const openFromDocument = async (doc) => {
    const row = page.getByRole("row").filter({ hasText: doc.nombre_archivo });
    const link = row.getByRole("link", { name: lot.numero_lote, exact: true });
    const href = new URL(await link.getAttribute("href"), origin);
    check(href.pathname === "/abastecimiento" && href.searchParams.get("tab") === "lotes" && href.searchParams.get("lote") === doc.id_entidad,
      "Enlace del certificado identifica el lote: " + doc.tipo_documento);
    await link.click();
    await modal().waitFor();
  };
  for (const width of [1440, 862, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/documentos");
    await openFromDocument(certificates[0]);
    check(await lotTab().getAttribute("aria-selected") === "true", "Abre la pestaña de lotes a " + width + "px");
    check(await modal().getByText("Información relacionada e historial", { exact: true }).isVisible(), "Reutiliza la vista de información a " + width + "px");
    for (const doc of certificates.filter((doc) => doc.id_entidad === lot.id))
      check(await modal().getByText(doc.nombre_archivo, { exact: true }).isVisible(), "Certificado del lote visible a " + width + "px: " + doc.nombre_archivo);
    for (const line of db.orden_material.filter((row) => row.id_lote_material === lot.id)) {
      const material = db.materiales.find((row) => row.id === line.id_material);
      check(await modal().getByRole("link").filter({ hasText: material.nombre_material }).count() === 1,
        "Recepción relacionada correcta a " + width + "px: " + material.nombre_material);
    }
    check(await page.getByRole("dialog").count() === 1, "Un único diálogo a " + width + "px");
    await page.screenshot({ path: `tests/evidence/aria/document-lot-${width}.png`, fullPage: true });
    await close();
    await modal().waitFor({ state: "hidden" });
    check(new URL(page.url()).searchParams.get("lote") === null && await lotTab().getAttribute("aria-selected") === "true",
      "Cerrar conserva la tabla de lotes y retira el detalle de la URL a " + width + "px");
    await page.getByRole("button", { name: "Consultar historial de " + lot.numero_lote, exact: true }).click();
    await modal().waitFor();
    check(new URL(page.url()).searchParams.get("lote") === lot.id, "Historial de la tabla sigue operativo a " + width + "px");
    await modal().press("Escape");
    await modal().waitFor({ state: "hidden" });
    check(new URL(page.url()).searchParams.get("lote") === null, "Escape cierra y limpia el detalle a " + width + "px");
  }
  await page.goto(origin + "/documentos");
  await openFromDocument(certificates[1]);
  await page.reload();
  await modal().waitFor();
  check(await lotTab().getAttribute("aria-selected") === "true", "Recargar conserva el lote seleccionado y su pestaña");
  await close();
  await page.goBack();
  await page.getByRole("heading", { name: "Documentos", exact: true }).waitFor();
  check(await page.getByRole("dialog").count() === 0, "Atrás vuelve a Documentos sin diálogo residual");
  await page.goto(origin + "/abastecimiento?tab=lotes&lote=no-existe");
  await lotTab().waitFor();
  check(await lotTab().getAttribute("aria-selected") === "true" && await page.getByRole("dialog").count() === 0, "Lote inexistente deja disponible la tabla sin abrir otro registro");
  await page.getByRole("tab", { name: "Vínculos entre órdenes", exact: true }).click();
  check(!new URL(page.url()).searchParams.has("lote") && !new URL(page.url()).searchParams.has("tab"), "Cambiar de pestaña retira el lote de la URL");
  await page.goto(origin + "/abastecimiento");
  check(await page.getByRole("tab", { name: "Vínculos entre órdenes", exact: true }).getAttribute("aria-selected") === "true", "La entrada normal conserva la pestaña de vínculos por defecto");
  return { checks };
}
