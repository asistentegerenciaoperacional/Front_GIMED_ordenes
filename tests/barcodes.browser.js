async (page) => {
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const origin = new URL(page.url()).origin;
  const state = async () => (await page.request.get(origin + '/api/state')).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + '/api/commands', { data: { name, payload } });
    check(response.ok(), 'Comando completado: ' + name);
    return (await response.json()).result;
  };
  const seed = await state();
  const product = seed.productos[0], assigned = seed.codigos_barras.find(c => c.id_producto === product.id && c.estado === 'asignado');
  const alternatives = seed.codigos_barras.filter(c => c.id_producto === product.id && c.estado === 'activo');
  const codeRow = code => page.locator('.barcode-panel .data-table tbody tr').filter({ has: page.locator('.barcode-number', { hasText: new RegExp('^' + code + '$') }) }).last();
  const dialog = () => page.getByRole('dialog').last();
  const confirm = () => dialog().getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.goto(origin + '/codigos');
  await page.locator('.barcode-panel').waitFor();
  const styles = await page.locator('.barcode-panel .badge').evaluateAll(nodes => {
    const result = {};
    for (const node of nodes) { const s = getComputedStyle(node); result[node.textContent] = { color: s.color, background: s.backgroundColor }; }
    return result;
  });
  check(Object.keys(styles).length === 5, 'Los cinco estados tienen etiqueta visible');
  check(new Set(Object.values(styles).map(s => s.color)).size === 5, 'Los cinco estados reutilizan colores diferentes');
  const lum = rgb => {
    const values = rgb.match(/\d+/g).slice(0,3).map(v => { const n = +v/255; return n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4; });
    return .2126*values[0]+.7152*values[1]+.0722*values[2];
  };
  for (const [name, s] of Object.entries(styles)) check((Math.max(lum(s.color),lum(s.background))+.05)/(Math.min(lum(s.color),lum(s.background))+.05)>=4.5, 'Contraste de ' + name + ' ≥ 4,5:1');
  check(await page.locator('.barcode-panel .data-table tbody tr').count() === seed.codigos_barras.length, 'La tabla muestra una fila por código');
  const trigger = codeRow(alternatives[0].codigo).getByRole('button', { name: 'Asignar código', exact: true });
  await trigger.click();
  check((await dialog().innerText()).includes(assigned.codigo), 'Confirmación muestra código anterior y nuevo');
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  check((await state()).codigos_barras.find(c => c.id === assigned.id).estado === 'asignado', 'Cancelar conserva la asignación');
  await page.waitForTimeout(100);
  check(await trigger.evaluate(el => el === document.activeElement), 'Cancelar devuelve el foco al botón');
  await trigger.click(); await confirm();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  let db = await state();
  check(db.codigos_barras.find(c => c.id === alternatives[0].id).estado === 'asignado' && db.codigos_barras.find(c => c.id === assigned.id).estado === 'activo', 'Sustitución intercambia Activo/Asignado');
  const newOrder = await command('createOrder', { tipo_orden: 'producto', id_proveedor: product.id_maquilador, fecha_solicitada_entrega: '2026-11-01T12:00:00.000Z', lines: [{ id_producto: product.id, cantidad_solicitada: 10, precio_unitario: '1.00' }] });
  db = await state();
  check(db.orden_producto.find(l => l.id_orden_compra === newOrder.orderId).id_codigo_barras === alternatives[0].id, 'Nueva orden usa el asignado elegido');
  check(seed.orden_producto.every(old => db.orden_producto.find(l => l.id === old.id).id_codigo_barras === old.id_codigo_barras), 'Órdenes anteriores conservan sus códigos');
  await codeRow(alternatives[1].codigo).getByRole('button', { name: 'Asignar código', exact: true }).click();
  await command('setAssignedBarcode', { id: assigned.id, id_producto: product.id, expectedAssignedId: alternatives[0].id, confirm: true });
  await confirm();
  await dialog().getByRole('button', { name: 'Revisar datos actualizados', exact: true }).waitFor();
  check(await dialog().getByRole('button', { name: 'Confirmar', exact: true }).isDisabled(), 'Conflicto conserva diálogo e impide sobreescribir sin revisar');
  await dialog().getByRole('button', { name: 'Revisar datos actualizados', exact: true }).click();
  check((await dialog().innerText()).includes(assigned.codigo), 'Revisión muestra la asignación concurrente');
  await confirm(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check((await state()).codigos_barras.find(c => c.id === alternatives[1].id).estado === 'asignado', 'Reintento revisado guarda la selección original');
  await codeRow(assigned.codigo).getByRole('button', { name: 'Asignar código', exact: true }).click();
  await page.route('**/api/commands', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Error temporal de prueba', code: 'SERVER' }) }));
  await confirm();
  await dialog().getByText('Error temporal de prueba', { exact: true }).waitFor();
  check((await dialog().innerText()).includes('Error temporal de prueba'), 'Error de servicio conserva la selección y muestra el mensaje');
  await page.unroute('**/api/commands');
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  await codeRow(alternatives[1].codigo).getByRole('button', { name: 'Marcar inactivo', exact: true }).click();
  check((await dialog().innerText()).includes('no se podrán emitir nuevas órdenes'), 'Desactivar asignado advierte del bloqueo de emisión');
  await confirm(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(!(await state()).codigos_barras.some(c => c.id_producto === product.id && c.estado === 'asignado'), 'Desactivación deja el producto sin asignado');
  await codeRow(assigned.codigo).getByRole('button', { name: 'Asignar código', exact: true }).click();
  await confirm(); await page.getByRole('dialog').waitFor({ state: 'hidden' });

  await page.waitForTimeout(150); // Allow React Aria's asynchronous focus restoration before typing.
  const search = page.getByRole('textbox', { name: 'Buscar códigos de barras', exact: true });
  await search.fill(alternatives[0].codigo);
  check(await codeRow(alternatives[0].codigo).isVisible() && await page.locator('.barcode-panel .data-table tbody tr').count() === 1, 'Buscar código muestra la fila coincidente');
  await search.fill('sin-resultados-123');
  await page.getByText('Sin códigos coincidentes', { exact: true }).waitFor();
  check(await page.getByText('Sin códigos coincidentes', { exact: true }).isVisible(), 'Búsqueda sin coincidencias informa estado vacío');
  await search.fill('');
  const verified = seed.codigos_barras.find(c => c.estado === 'verificado_sistema');
  await codeRow(verified.codigo).getByRole('button', { name: 'Asignar producto', exact: true }).click();
  await dialog().getByRole('combobox', { name: 'Producto', exact: true }).selectOption(product.id);
  check(await dialog().getByRole('textbox', { name: 'Proveedor', exact: true }).getAttribute('readonly') !== null, 'Proveedor de GS1 permanece bloqueado');
  await confirm(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  db = await state();
  check(db.codigos_barras.find(c => c.id === verified.id).estado === 'asignado' && db.codigos_barras.find(c => c.id === assigned.id).estado === 'activo', 'Asociación nueva asigna automáticamente y conserva el anterior activo');
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Página contenida a ' + width + 'px');
    await codeRow(assigned.codigo).getByRole('button', { name: 'Asignar código', exact: true }).click();
    check(await dialog().evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Confirmación contenida a ' + width + 'px');
    await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.locator('.barcode-panel > .table-scroll').evaluate(el => el.scrollLeft = 0);
    await page.getByRole('textbox', { name: 'Buscar códigos de barras', exact: true }).focus();
    await page.screenshot({ path: 'tests/evidence/barcodes/list-' + width + '.png', fullPage: true });
  }
  return { checks, badgeStyles: styles };
}
