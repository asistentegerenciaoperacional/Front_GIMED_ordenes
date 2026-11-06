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
  const product = initial.productos[0], other = initial.productos[1];
  const material = initial.materiales.find(m => m.codigo_material === 101);
  const cap = initial.materiales.find(m => m.codigo_material === 102);
  const supplier = initial.proveedor.find(p => p.Es_materiales);
  const otherSupplier = initial.proveedor.find(p => p.Es_materiales && p.id !== supplier.id);
  const extra = [];
  for (let i = 0; i < 6; i++) {
    const result = await command('saveEntity', { entity: 'materiales', row: {
      nombre_material: i < 2 ? 'Envase con nombre repetido' : `Material de prueba ${i + 1}`,
      codigo_material: 200 + i, id_tipo_material: material.id_tipo_material,
    } });
    extra.push(result.row.id);
  }
  const box = initial.producto_corrugado.find(row => row.id_producto === product.id);
  const config = { id_materiales: initial.materiales_asociados.filter(row => row.id_producto === product.id).map(row => row.id_material).sort(), corrugado: box ? { id_material: box.id_material, unidades_por_corrugado: box.unidades_por_corrugado } : null };
  await command('setProductMaterials', { id_producto: product.id, id_materiales: [...config.id_materiales, ...extra], corrugado: config.corrugado, expected: config });
  const createProduct = async (date, lines) => {
    const result = await command('createOrder', { tipo_orden: 'producto', id_proveedor: product.id_maquilador, fecha_solicitada_entrega: date + 'T12:00:00.000Z', lines });
    await command('authorizeOrder', { id: result.orderId, confirm: true });
    return result.orderId;
  };
  const firstId = await createProduct('2027-02-15', [{ id_producto: product.id, cantidad_solicitada: 1000, precio_unitario: '1.00' }, { id_producto: other.id, cantidad_solicitada: 500, precio_unitario: '1.00' }]);
  const secondId = await createProduct('2027-02-22', [{ id_producto: product.id, cantidad_solicitada: 2000, precio_unitario: '1.00' }]);
  let db = await state();
  const first = db.orden_producto.find(line => line.id_orden_compra === firstId && line.id_producto === product.id);
  const second = db.orden_producto.find(line => line.id_orden_compra === secondId);
  const firstOrder = db.orden_compra.find(order => order.id === firstId);
  const secondOrder = db.orden_compra.find(order => order.id === secondId);
  const range = { desde: '2027-02-01', hasta: '2027-02-28' };
  await command('createOrder', { tipo_orden: 'material', id_proveedor: supplier.id, fecha_solicitada_entrega: '2027-01-20T12:00:00.000Z', lines: [{ id_material: cap.id, cantidad_solicitada: 1100, precio_unitario: '1.00' }], abastecimiento: { ...range, fuentes: [{ id_orden_producto: first.id, id_material: cap.id, cantidad_solicitada: first.cantidad_solicitada, fecha_solicitada_entrega: firstOrder.fecha_solicitada_entrega }] } });
  const currentBeforeUI = await state();
  const panel = () => page.locator('.material-demand-panel');
  const dialog = () => page.getByRole('dialog').last();
  const row = (line, id) => page.locator(`[data-need="${line}/${id}"]`);
  const checkFor = (line, id) => row(line, id).getByRole('checkbox');
  const search = () => page.getByRole('textbox', { name: 'Buscar OC, producto o material pendiente', exact: true });
  const prepare = () => page.getByRole('button', { name: 'Elaborar OCM', exact: true }).click();
  const quantity = () => dialog().locator('.order-form-line').first().getByRole('spinbutton', { name: 'Cantidad solicitada', exact: true });
  const percent = () => dialog().getByRole('spinbutton', { name: 'Adicional del material 1 (%)', exact: true });
  const price = () => dialog().locator('.order-form-line').first().getByRole('textbox', { name: 'Precio unitario', exact: true });
  const value = async locator => Number((await locator.inputValue()).replaceAll(',', ''));
  const discard = async () => {
    const button = page.getByRole('alertdialog').getByRole('button', { name: 'Descartar cambios', exact: true });
    if (await button.count()) await button.click();
  };
  const screenshot = async name => {
    const engine = page.context().browser().browserType().name();
    const path = `tests/evidence/ocm/${engine}-${name}.png`;
    await page.screenshot({ path, fullPage: false }); screenshots.push(path);
  };

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/abastecimiento?tab=pendientes');
  await panel().waitFor();
  check(await page.getByRole('tab', { name: 'Materiales pendientes', exact: true }).getAttribute('aria-selected') === 'true', 'Nueva subpestaña seleccionada por URL');
  check((await page.getByRole('tab').allTextContents()).join('|').includes('Vínculos entre órdenes|Materiales pendientes|Lotes y certificados'), 'Pestaña situada entre vínculos y lotes');
  check(await page.locator('[data-need]').count() > 0 && await page.locator('[id="field-desde"]').inputValue() === '', 'Sin rango inicial se muestran todos los pendientes');
  check(await page.getByRole('button', { name: 'Elaborar OCM', exact: true }).isDisabled(), 'Preparar deshabilitado sin selección');
  await page.locator('[id="field-desde"]').fill('28/02/2027');
  await page.locator('[id="field-hasta"]').fill('01/02/2027');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  check(await page.getByRole('link', { name: 'Hasta debe ser posterior o igual a Desde.', exact: true }).isVisible(), 'Rango invertido muestra error');
  await page.locator('[id="field-desde"]').fill('01/02/2027');
  await page.locator('[id="field-hasta"]').fill('28/02/2027');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await checkFor(first.id, material.id).waitFor();
  check(await page.locator('[data-need]').count() === 16, 'Solo las 16 parejas pendientes del rango; la tapa ya comprada está excluida');
  check(await row(first.id, cap.id).count() === 0, 'Una asociación no oculta otros materiales del producto');
  check((await row(second.id, material.id).innerText()).includes('22/02/2027'), 'Fecha de entrega conserva el día calendario de Bogotá en pantalla');
  check(!(await panel().innerText()).includes('Sticker de seguridad') && !(await panel().innerText()).includes('Cinta de embalaje'), 'Materiales genéricos excluidos de la tabla');
  check(new URL(page.url()).searchParams.get('pendientes_desde') === range.desde, 'Rango almacenado en parámetros propios');

  const seven = [material.id, ...extra];
  for (const id of seven) await checkFor(first.id, id).check();
  check((await page.locator('.demand-selection-count').innerText()).includes('7 materiales'), 'Siete materiales distintos, incluyendo homónimos');
  check(await checkFor(second.id, cap.id).isEnabled(), 'Octavo material disponible para cotización');
  await checkFor(second.id, cap.id).check();
  check(await page.getByRole('button', { name: 'Elaborar OCM', exact: true }).isDisabled(), 'Más de siete materiales bloquean elaborar OCM');
  check(await page.getByRole('button', { name: 'Cotizar materiales', exact: true }).isEnabled(), 'Cotización disponible sobre siete materiales');
  await checkFor(second.id, cap.id).uncheck();
  check(await checkFor(second.id, material.id).isEnabled(), 'Más orígenes de un material seleccionado permanecen habilitados');
  await checkFor(second.id, material.id).check();
  check((await page.locator('.demand-selection-count').innerText()).includes('8 vínculos · 2 OC'), 'Conteo de vínculos y cabeceras independientes del límite');
  check(await page.getByRole('button', { name: 'Quitar Envase con nombre repetido (MAIA 200) de la selección', exact: true }).count() === 1 && await page.getByRole('button', { name: 'Quitar Envase con nombre repetido (MAIA 201) de la selección', exact: true }).count() === 1, 'Resumen distingue homónimos por MAIA en sus acciones accesibles');
  await search().fill('sin-coincidencias-material');
  await page.getByText('Sin necesidades coincidentes', { exact: true }).waitFor();
  check((await page.locator('.demand-selection-count').innerText()).includes('7 materiales'), 'Buscar conserva selección oculta');
  await search().fill(''); await checkFor(first.id, material.id).waitFor();
  await page.getByRole('button', { name: 'Filtrar y ordenar Cantidad de producto', exact: true }).click();
  await page.getByRole('button', { name: 'De mayor a menor', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Filtrar y ordenar Cantidad de producto');
  check(new URL(page.url()).searchParams.get('pendientes_ordenar') === 'cantidad', 'Ordenamiento propio de la tabla');
  check(await checkFor(second.id, material.id).isChecked(), 'Ordenar conserva selecciones');

  await page.locator('[id="field-hasta"]').fill('27/02/2027');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  check((await page.locator('.demand-selection-count').innerText()).includes('8 vínculos'), 'Cancelar cambio de rango conserva selección');
  check(new URL(page.url()).searchParams.get('pendientes_hasta') === range.hasta, 'Cancelar cambio conserva rango consultado');
  await page.locator('[id="field-hasta"]').fill('28/02/2027');
  const selectionBounds = await page.locator('.demand-selection').boundingBox();
  check(selectionBounds.y >= 0 && selectionBounds.y + selectionBounds.height <= 1001, 'Resumen y Elaborar OCM permanecen visibles sobre la lista');
  await screenshot('pendientes-1440');
  await prepare();
  check(await dialog().getByRole('combobox', { name: 'Tipo de orden', exact: true }).isDisabled(), 'Tipo Material bloqueado');
  check(await dialog().getByRole('combobox', { name: 'Tipo de orden', exact: true }).inputValue() === 'material', 'Tipo material precargado');
  check(await dialog().locator('.order-form-line').count() === 7, 'Un renglón por material, no por vínculo');
  check(await dialog().getByRole('combobox', { name: 'Material', exact: true }).first().isDisabled(), 'Materiales importados bloqueados');
  check(await dialog().getByRole('button', { name: 'Agregar material', exact: true }).isDisabled(), 'Lista de materiales fija');
  check(await value(quantity()) === 3300 && await value(percent()) === 10, 'Suma de 3000 unidades más 10 %');
  await dialog().getByRole('textbox', { name: 'Entrega solicitada', exact: true }).fill('20/01/2027');
  for (const invalid of ['4', '11', '']) {
    await percent().fill(invalid); await dialog().getByRole('button', { name: 'Revisar orden', exact: true }).click();
    check(await percent().getAttribute('aria-invalid') === 'true', 'Adicional inválido rechazado: ' + (invalid || 'vacío'));
  }
  await percent().fill('5'); await percent().press('Tab');
  check(await value(quantity()) === 3150, 'Cambiar porcentaje recalcula desde la base original');
  await quantity().fill('3201'); await quantity().press('Tab');
  check(await value(percent()) === 5, 'Cantidad manual no modifica porcentaje');
  await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(otherSupplier.id);
  check(await dialog().locator('.order-form-line').count() === 7 && await value(quantity()) === 3201, 'Cambiar proveedor conserva materiales, cantidad y orígenes');
  await dialog().getByRole('button', { name: 'Volver a selección', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  check(await value(quantity()) === 3201, 'Cancelar descarte conserva borrador');
  await dialog().getByRole('button', { name: 'Volver a selección', exact: true }).click(); await discard();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check((await page.locator('.demand-selection-count').innerText()).includes('8 vínculos'), 'Cerrar diálogo conserva selección');
  check(JSON.stringify(await state()) === JSON.stringify(currentBeforeUI), 'Consultar y editar borrador no guardan registros');

  for (const id of extra) await checkFor(first.id, id).uncheck();
  await page.getByRole('button', { name: `Quitar ${material.nombre_material} (MAIA 101) de la selección`, exact: true }).click();
  check(!(await checkFor(first.id, material.id).isChecked()) && !(await checkFor(second.id, material.id).isChecked()), 'Quitar material del resumen retira todos sus orígenes');
  check(await checkFor(second.id, cap.id).isEnabled(), 'Quitar material libera un espacio de la OCM');
  await checkFor(first.id, material.id).check(); await checkFor(second.id, material.id).check();
  await page.getByRole('button', { name: 'Elaborar OCM', exact: true }).scrollIntoViewIfNeeded();
  const beforeSaveScroll = await page.evaluate(() => window.scrollY);
  await prepare();
  await percent().fill('5'); await quantity().fill('3201'); await price().fill('2.55');
  await dialog().getByRole('textbox', { name: 'Entrega solicitada', exact: true }).fill('20/01/2027');
  await dialog().getByRole('button', { name: 'Revisar orden', exact: true }).click();
  check((await dialog().locator('.demand-review').innerText()).includes('3.201'), 'Revisión presenta la cantidad final manual');
  check((await dialog().locator('.demand-review').innerText()).includes('OC ' + firstOrder.no_orden) && (await dialog().locator('.demand-review').innerText()).includes('OC ' + secondOrder.no_orden), 'Revisión muestra las dos OC de origen');
  await page.route('**/api/commands', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Error temporal de prueba', code: 'SERVER' }) }));
  await dialog().getByRole('button', { name: 'Crear orden', exact: true }).click();
  await dialog().getByText('Error temporal de prueba', { exact: true }).waitFor();
  check((await dialog().locator('.demand-review').innerText()).includes('3.201') && await dialog().getByRole('button', { name: 'Crear orden', exact: true }).isEnabled(), 'Error temporal conserva la revisión y permite reintentar');
  await page.unroute('**/api/commands');
  let requests = 0;
  const beforeSaveUrl = page.url();
  await page.route('**/api/commands', async route => { requests++; await new Promise(ok => setTimeout(ok, 350)); await route.continue(); });
  await dialog().getByRole('button', { name: 'Crear orden', exact: true }).click();
  await page.keyboard.press('Escape');
  await dialog().locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  check(await dialog().getByRole('button', { name: 'Volver a selección', exact: true }).isDisabled(), 'Guardado bloquea cierre y reenvíos');
  await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.unroute('**/api/commands');
  db = await state();
  const created = db.orden_compra.find(order => !currentBeforeUI.orden_compra.some(old => old.id === order.id));
  const createdLine = db.orden_material.find(line => line.id_orden_compra === created.id);
  check(requests === 1, 'Un solo envío pese a doble submit');
  check(createdLine.cantidad_solicitada === 3201 && createdLine.precio_unitario === '2.55', 'Cantidad y precio finales persistidos');
  check(!Object.hasOwn(createdLine, 'adicional_pct') && !Object.hasOwn(createdLine, 'cantidad_base'), 'Porcentaje y base no se persisten');
  const links = db.abastecimiento_material.filter(link => link.id_orden_material === createdLine.id);
  check(links.length === 2 && links.some(link => link.id_orden_producto === first.id) && links.some(link => link.id_orden_producto === second.id), 'Material asociado exactamente a ambos renglones seleccionados');
  check(page.url() === beforeSaveUrl, 'Tras guardar conserva Materiales pendientes y sus parámetros');
  check(beforeSaveScroll > 0 && await page.evaluate((previous) => {
    const limit = document.documentElement.scrollHeight - innerHeight;
    return Math.abs(window.scrollY - Math.min(previous, limit)) <= 2;
  }, beforeSaveScroll), 'Conserva el desplazamiento de Materiales pendientes al guardar');
  check(await page.locator('.toast').getByText('Orden creada', { exact: true }).isVisible(), 'Confirma la creación en la vista de origen');
  check(await row(first.id, material.id).count() === 0 && await row(second.id, material.id).count() === 0 &&
    await page.locator('.demand-selection-count').getByText('0 materiales', { exact: true }).isVisible(),
    'Tras guardar desaparecen los orígenes vinculados y se limpia su selección');

  const queriedUrl = origin + '/abastecimiento?tab=pendientes&pendientes_desde=2027-02-01&pendientes_hasta=2027-02-28';
  await page.goto(queriedUrl); await panel().waitFor();
  check(await row(first.id, material.id).count() === 0 && await row(second.id, material.id).count() === 0, 'Compra creada desaparece de pendientes');
  await checkFor(second.id, cap.id).check(); await prepare();
  await price().fill('4.44');
  await dialog().getByRole('textbox', { name: 'Entrega solicitada', exact: true }).fill('20/01/2027');
  await dialog().getByRole('button', { name: 'Revisar orden', exact: true }).click();
  db = await state();
  const changedHeader = db.orden_compra.find(order => order.id === secondId);
  await command('editOrder', { ...changedHeader, lines: db.orden_producto.filter(line => line.id_orden_compra === secondId).map(line => ({ ...line, cantidad_solicitada: line.cantidad_solicitada + 1000 })) });
  await dialog().getByRole('button', { name: 'Crear orden', exact: true }).click();
  await dialog().getByRole('button', { name: 'Revisar selección', exact: true }).waitFor();
  check(await dialog().getByRole('button', { name: 'Crear orden', exact: true }).isDisabled(), 'Conflicto impide reenviar el borrador obsoleto');
  check((await dialog().locator('.demand-review').innerText()).includes('4,44'), 'Conflicto conserva datos del borrador');
  await dialog().getByRole('button', { name: 'Revisar selección', exact: true }).click(); await discard();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await prepare();
  check(await value(quantity()) === 3300, 'Revisión explícita usa la cantidad vigente de la OC');
  await dialog().getByRole('button', { name: 'Volver a selección', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  await page.locator('[id="field-hasta"]').fill('27/02/2027');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cambiar rango', exact: true }).click();
  check((await page.locator('.demand-selection-count').innerText()).includes('0 materiales') && new URL(page.url()).searchParams.get('pendientes_hasta') === '2027-02-27', 'Aceptar otro rango descarta selección y aplica la nueva consulta');

  for (let i = 0; i < 4; i++) await createProduct('2027-02-23', Array.from({ length: 7 }, () => ({ id_producto: product.id, cantidad_solicitada: 100, precio_unitario: '1.00' })));
  await page.goto(queriedUrl); await panel().waitFor();
  check(await page.locator('[data-need]').count() === 50, 'Paginación limita el DOM a 50 necesidades');
  const firstCheckbox = page.locator('[data-need]').first().getByRole('checkbox');
  await firstCheckbox.focus(); await firstCheckbox.press('Space');
  check(await firstCheckbox.isChecked(), 'Casilla operable mediante teclado');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  check((await page.locator('.demand-selection-count').innerText()).includes('1 vínculo'), 'Cambiar de página conserva selección');
  check(new URL(page.url()).searchParams.get('pendientes_pagina') === '2', 'Página reflejada en URL');
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  check(await page.locator('[data-need]').first().getByRole('checkbox').isChecked(), 'Volver a página recupera la casilla marcada');
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'Página sin desborde horizontal a ' + width);
    const bounds = await page.locator('.demand-selection').boundingBox();
    check(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Resumen contenido a ' + width);
    await screenshot('tabla-' + width);
    await prepare();
    check(await dialog().evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Diálogo sin desborde a ' + width);
    await screenshot('dialogo-' + width);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    check(await page.getByRole('button', { name: 'Elaborar OCM', exact: true }).evaluate(el => el === document.activeElement), 'Foco vuelve a Elaborar OCM a ' + width);
  }
  const final = await state();
  check(final.orden_compra.some(order => order.id === created.id), 'Compra conservada tras navegación y pruebas adaptativas');
  return { checks, screenshots, createdOrder: created.no_orden, isolatedData: true };
}
