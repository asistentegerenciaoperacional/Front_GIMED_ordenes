async (page) => {
  page.setDefaultTimeout(15000);
  const checks = [], screenshots = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  const origin = new URL(page.url()).origin;
  const state = async () => (await page.request.get(origin + '/api/state')).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + '/api/commands', { data: { name, payload } });
    if (!response.ok()) throw new Error(await response.text());
    return (await response.json()).result;
  };
  const initial = await state();
  const product = initial.productos[0];
  const env = initial.materiales.find(m => m.codigo_material === 101);
  const cap = initial.materiales.find(m => m.codigo_material === 102);
  const supplier = initial.proveedor.find(p => p.Es_materiales);
  const createOC = async () => {
    const { orderId } = await command('createOrder', { tipo_orden: 'producto', id_proveedor: product.id_maquilador, fecha_solicitada_entrega: '2027-02-15T12:00:00.000Z', lines: [{ id_producto: product.id, cantidad_solicitada: 1000, precio_unitario: '2.55' }] });
    await command('authorizeOrder', { id: orderId, confirm: true });
    return orderId;
  };
  const ocId = await createOC(), secondId = await createOC();
  const ocm = await command('createOrder', { tipo_orden: 'material', id_proveedor: supplier.id, fecha_solicitada_entrega: '2027-03-01T12:00:00.000Z', lines: [{ id_material: cap.id, cantidad_solicitada: 2200, precio_unitario: '1.00' }] });
  let db = await state();
  const source = db.orden_producto.find(l => l.id_orden_compra === ocId);
  const second = db.orden_producto.find(l => l.id_orden_compra === secondId);
  const target = db.orden_material.find(l => l.id_orden_compra === ocm.orderId);
  const earlyEnv = db.orden_material.find(l => l.id_material === env.id && l.estado === 'en_seguimiento');
  const previousLinks = db.abastecimiento_material.length;
  const dialog = () => page.getByRole('dialog', { name: 'Vincular OCM existente', exact: true });
  const trigger = () => page.getByRole('button', { name: 'Vincular OCM existente', exact: true });
  const materialInput = () => dialog().getByRole('combobox', { name: 'Material pendiente', exact: true });
  const targetInput = () => dialog().getByRole('combobox', { name: 'Renglón de OCM', exact: true });
  const selectCap = async () => {
    await materialInput().selectOption(cap.id);
    await targetInput().fill('OCM ' + db.orden_compra.find(o => o.id === ocm.orderId).no_orden);
    await targetInput().press('ArrowDown'); await targetInput().press('Enter');
  };
  const close = async () => {
    await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
    const confirm = page.getByRole('alertdialog');
    if (await confirm.count()) await confirm.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
  };
  const shot = async (name) => {
    const engine = page.context().browser().browserType().name();
    const path = `tests/evidence/ocm/${engine}-manual-link-${name}.png`;
    await page.screenshot({ path }); screenshots.push(path);
  };
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/ordenes/' + ocId);
    await trigger().scrollIntoViewIfNeeded();
    const top = await page.evaluate(() => scrollY);
    await trigger().click();
    check(await dialog().getByRole('textbox', { name: 'Producto', exact: true }).isDisabled(), 'Producto bloqueado a ' + width);
    await materialInput().fill('sin-coincidencias');
    await page.getByText('Sin coincidencias', { exact: true }).waitFor();
    check(await page.locator('[role="option"][data-key]').count() === 0, 'Búsqueda sin resultados a ' + width);
    await selectCap();
    check((await dialog().innerText()).includes('igual o posterior'), 'Advertencia temporal únicamente al vincular a ' + width);
    check((await dialog().innerText()).includes('Sin autorización') || (await dialog().innerText()).includes('No autorizada'), 'OCM sin autorizar seleccionable a ' + width);
    await shot(String(width));
    const bounds = await dialog().boundingBox();
    check(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Diálogo dentro del viewport a ' + width);
    await close();
    await page.waitForFunction(() => document.activeElement?.textContent.includes('Vincular OCM existente'));
    check(Math.abs(await page.evaluate(() => scrollY) - top) < 3, 'Foco y scroll restaurados a ' + width);
  }
  check((await state()).abastecimiento_material.length === previousLinks, 'Cancelar no modifica relaciones');
  await trigger().click(); await selectCap();
  let failed = false;
  await page.route('**/api/commands', async (route) => {
    if (!failed && route.request().postDataJSON()?.name === 'linkMaterialSupply') {
      failed = true; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'SERVER', message: 'Error de servicio de prueba; el borrador se conserva.' }) });
    } else await route.continue();
  });
  await dialog().getByRole('button', { name: 'Vincular OCM', exact: true }).click();
  await dialog().getByRole('alert').waitFor();
  check((await targetInput().inputValue()).includes('2.200 unidades'), 'Error del servicio conserva selección');
  await page.unroute('**/api/commands');
  // Another request covers the same pair while the user's dialog remains open.
  const header = db.orden_compra.find(o => o.id === ocId), materialHeader = db.orden_compra.find(o => o.id === ocm.orderId);
  await command('linkMaterialSupply', { id_orden_producto: source.id, id_orden_material: target.id, expected: {
    id_producto: product.id, id_material: cap.id,
    oc: { id_orden: header.id, fecha_solicitada_entrega: header.fecha_solicitada_entrega, cantidad_solicitada: source.cantidad_solicitada },
    ocm: { id_orden: materialHeader.id, fecha_solicitada_entrega: materialHeader.fecha_solicitada_entrega, cantidad_solicitada: target.cantidad_solicitada, id_proveedor: materialHeader.id_proveedor },
  } });
  await dialog().getByRole('button', { name: 'Vincular OCM', exact: true }).click();
  await dialog().getByRole('button', { name: 'Revisar opciones actualizadas', exact: true }).waitFor();
  check((await targetInput().inputValue()).includes('2.200 unidades'), 'Conflicto conserva borrador');
  await dialog().getByRole('button', { name: 'Revisar opciones actualizadas', exact: true }).click();
  await materialInput().fill(''); await materialInput().press('ArrowDown');
  check(await page.locator(`[role="option"][data-key="${cap.id}"]`).count() === 0, 'Necesidad cubierta retirada después de revisar');
  await page.keyboard.press('Escape');
  await materialInput().selectOption(env.id); await targetInput().selectOption(earlyEnv.id);
  await dialog().getByRole('button', { name: 'Vincular OCM', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.textContent === 'Abastecimiento');
  check(await trigger().isDisabled(), 'Última necesidad cubierta deshabilita acción y devuelve foco al encabezado');
  db = await state();
  check(db.abastecimiento_material.length === previousLinks + 2, 'No hay duplicados después de error y conflicto');
  await page.goto(origin + '/ordenes/' + secondId);
  await trigger().click(); await selectCap();
  await dialog().getByRole('button', { name: 'Vincular OCM', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  db = await state();
  check(db.abastecimiento_material.some(l => l.id_orden_producto === second.id && l.id_orden_material === target.id), 'La UI permite compartir una OCM y guardar fuera de fecha');
  await page.goto(origin + '/ordenes/' + ocm.orderId);
  check((await page.locator('main').innerText()).includes('OC '), 'El detalle de OCM refleja sus vínculos');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const edit = page.getByRole('dialog').last();
  await edit.getByRole('button', { name: 'Revisar orden', exact: true }).click();
  check((await edit.innerText()).includes('debe ser anterior'), 'Editar OCM vinculada tarde exige corregir la fecha aunque no cambie');
  const final = await state();
  check(final.consecutivo_orden.find(c => c.grupo === 'material').ultimo_numero === db.consecutivo_orden.find(c => c.grupo === 'material').ultimo_numero, 'Vincular y rechazar edición no consumen consecutivos');
  const thirdId = await createOC();
  const thirdState = await state();
  const third = thirdState.orden_producto.find(l => l.id_orden_compra === thirdId);
  await page.goto(origin + '/ordenes/' + thirdId);
  await trigger().click(); await selectCap();
  await command('setLineState', { entity: 'orden_producto', id: third.id, estado: 'cerrada', confirm: true });
  await dialog().getByRole('button', { name: 'Vincular OCM', exact: true }).click();
  await dialog().getByRole('button', { name: 'Revisar opciones actualizadas', exact: true }).waitFor();
  check(await dialog().isVisible(), 'Cerrar la OC concurrentemente conserva el diálogo y el borrador');
  await close();
  await page.waitForFunction(() => document.activeElement?.tagName === 'H3');
  check(await trigger().count() === 0, 'Al desaparecer la sección, el foco vuelve al encabezado del producto');
  return { checks, screenshots };
}
