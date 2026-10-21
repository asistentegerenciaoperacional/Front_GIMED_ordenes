async (page) => {
  page.setDefaultTimeout(7000);
  const origin = new URL(page.url()).origin;
  const checks = [];
  const errors = [];
  const responses = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) responses.push({ url: r.url(), status: r.status() });
  });
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    checks.push(name);
  };
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const materialState = (db) => ({
    orders: db.orden_compra.filter((order) => order.tipo_orden !== 'producto'),
    lines: db.orden_material,
    otherLines: db.orden_otro,
    lots: db.lote_material,
    counters: db.consecutivo_orden.filter((counter) => counter.grupo !== 'producto'),
  });
  const apiCommand = (name, payload) => page.request.post(origin + '/api/commands', {data:{name,payload}});
  const unauthorizedActionsBlocked = async (type) => {
    const close=page.getByRole('button',{name:'Cerrar',exact:true});
    const cancel=page.getByRole('button',{name:'Anular',exact:true});
    check(await close.count()>0 && await cancel.count()>0 &&
      await close.evaluateAll((buttons) => buttons.every((button) => button.disabled)) &&
      await cancel.evaluateAll((buttons) => buttons.every((button) => button.disabled)),
      'Cerrar y anular quedan bloqueados en la orden de '+type+' sin autorización');
  };
  const requiredDeliveryBlocked = async (type) => {
    const field=dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true});
    check((await field.getAttribute('required')!==null || await field.getAttribute('aria-required')==='true'),'Entrega solicitada marcada obligatoria en '+type);
    await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
    await dialog().getByRole('alert').waitFor();
    check(await field.getAttribute('aria-invalid')==='true' &&
      await dialog().getByRole('button',{name:'Revisar orden',exact:true}).isVisible() &&
      await dialog().getByRole('button',{name:'Crear orden',exact:true}).count()===0,
      'Fecha vacía impide avanzar a revisión en '+type);
    await dialog().getByRole('alert').getByRole('link',{name:'Indica la fecha solicitada de entrega.',exact:true}).click();
    check(await field.evaluate((element) => element===document.activeElement),
      'El error de entrega enfoca el campo obligatorio en '+type);
  };
  const optionsFor=async control=>{
    if(await control.evaluate(el=>el.tagName)==='INPUT')await control.locator('xpath=..').getByRole('button',{name:'Mostrar opciones',exact:true}).click();
    else await control.click();
    const options=await page.getByRole('option').allTextContents();
    await page.keyboard.press('Escape');
    return options;
  };
  const shot = async (name) =>
    page.screenshot({
      path: "tests/evidence/" + name + ".png",
      fullPage: true,
    });
  const dialog = () => page.locator("[role=dialog]").last();
  const helpFor = (control) => control.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," field ")][1]').locator('button.field-help');
  const tooltipFor = async (control) => {
    const tooltip=page.getByRole('tooltip');
    await tooltip.waitFor({state:'visible'});
    const description=await helpFor(control).getAttribute('aria-describedby');
    const id=await tooltip.getAttribute('id');
    if(!id || !description?.split(' ').includes(id))throw new Error('Ayuda sin descripción enlazada al tooltip');
    return tooltip;
  };
  const dismissHelp = async () => {
    await dialog().locator('.dialog-heading h2').click();
    await page.mouse.move(0,0);
    await page.waitForFunction(() => !document.querySelector('[role=tooltip]'));
  };
  const openNavigation = async () => {
    const drawer=page.locator('#app-navigation');
    if (!await drawer.isVisible())
      await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();
    await drawer.waitFor();
    await drawer.evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished)); });
    return drawer;
  };
  const nav = async (name) => {
    const drawer=await openNavigation();
    const floating=await drawer.evaluate((el) => el.dataset.modal === "true");
    await drawer.getByRole("link", { name, exact: true }).click();
    if (floating) await drawer.waitFor({state:'hidden'});
    await page.waitForFunction(() => document.activeElement === document.getElementById('main-content'));
    await page.getByRole('heading',{name:new RegExp('^'+name),level:1}).waitFor();
    await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
  };
  const authorize = async () => {
    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    check(
      await dialog()
        .getByRole("button", { name: "Confirmar autorización", exact: true })
        .isDisabled(),
      "Autorización exige confirmar firmas",
    );
    await dialog().getByRole("checkbox").check();
    await dialog()
      .getByRole("button", { name: "Confirmar autorización", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/ordenes");
  await page
    .getByRole("heading", { name: "Órdenes de compra", exact: true })
    .waitFor();
  const initial = await state();
  check(Object.keys(initial).length === 28, "Estado con 28 colecciones");
  const drawerRoutes=['Órdenes de compra','Abastecimiento','Catálogos','Códigos de barras','Proveedores','Facturas','Documentos','Correos','Configuración'];
  for (const width of [375,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    const menuButton=page.getByRole('button',{name:'Abrir navegación',exact:true});
    check(await menuButton.isVisible() && await page.locator('#app-navigation').isHidden() &&
      await page.locator('.main-area').evaluate((el) => el.getBoundingClientRect().left===0),
      'Drawer cerrado y contenido sin espacio lateral reservado a '+width+' px');
    const before=await page.locator('.main-area').boundingBox();
    const drawer=await openNavigation();
    check(await drawer.getByRole('link').allTextContents().then((labels) => labels.join('|')===drawerRoutes.join('|')),
      'Drawer conserva todos los destinos y Configuración a '+width+' px');
    check(await drawer.evaluate((el) => el.matches('[data-modal="true"]') && el.contains(document.activeElement)) &&
      await page.locator('.main-area').evaluate((el) => el.inert) &&
      await page.evaluate(() => (document.documentElement.style.overflow==='hidden'||document.body.style.overflow==='hidden')),
      'Drawer retiene foco, bloquea el fondo y su desplazamiento a '+width+' px');
    const after=await page.locator('.main-area').boundingBox();
    check(Math.abs(before.x-after.x)<1 && Math.abs(before.width-after.width)<1,
      'Abrir el drawer superpone el panel sin mover el contenido a '+width+' px');
    let focusContained=true;
    for (let tab=0;tab<12;tab++) {
      await page.keyboard.press('Tab');
      focusContained &&= await drawer.evaluate((el) => el.contains(document.activeElement));
    }
    await page.keyboard.press('Shift+Tab');
    focusContained &&= await drawer.evaluate((el) => el.contains(document.activeElement));
    const closeButton=drawer.getByRole('button',{name:'Cerrar navegación',exact:true});
    const pinButton=drawer.getByRole('button',{name:'Fijar navegación',exact:true});
    const firstDrawerControl = width >= 1024 ? pinButton : closeButton;
    check(await pinButton.count() === (width >= 1024 ? 1 : 0),
      'Fijar navegación solo está disponible desde 1024 px a '+width+' px');
    await firstDrawerControl.focus();
    await page.keyboard.press('Shift+Tab');
    focusContained &&= await drawer.getByRole('link',{name:'Configuración',exact:true}).evaluate((el) => el===document.activeElement);
    await page.keyboard.press('Tab');
    focusContained &&= await firstDrawerControl.evaluate((el) => el===document.activeElement);
    check(focusContained,'Tab y Shift+Tab permanecen en el drawer a '+width+' px');
    if (width===375 || width===1440)
      await page.screenshot({path:'tests/evidence/26-drawer-'+width+'.png',fullPage:false});
    await page.keyboard.press('Escape');
    await drawer.waitFor({state:'hidden'});
    await page.waitForFunction(() => document.activeElement === document.querySelector('button[aria-controls="app-navigation"]'));
    check(await menuButton.evaluate((el) => el===document.activeElement) &&
      await page.locator('.main-area').evaluate((el) => !el.inert) &&
      await page.evaluate(() => document.documentElement.style.overflow!== 'hidden'),
      'Escape cierra el drawer y restaura foco y desplazamiento a '+width+' px');
    await openNavigation();
    await drawer.getByRole('button',{name:'Cerrar navegación',exact:true}).click();
    await drawer.waitFor({state:'hidden'});
    await page.waitForFunction(() => document.activeElement === document.querySelector('button[aria-controls="app-navigation"]'));
    check(await menuButton.evaluate((el) => el===document.activeElement), 'Botón de cierre del drawer disponible a '+width+' px');
    await openNavigation();
    const bounds=await drawer.boundingBox();
    const routeBeforeBackdrop=page.url();
    await page.mouse.click(Math.min(width-16,bounds.x+bounds.width+28),40);
    await drawer.waitFor({state:'hidden'});
    await page.waitForFunction(() => document.activeElement === document.querySelector('button[aria-controls="app-navigation"]'));
    check(page.url()===routeBeforeBackdrop && await menuButton.evaluate((el) => el===document.activeElement),
      'Clic en el fondo cierra el drawer sin navegar a '+width+' px');
  }
  const finishLayoutTransition=async () => {
    await page.locator('.shell').evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
    });
  };
  for (const width of [1024,1440]) {
    await page.setViewportSize({width,height:900});
    let drawer=await openNavigation();
    await drawer.getByRole('button',{name:'Fijar navegación',exact:true}).click();
    drawer=page.locator('#app-navigation');
    await drawer.getByRole('button',{name:'Desfijar navegación',exact:true}).waitFor();
    await finishLayoutTransition();
    const geometry=await page.evaluate(() => {
      const nav=document.getElementById('app-navigation');
      const main=document.querySelector('.main-area');
      const sideBox=nav.getBoundingClientRect(),mainBox=main.getBoundingClientRect();
      return {tag:nav.tagName,sideLeft:sideBox.left,sideRight:sideBox.right,sideWidth:sideBox.width,
        mainLeft:mainBox.left,mainRight:mainBox.right,width:document.documentElement.clientWidth,
        layoutRight:document.querySelector('.shell').getBoundingClientRect().right,
        scrollWidth:document.documentElement.scrollWidth,inert:main.inert,overflow:document.body.style.overflow};
    });
    check(geometry.tag==='ASIDE' && geometry.sideLeft===0 && geometry.sideWidth>0 &&
      Math.abs(geometry.mainLeft-geometry.sideRight)<1 && Math.abs(geometry.mainRight-geometry.layoutRight)<1 &&
      geometry.scrollWidth<=geometry.width+1,
      'Drawer fijado reserva su espacio y el contenido se reajusta sin solaparse a '+width+' px');
    check(!geometry.inert && geometry.overflow!=='hidden' &&
      await drawer.getByRole('button',{name:'Desfijar navegación',exact:true}).getAttribute('aria-pressed')==='true',
      'Drawer fijado deja el contenido interactivo y ofrece desfijar a '+width+' px');
    await page.keyboard.press('Escape');
    await page.getByRole('heading',{name:'Órdenes de compra',exact:true}).click();
    check(await drawer.isVisible() && await page.locator('.shell.nav-pinned').count()===1,
      'Escape y clic en contenido mantienen visible el drawer fijado a '+width+' px');
    const currentLink=drawer.getByRole('link',{name:'Órdenes de compra',exact:true});
    await currentLink.click();
    const pinnedSearch=page.getByRole('textbox',{name:'Buscar órdenes',exact:true});
    await pinnedSearch.fill('Aurora');
    check(await pinnedSearch.evaluate((el) => el===document.activeElement),
      'Buscar con el drawer fijado conserva el foco incluso tras elegir la página actual a '+width+' px');
    await pinnedSearch.fill('');
    await nav('Facturas');
    check(await drawer.isVisible() && await drawer.getByRole('link',{name:'Facturas',exact:true}).getAttribute('aria-current')==='page' &&
      await page.locator('.shell.nav-pinned').count()===1,
      'Drawer conserva su estado fijado al navegar a Facturas a '+width+' px');
    await nav('Órdenes de compra');
    check(await drawer.isVisible() && await page.locator('.shell.nav-pinned').count()===1,
      'Drawer sigue fijado al regresar a Órdenes a '+width+' px');
    await page.evaluate(() => window.scrollTo(0,180));
    check(await drawer.evaluate((el) => Math.abs(el.getBoundingClientRect().top)<1),
      'Drawer fijado permanece visible al desplazar la página a '+width+' px');
    await page.evaluate(() => window.scrollTo(0,0));
    if(width===375 || width===1440) {
      for(const destination of drawerRoutes) {
        await nav(destination);
        check(await drawer.isVisible() && await page.evaluate(() => {
          const nav=document.getElementById('app-navigation').getBoundingClientRect();
          const main=document.querySelector('.main-area').getBoundingClientRect();
          return Math.abs(main.left-nav.right)<1 && document.documentElement.scrollWidth<=document.documentElement.clientWidth+1;
        }),
        'Drawer fijado y contenido sin desbordamiento en '+destination+' a '+width+' px');
      }
      await nav('Órdenes de compra');
      for(const group of ['Productos','Materiales']) {
        await page.getByRole('tab',{name:group,exact:true}).click();
        await page.locator('.orders-table .order-link').first().click();
        await page.getByRole('heading',{name:/^Orden de compra /,level:1}).waitFor();
        check(await drawer.isVisible() && await page.evaluate(() =>
          document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),
          'Detalle de '+group+' conserva el drawer fijado y no desborda a '+width+' px');
        await nav('Órdenes de compra');
      }
    }
    const unpinButton=drawer.getByRole('button',{name:'Desfijar navegación',exact:true});
    await unpinButton.focus();
    await page.keyboard.press('Tab');
    const focusedLink=drawer.getByRole('link',{name:'Órdenes de compra',exact:true});
    check(await focusedLink.evaluate((el) => el===document.activeElement),
      'Navegación con teclado disponible en el drawer fijado a '+width+' px');
    await drawer.getByRole('link',{name:'Configuración',exact:true}).focus();
    await page.keyboard.press('Tab');
    check(await drawer.evaluate((el) => !el.contains(document.activeElement)),
      'Drawer fijado permite salir con Tab hacia el contenido a '+width+' px');
    if(width===375 || width===1440)
      await page.screenshot({path:'tests/evidence/27-drawer-fijado-'+width+'.png',fullPage:false});
    await drawer.getByRole('button',{name:'Desfijar navegación',exact:true}).click();
    drawer=page.locator('#app-navigation');
    await drawer.getByRole('button',{name:'Fijar navegación',exact:true}).waitFor();
    await finishLayoutTransition();
    check(await drawer.evaluate((el) => el.dataset.modal === "true" && el.matches('[data-modal="true"]')) &&
      await page.locator('.main-area').evaluate((el) => el.getBoundingClientRect().left===0 && el.inert),
      'Desfijar mantiene abierto el panel flotante y devuelve todo el ancho al contenido a '+width+' px');
    check(await drawer.getByRole('button',{name:'Fijar navegación',exact:true}).evaluate((el) => el===document.activeElement),
      'Cambiar entre fijado y flotante conserva el foco en el botón de fijación a '+width+' px');
    await page.keyboard.press('Escape');
    await drawer.waitFor({state:'hidden'});
    check(await page.locator('.main-area').evaluate((el) => el.getBoundingClientRect().left===0 && !el.inert) &&
      await page.locator('.shell.nav-pinned').count()===0,
      'Cerrar el drawer desfijado conserva todo el ancho original a '+width+' px');
  }
  for (const width of [1023,708,375]) {
    await page.setViewportSize({width:1440,height:900});
    let drawer=await openNavigation();
    await drawer.getByRole('button',{name:'Fijar navegación',exact:true}).click();
    await page.locator('#app-navigation.navigation-pinned').waitFor();
    await page.setViewportSize({width,height:668});
    drawer=page.locator('#app-navigation');
    await page.locator('#app-navigation[data-modal=true]').waitFor();
    await finishLayoutTransition();
    check(await drawer.getByRole('button',{name:/Fijar navegación|Desfijar navegación/}).count()===0 &&
      await page.locator('.shell.nav-pinned').count()===0 &&
      await drawer.evaluate(el=>el.matches('[data-modal="true"]')),
      'Reducir un drawer fijado a '+width+' px lo convierte en flotante y oculta fijación');
    check(await page.locator('.main-area').evaluate(el=>el.getBoundingClientRect().left===0 && el.inert) &&
      await drawer.getByRole('button',{name:'Cerrar navegación',exact:true}).evaluate(el=>el===document.activeElement),
      'El contenido recupera todo el ancho y el foco pasa al cierre a '+width+' px');
    if(width===375) await shot('49-drawer-redimensionado-375');
    await page.setViewportSize({width:1440,height:900});
    await drawer.getByRole('button',{name:'Fijar navegación',exact:true}).waitFor();
    check(await drawer.evaluate(el=>el.dataset.modal === "true" && el.matches('[data-modal="true"]')) &&
      await page.locator('.shell.nav-pinned').count()===0,
      'Volver a escritorio mantiene el drawer desfijado tras reducir a '+width+' px');
    await page.keyboard.press('Escape');
    await drawer.waitFor({state:'hidden'});
  }
  await page.setViewportSize({width:375,height:360});
  const shortDrawer=await openNavigation();
  const drawerScroll=shortDrawer.locator('.drawer-scroll');
  await drawerScroll.evaluate((el) => { el.scrollTop=el.scrollHeight; });
  check(await drawerScroll.evaluate((el) => el.scrollHeight>el.clientHeight && el.scrollTop>0) &&
    await shortDrawer.getByRole('button',{name:'Cerrar navegación',exact:true}).isVisible(),
    'Drawer tiene scroll interno en una ventana baja y conserva su botón de cierre');
  await page.setViewportSize({width:1024,height:900});
  check(await shortDrawer.isVisible() && await shortDrawer.evaluate((el) => el.dataset.modal === 'true'),
    'Drawer abierto se adapta al cambiar de tamaño entre móvil y escritorio');
  await shortDrawer.getByRole('button',{name:'Cerrar navegación',exact:true}).click();
  await shortDrawer.waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'reduce'});
  const reducedDrawer=await openNavigation();
  check(await reducedDrawer.evaluate((el) => getComputedStyle(el).animationName==='none' &&
    getComputedStyle(el,'::backdrop').animationName==='none'), 'Drawer y fondo respetan movimiento reducido');
  await reducedDrawer.getByRole('button',{name:'Cerrar navegación',exact:true}).click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1440,height:900});
  await nav('Facturas');
  await page.waitForFunction(() => document.activeElement === document.getElementById('main-content'));
  check(new URL(page.url()).pathname==='/facturas' &&
    await page.locator('#app-navigation').isHidden() &&
    await page.locator('#main-content').evaluate((el) => el===document.activeElement),
    'Elegir un destino cierra el drawer y enfoca el contenido de la página');
  const currentDrawer=await openNavigation();
  check(await currentDrawer.getByRole('link',{name:'Facturas',exact:true}).getAttribute('aria-current')==='page',
    'Drawer identifica la página actual después de navegar');
  await currentDrawer.getByRole('link',{name:'Órdenes de compra',exact:true}).click();
  await currentDrawer.waitFor({state:'hidden'});
  check(new URL(page.url()).pathname === '/ordenes/productos', 'Ruta principal de órdenes abre la pestaña Productos');
  check((await page.locator('.orders-table tbody td:first-child .badge').allTextContents()).every((type) => type === 'Producto'), 'Productos no mezcla materiales ni otros');
  check(await page.getByRole('combobox',{name:'Filtrar tipo de orden',exact:true}).count() === 0, 'Productos tiene su lista exclusiva');
  check(await page.locator('.order-numbering').innerText().then((s) => s.includes('2804') && s.includes('2805')), 'Último y próximo consecutivo de producto en la pantalla principal');
  check(!await page.locator('.order-numbering').innerText().then((s) => s.includes('Órdenes de')), 'Consecutivos de productos sin título redundante');
  await page.getByRole('tab',{name:'Materiales',exact:true}).click();
  check(new URL(page.url()).pathname === '/ordenes/materiales', 'Pestaña Materiales usa su propia ruta');
  check(!await page.locator('.order-numbering').innerText().then((s) => s.includes('Órdenes de')), 'Consecutivos de materiales sin título redundante');
  const materialFilter=page.getByRole('combobox',{name:'Filtrar tipo de orden',exact:true});
  check(await page.locator('.order-numbering').innerText().then((text) => text.includes('Última OCM:') && text.includes('Próxima OCM:')),
    'Materiales y otros muestran OCM en sus consecutivos');
  const materialOrderLabels=await page.locator('.orders-table .order-link').allTextContents();
  check(materialOrderLabels.length>0 && materialOrderLabels.every((label) => /^OCM \d+$/.test(label.trim())),
    'Listado de materiales y otros usa OCM en todas sus órdenes');
  check(await optionsFor(materialFilter).then((types) => types.join('|') === 'Todos los tipos|Material|Otros'), 'Filtro de Materiales admite materiales y otros');
  let materialTypes=[];
  for (const view of ['Seguimiento','No autorizadas','Anuladas']) {
    await page.getByRole('tab',{name:new RegExp('^'+view)}).click();
    materialTypes.push(...await page.locator('.orders-table tbody td:first-child .badge').allTextContents());
  }
  check(materialTypes.includes('Material') && materialTypes.includes('Otros') && materialTypes.every((type) => ['Material','Otros'].includes(type)), 'Materiales incluye otros en las vistas y excluye productos');
  await page.getByRole('tab',{name:/^Seguimiento/}).click();
  await materialFilter.selectOption('otro');
  check((await page.locator('.orders-table tbody td:first-child .badge').allTextContents()).every((type) => type === 'Otros'), 'Filtro de otros excluye materiales');
  await materialFilter.selectOption('material');
  check((await page.locator('.orders-table tbody td:first-child .badge').allTextContents()).every((type) => type === 'Material'), 'Filtro de material excluye otros');
  await materialFilter.selectOption('');
  await shot('16-ordenes-materiales');
  await page.locator('.page-heading').getByRole('button',{name:'Nueva orden',exact:true}).click();
  const orderNumber=dialog().getByRole('textbox',{name:'Número de orden',exact:true});
  check(await orderNumber.inputValue() === '1605' && !await orderNumber.isEditable(), 'Creación de material muestra el siguiente consecutivo bloqueado');
  check(await dialog().getByRole('textbox',{name:'Entrega estimada',exact:true}).count() === 0, 'Creación de material no solicita entrega estimada por renglón');
  await dialog().getByRole('combobox',{name:'Tipo de orden',exact:true}).selectOption('otro');
  check(await orderNumber.inputValue() === '1605', 'Materiales y otros comparten el consecutivo del formulario');
  check(await dialog().getByRole('textbox',{name:'Entrega estimada',exact:true}).count() === 0, 'Creación de otros no solicita entrega estimada por renglón');
  await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('tab',{name:'Productos',exact:true}).click();
  await page.goBack();
  await page.waitForURL((url) => url.pathname === '/ordenes/materiales');
  check(new URL(page.url()).pathname === '/ordenes/materiales', 'Atrás conserva la navegación entre pestañas');
  await page.goForward();
  await page.waitForURL((url) => url.pathname === '/ordenes/productos');
  await page.reload();
  await page.getByRole('heading',{name:'Órdenes de compra',exact:true}).waitFor();
  check(new URL(page.url()).pathname === '/ordenes/productos', 'Recarga directa de la ruta de productos');
  const tableNumbers = async () => page.locator('.orders-table .order-link').allTextContents();
  const openColumn = async (label) => {
    const trigger = page.getByRole('button',{name:'Filtrar y ordenar '+label,exact:true});
    await trigger.scrollIntoViewIfNeeded();
    await trigger.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await trigger.click();
    const panel=page.getByRole('dialog',{name:'Filtrar y ordenar '+label,exact:true});
    await panel.waitFor();
    return panel;
  };
  const applyColumn = async (panel) => {
    await panel.getByRole('button',{name:'Aplicar',exact:true}).click();
    await panel.waitFor({state:'hidden'});
  };
  check(await page.getByRole('columnheader',{name:/^Fecha de elaboración/}).count() === 1 &&
    (await page.locator('.orders-table tbody tr').first().locator('td').nth(3).innerText()).includes('21 de sept de 2026'),
    'Tabla incluye fecha de elaboración con su botón de filtro');
  check(await page.locator('.orders-table thead .column-filter-button').count() === 7,
    'Siete columnas de datos con menú de filtro; el acceso a detalle se conserva');
  check(await page.getByRole('combobox',{name:'Filtrar estado de seguimiento',exact:true}).count() === 0,
    'Selector superior de estados retirado');
  const initialNumbers=await tableNumbers();
  for (const width of [1440,375]) {
    await page.setViewportSize({width,height:900});
    await page.waitForFunction(() => {
      return !document.querySelector('#app-navigation[data-modal=true]');
    });
    const rowPanel=await openColumn('Estado');
    const valueBox=rowPanel.getByRole('checkbox',{name:'Autorizada',exact:true});
    const valueRow=rowPanel.locator('.column-value-option').filter({has:page.getByRole('checkbox',{name:'Autorizada',exact:true})});
    await valueRow.locator('span').last().click();
    check(await rowPanel.isVisible() && !await valueBox.isChecked(), 'Clic en el texto desmarca el valor sin cerrar el menú a '+width+' px');
    await valueRow.locator('span').last().click();
    check(await rowPanel.isVisible() && await valueBox.isChecked(), 'Segundo clic en el texto marca el valor una sola vez a '+width+' px');
    for (const edge of ['left','right']) {
      await valueRow.scrollIntoViewIfNeeded();
      const box=await valueRow.boundingBox();
      const before=await valueBox.isChecked();
      await valueRow.click({position:{x:edge==='left' ? 2 : box.width-2,y:box.height/2}});
      check(await rowPanel.isVisible() && await valueBox.isChecked() !== before,
        'Clic en el espacio '+edge+' de la fila alterna la casilla sin cerrar a '+width+' px');
    }
    await valueRow.scrollIntoViewIfNeeded();
    const rowBounds=await valueRow.boundingBox();
    const beforeHold=await valueBox.isChecked();
    await page.mouse.move(rowBounds.x+rowBounds.width-4,rowBounds.y+rowBounds.height/2);
    await page.mouse.down();
    check(await rowPanel.isVisible() && await valueBox.isChecked() === beforeHold,
      'Mantener pulsada la fila conserva el menú hasta completar el clic a '+width+' px');
    await page.mouse.up();
    check(await rowPanel.isVisible() && await valueBox.isChecked() !== beforeHold,
      'Soltar el clic alterna la casilla una sola vez a '+width+' px');
    const beforeBoxClick=await valueBox.isChecked();
    await valueBox.click();
    check(await rowPanel.isVisible() && await valueBox.isChecked() !== beforeBoxClick,
      'Clic directo en la casilla no duplica la selección a '+width+' px');
    const beforeSpace=await valueBox.isChecked();
    await valueBox.press('Space');
    check(await rowPanel.isVisible() && await valueBox.isChecked() !== beforeSpace,
      'Espacio alterna la casilla con teclado y conserva el menú a '+width+' px');
    const allBox=rowPanel.getByRole('checkbox',{name:'Seleccionar todos',exact:true});
    await allBox.check();
    await rowPanel.getByText('Seleccionar todos',{exact:true}).click();
    check(await rowPanel.isVisible() && await rowPanel.locator('.column-value-list input:checked').count() === 0,
      'Clic en el texto Seleccionar todos desmarca todos los valores a '+width+' px');
    const allRow=rowPanel.locator('.column-select-all');
    const allBounds=await allRow.boundingBox();
    await allRow.click({position:{x:allBounds.width-2,y:allBounds.height/2}});
    check(await rowPanel.isVisible() && await rowPanel.locator('.column-value-list input:checked').count() === 3,
      'Clic en el espacio de Seleccionar todos marca todos los valores a '+width+' px');
    await rowPanel.getByRole('button',{name:'Aplicar',exact:true}).focus();
    await page.keyboard.press('Tab');
    if(await rowPanel.isVisible())await page.keyboard.press('Tab');
    await rowPanel.waitFor({state:'hidden'});
    check(await rowPanel.isHidden(), 'Salir con Tab sigue cerrando el menú después de seleccionar valores a '+width+' px');
    check((await tableNumbers()).join('|') === initialNumbers.join('|'), 'Cambios de selección se conservan como borrador hasta aplicar a '+width+' px');
  }
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(() => !document.querySelector('#app-navigation[data-modal=true]'));
  let columnPanel=await openColumn('Proveedor');
  check(await columnPanel.getByRole('button',{name:'De A a Z',exact:true}).count() === 1 &&
    await columnPanel.getByRole('combobox',{name:'Condición',exact:true}).count() === 1 &&
    await columnPanel.getByRole('checkbox',{name:'Seleccionar todos',exact:true}).count() === 1,
    'Selección de valores, condiciones y ordenamiento reunidos en el menú de la columna');
  await columnPanel.getByRole('combobox',{name:'Condición',exact:true}).selectOption('contains');
  await columnPanel.getByRole('textbox',{name:'Valor del filtro',exact:true}).fill('Aurora');
  await applyColumn(columnPanel);
  await page.getByRole('textbox',{name:'Buscar órdenes',exact:true}).fill('Crema');
  check((await tableNumbers()).length === 4 && await page.getByRole('textbox',{name:'Buscar órdenes',exact:true}).inputValue() === 'Crema',
    'Filtro de proveedor se combina con la búsqueda conservada');
  await page.reload();
  await page.getByRole('heading',{name:'Órdenes de compra',exact:true}).waitFor();
  check(new URL(page.url()).searchParams.has('filtros') && await page.getByRole('textbox',{name:'Buscar órdenes',exact:true}).inputValue() === 'Crema',
    'Filtros de columnas y búsqueda se recuperan después de recargar');
  await page.getByRole('textbox',{name:'Buscar órdenes',exact:true}).fill('');
  columnPanel=await openColumn('Total');
  await columnPanel.getByRole('combobox',{name:'Condición',exact:true}).selectOption('between');
  await columnPanel.getByRole('textbox',{name:'Desde',exact:true}).fill('40000000');
  await columnPanel.getByRole('textbox',{name:'Hasta',exact:true}).fill('25000000');
  await columnPanel.getByRole('button',{name:'Aplicar',exact:true}).click();
  await columnPanel.getByRole('alert').waitFor();
  check(await columnPanel.getByRole('alert').innerText().then((t) => t.includes('no puede ser mayor')),
    'Intervalo invertido muestra un error y conserva el menú');
  await columnPanel.getByRole('textbox',{name:'Desde',exact:true}).fill('25000000,00');
  await columnPanel.getByRole('textbox',{name:'Hasta',exact:true}).fill('40000000,00');
  await applyColumn(columnPanel);
  check((await tableNumbers()).join('|') === 'OC 2804|OC 2750', 'Rango de importes combinado con proveedor');
  columnPanel=await openColumn('Total');
  await columnPanel.getByRole('button',{name:'De menor a mayor',exact:true}).click();
  check((await tableNumbers()).join('|') === 'OC 2750|OC 2804', 'Ordenamiento numérico ascendente de importes');
  columnPanel=await openColumn('Total');
  await columnPanel.getByRole('button',{name:'De mayor a menor',exact:true}).click();
  check((await tableNumbers()).join('|') === 'OC 2804|OC 2750', 'Ordenamiento descendente conserva los filtros');
  await page.reload();
  await page.getByRole('heading',{name:'Órdenes de compra',exact:true}).waitFor();
  check((await tableNumbers()).join('|') === 'OC 2804|OC 2750' && new URL(page.url()).searchParams.get('ordenar') === 'total',
    'Ordenamiento y filtros combinados conservados al recargar');
  await shot('24-filtros-columnas-combinados');
  await page.getByRole('button',{name:/^Limpiar filtros/}).click();
  columnPanel=await openColumn('Estado');
  await columnPanel.getByRole('checkbox',{name:'Seleccionar todos',exact:true}).uncheck();
  await columnPanel.getByRole('checkbox',{name:'Autorizada',exact:true}).check();
  await columnPanel.getByRole('checkbox',{name:'Parcialmente anulada',exact:true}).check();
  await applyColumn(columnPanel);
  check((await tableNumbers()).sort().join('|') === 'OC 2801|OC 2803', 'Selección múltiple de estados desde su columna');
  columnPanel=await openColumn('Estado');
  await columnPanel.getByRole('checkbox',{name:'Seleccionar todos',exact:true}).check();
  await columnPanel.getByRole('checkbox',{name:'Seleccionar todos',exact:true}).uncheck();
  await applyColumn(columnPanel);
  check(await page.getByRole('heading',{name:'No hay órdenes coincidentes',exact:true}).count() === 1 &&
    await page.locator('.orders-table thead .column-filter-button').count() === 7,
    'Sin valores seleccionados se muestra el estado vacío y se conservan las cabeceras');
  columnPanel=await openColumn('Estado');
  await columnPanel.getByRole('button',{name:'Quitar filtro',exact:true}).click();
  check((await tableNumbers()).length === 4, 'Filtro se puede quitar desde la tabla sin resultados');
  columnPanel=await openColumn('Productos');
  await columnPanel.getByRole('searchbox',{name:'Buscar valores',exact:true}).fill('Gel');
  check(await columnPanel.locator('.column-value-list').getByRole('checkbox').count() === 1,
    'Lista de valores buscable con todos los productos asociados, incluidos los renglones secundarios');
  await columnPanel.getByRole('checkbox',{name:'Seleccionar todos',exact:true}).uncheck();
  await columnPanel.locator('.column-value-list').getByRole('checkbox').check();
  await applyColumn(columnPanel);
  check((await tableNumbers()).sort().join('|') === 'OC 2801|OC 2803', 'Filtro por producto secundario de órdenes con varios renglones');
  await page.getByRole('button',{name:/^Limpiar filtros/}).click();
  columnPanel=await openColumn('Fecha de elaboración');
  await columnPanel.getByRole('combobox',{name:'Condición',exact:true}).selectOption('equals');
  await columnPanel.getByRole('textbox',{name:'Valor del filtro',exact:true}).pressSequentially('21092026');
  check(await columnPanel.getByRole('textbox',{name:'Valor del filtro',exact:true}).inputValue() === '21/09/2026' &&
    await columnPanel.getByRole('button',{name:'Abrir calendario: Valor del filtro',exact:true}).count() === 1,
    'Filtros de fecha conservan escritura con separadores automáticos y calendario');
  await applyColumn(columnPanel);
  check((await tableNumbers()).length === 4, 'Filtro de fecha de elaboración por día exacto');
  await page.getByRole('button',{name:/^Limpiar filtros/}).click();
  columnPanel=await openColumn('Entrega solicitada');
  await columnPanel.getByRole('combobox',{name:'Condición',exact:true}).selectOption('between');
  await columnPanel.getByRole('textbox',{name:'Desde',exact:true}).fill('09/10/2026');
  await columnPanel.getByRole('textbox',{name:'Hasta',exact:true}).fill('15/10/2026');
  await applyColumn(columnPanel);
  check((await tableNumbers()).sort().join('|') === 'OC 2801|OC 2804', 'Intervalo de fechas incluye ambos extremos');
  columnPanel=await openColumn('Entrega solicitada');
  await columnPanel.getByRole('button',{name:'De más antigua a más reciente',exact:true}).click();
  check((await tableNumbers()).join('|') === 'OC 2804|OC 2801', 'Ordenamiento cronológico de entregas');
  columnPanel=await openColumn('Entrega solicitada');
  await columnPanel.getByRole('combobox',{name:'Condición',exact:true}).selectOption('empty');
  await applyColumn(columnPanel);
  check((await tableNumbers()).length === 0, 'Condición Sin fecha disponible para entregas');
  await page.getByRole('button',{name:/^Limpiar filtros/}).click();
  columnPanel=await openColumn('Orden / tipo');
  await columnPanel.getByRole('combobox',{name:'Condición',exact:true}).selectOption('greater_equal');
  await columnPanel.getByRole('textbox',{name:'Valor del filtro',exact:true}).fill('2803');
  await applyColumn(columnPanel);
  check((await tableNumbers()).sort().join('|') === 'OC 2803|OC 2804', 'Condición numérica de número de OC');
  await page.getByRole('button',{name:/^Limpiar filtros/}).click();
  columnPanel=await openColumn('Orden / tipo');
  await columnPanel.getByRole('button',{name:'De menor a mayor',exact:true}).click();
  check((await tableNumbers()).join('|') === 'OC 2750|OC 2801|OC 2803|OC 2804', 'Ordenamiento de números de OC desde la cabecera');
  const beforeCancel=page.url();
  columnPanel=await openColumn('Proveedor');
  await columnPanel.getByRole('checkbox',{name:'Seleccionar todos',exact:true}).uncheck();
  await columnPanel.getByRole('button',{name:'Cancelar',exact:true}).click();
  check(page.url() === beforeCancel && (await tableNumbers()).length === 4, 'Cancelar el menú descarta la selección sin aplicar');
  columnPanel=await openColumn('Proveedor');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Filtrar y ordenar Proveedor');
  check(await columnPanel.isHidden() && await page.getByRole('button',{name:'Filtrar y ordenar Proveedor',exact:true}).evaluate((el) => el === document.activeElement),
    'Escape cierra el menú y devuelve el foco a su cabecera');
  columnPanel=await openColumn('Proveedor');
  await page.getByRole('heading',{name:'Órdenes de compra',exact:true}).click();
  check(await columnPanel.isHidden(), 'Clic fuera de la columna cierra su menú');
  for (const width of [375,768,802,1024,1440]) {
    await page.setViewportSize({width,height:width===802 ? 668 : 900});
    await page.waitForFunction(() => {
      return !document.querySelector('#app-navigation[data-modal=true]');
    });
    columnPanel=await openColumn('Total');
    await columnPanel.getByRole('combobox',{name:'Condición',exact:true}).selectOption('between');
    await columnPanel.getByRole('textbox',{name:'Desde',exact:true}).fill('100');
    await columnPanel.getByRole('textbox',{name:'Hasta',exact:true}).fill('60000000');
    check(await columnPanel.evaluate((el) => {
      const r=el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.height<=400 && r.height<=innerHeight*0.6+1;
    }) && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Menú de columna y tabla contenidos en '+width+' px');
    const menuScroll=columnPanel.locator('.column-filter-content');
    await menuScroll.evaluate((el) => { el.scrollTop=el.scrollHeight; });
    check(await menuScroll.evaluate((el) => el.scrollHeight>el.clientHeight && el.scrollTop>0 && getComputedStyle(el).overflowY==='auto') &&
      await columnPanel.evaluate((el) => {
        const panel=el.getBoundingClientRect();
        const title=el.querySelector('.column-filter-title').getBoundingClientRect();
        const footer=el.querySelector('.column-filter-footer').getBoundingClientRect();
        return title.top>=panel.top && footer.bottom<=panel.bottom && footer.top>title.bottom;
      }), 'Menú de altura limitada con scroll interno y título y acciones visibles a '+width+' px');
    if (width === 375 || width === 1440) await page.screenshot({path:'tests/evidence/25-filtro-total-'+width+'.png',fullPage:false});
    await columnPanel.getByRole('button',{name:'Cancelar',exact:true}).click();
  }
  columnPanel=await openColumn('Orden / tipo');
  await columnPanel.getByRole('button',{name:'Quitar ordenamiento',exact:true}).click();
  check((await tableNumbers()).join('|') === initialNumbers.join('|'), 'Quitar ordenamiento recupera el orden inicial de la tabla');
  await page.goto(origin+'/ordenes/productos?estado=cerrada');
  await page.getByRole('heading',{name:'Órdenes de compra',exact:true}).waitFor();
  check((await tableNumbers()).sort().join('|') === 'OC 2750|OC 2804', 'Enlaces de estado anteriores siguen funcionando en el filtro de columna');
  await page.getByRole('button',{name:/^Limpiar filtros/}).click();
  await page.locator('.table-scroll').evaluate((el) => { el.scrollLeft=0; });
  await shot("01-ordenes-desktop");
  await page.getByRole('textbox',{name:'Buscar órdenes',exact:true}).fill('280');
  await page.getByRole('button',{name:'Crear nueva orden',exact:true}).waitFor();
  check(await page.getByRole('link',{name:'OC 2801',exact:true}).count()===1,'Crear desde búsqueda sin coincidencia exacta aunque existan coincidencias parciales');
  await page.getByRole('button',{name:'Crear nueva orden',exact:true}).click();
  check(await dialog().getByRole('textbox',{name:'Número de orden',exact:true}).inputValue()==='2805' && !await dialog().getByRole('textbox',{name:'Número de orden',exact:true}).isEditable(),'Crear desde búsqueda utiliza el consecutivo automático, no el número buscado');
  await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('textbox',{name:'Buscar órdenes',exact:true}).fill('2802');
  await page.getByRole('link',{name:'Abrir orden 2802',exact:true}).waitFor();
  check(await page.getByRole('link',{name:'Abrir orden 2802',exact:true}).count()===1,'Búsqueda encuentra orden existente en otra vista');
  await page.getByRole('textbox',{name:'Buscar órdenes',exact:true}).fill('');
  await page.locator('.page-heading').getByRole("button", { name: "Nueva orden", exact: true }).click();
  check(await dialog().getByText('Consecutivo automático: último número + 1.',{exact:true}).count()===0, 'Número automático sin texto auxiliar eliminado');
  check(await dialog().getByRole('spinbutton',{name:'Adicional recomendado de sticker (%)',exact:true}).count()===0, 'Porcentaje de sticker retirado del primer paso');
  await requiredDeliveryBlocked('producto');
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).fill('20/10/2026');
  await dialog().evaluate((element) => { element.scrollTop=0; });
  await shot('17-creacion-fechas-consecutivo');
  await dialog()
    .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
    .fill("1.5");
  await dialog()
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  await dialog().getByRole("alert").waitFor();
  check(
    await dialog()
      .getByRole("alert")
      .evaluate((n) => n === document.activeElement),
    "Resumen de errores recibe foco",
  );
  check(
    (await dialog()
      .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
      .getAttribute("aria-invalid")) === "true",
    "Error asociado al campo inválido",
  );
  await dialog()
    .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
    .fill("5000");
  await dialog()
    .getByRole("textbox", { name: "Precio unitario", exact: true })
    .fill("3100.50");
  check(await dialog().locator('output[aria-label="Total del producto 1"]').innerText()==='$ 15.502.500,00', 'Total del producto calculado con cantidad y precio exactos');
  check(await dialog().getByRole('textbox',{name:'Batch record estimado',exact:true}).count()===0,'Creación de producto no solicita batch record estimado');
  const deliveryField=dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true});
  await deliveryField.fill('2');
  check(await deliveryField.inputValue()==='2','La escritura parcial de una fecha no se borra');
  await deliveryField.pressSequentially('0');
  check(await deliveryField.inputValue()==='20/' && await deliveryField.evaluate((el) => el.selectionStart)===3, 'Dos dígitos de día agregan separador y avanzan al mes');
  await deliveryField.press('Backspace');
  check(await deliveryField.inputValue()==='2','Retroceso elimina el día sin quedar atrapado en el separador');
  await deliveryField.pressSequentially('010');
  check(await deliveryField.inputValue()==='20/10/' && await deliveryField.evaluate((el) => el.selectionStart)===6, 'Dos dígitos de mes agregan separador y avanzan al año');
  await deliveryField.pressSequentially('2026');
  check(await deliveryField.inputValue()==='20/10/2026','Fecha completa digitada sin escribir separadores');
  await deliveryField.evaluate((el) => el.setSelectionRange(3,5));
  await deliveryField.pressSequentially('11');
  check(await deliveryField.inputValue()==='20/11/2026','Reemplazar el mes conserva el día y el año');
  await deliveryField.evaluate((el) => el.setSelectionRange(0,2));
  await deliveryField.pressSequentially('25');
  check(await deliveryField.inputValue()==='25/11/2026','Reemplazar el día conserva el mes y el año');
  await deliveryField.fill('2026-10-20');
  check(await deliveryField.inputValue()==='20/10/2026','Pegado de fecha ISO conserva formato colombiano');
  await deliveryField.fill('31/02/2026');
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  check(await deliveryField.getAttribute('aria-invalid')==='true' && await dialog().getByRole('button',{name:'Revisar orden',exact:true}).isVisible(),'Una fecha inexistente muestra error y detiene la revisión');
  await deliveryField.fill('20/10/2026');
  await dialog().getByRole('button',{name:'Abrir calendario: Entrega solicitada',exact:true}).click();
  const calendar=page.getByRole('dialog',{name:'Calendario: Entrega solicitada',exact:true});
  await calendar.waitFor();
  await calendar.locator('.react-aria-CalendarCell').first().waitFor();
  check(await calendar.locator('.react-aria-CalendarCell').count()>=28,'Botón de fecha abre el calendario React Aria');
  await calendar.locator('.react-aria-CalendarCell').filter({hasText:/^20$/}).click();
  await calendar.waitFor({state:'hidden'});
  check(await deliveryField.inputValue()==='20/10/2026','Selección del calendario sincroniza el campo digitado');
  await dialog()
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  check(
    (await dialog()
      .getByRole("spinbutton", {
        name: "Cantidad de sticker · provisional",
        exact: true,
      })
      .inputValue()) === "11000",
    "Sugerencia de sticker sin exceso por coma flotante",
  );
  check(
    (await dialog()
      .getByRole("spinbutton", { name: "Cantidad de corrugado", exact: true })
      .inputValue()) === "214",
    "Corrugado redondeado hacia arriba",
  );
  check(await dialog().locator('.order-line-basis').innerText().then((s) => s.includes('5.000 unidades') && s.includes('24 unidades')), 'Revisión explica cantidad solicitada y capacidad del corrugado asignado');
  check(await dialog().getByRole('spinbutton',{name:'Adicional recomendado de sticker (%)',exact:true}).inputValue()==='10','Revisión propone porcentaje de sticker individual de 10 %');
  check(await dialog().locator('.order-form-line .field > small:not(.field-error)').count()===0,'Ayudas de cálculo retiradas del texto permanente');
  const corrugadoInput=dialog().getByRole('spinbutton',{name:'Cantidad de corrugado',exact:true});
  await helpFor(corrugadoInput).hover();
  const corrugadoTip=await tooltipFor(corrugadoInput);
  await corrugadoTip.waitFor({state:'visible'});
  check(await corrugadoTip.innerText().then((s) => s.includes('÷ capacidad') && s.includes('+ 5 adicionales')),'Hover del icono de ayuda de corrugado muestra su fórmula');
  await corrugadoTip.hover();
  check(await corrugadoTip.isVisible(),'El tooltip permanece abierto al mover el cursor sobre su contenido');
  await page.keyboard.press('Escape');
  await corrugadoTip.waitFor({state:'hidden'});
  check(await dialog().isVisible(),'Escape cierra la ayuda de hover sin cerrar la orden');
  await dismissHelp();
  const stickerInput=dialog().getByRole('spinbutton',{name:'Cantidad de sticker · provisional',exact:true});
  await helpFor(stickerInput).focus();
  const stickerTip=await tooltipFor(stickerInput);
  await stickerTip.waitFor({state:'visible'});
  check(await stickerTip.innerText().then((s) => s.includes('x 2') && s.includes('% adicional')) && await helpFor(stickerInput).evaluate((el) => el===document.activeElement),'Foco en el icono de ayuda muestra fórmula de sticker sin mover el foco');
  await helpFor(stickerInput).press('Escape');
  await stickerTip.waitFor({state:'hidden'});
  check(await dialog().isVisible() && await helpFor(stickerInput).evaluate((el) => el===document.activeElement),'Escape cierra ayuda de teclado y conserva el icono y formulario');
  const percentageInput=dialog().getByRole('spinbutton',{name:'Adicional recomendado de sticker (%)',exact:true});
  await helpFor(percentageInput).focus();
  const percentageTip=await tooltipFor(percentageInput);
  await percentageTip.waitFor({state:'visible'});
  check(await percentageTip.innerText().then((s) => s.includes('x 2') && s.includes('% adicional')),'Porcentaje compacto conserva la fórmula en su ayuda accesible');
  await dismissHelp();
  await dialog()
    .getByRole("spinbutton", { name: "Cantidad de corrugado", exact: true })
    .fill("220");
  await dialog()
    .getByRole("spinbutton", {
      name: "Cantidad de sticker · provisional",
      exact: true,
    })
    .fill("10999");
  await dismissHelp();
  await shot("02-revision-orden");
  const beforeProductEmission = await state();
  await dialog()
    .getByRole("button", { name: "Crear orden", exact: true })
    .click();
  await page
    .getByRole("heading", { name: /^Orden de compra /, level: 1 })
    .waitFor();
  const productId = page.url().split("/").pop();
  let db = await state();
  let line = db.orden_producto.find((r) => r.id_orden_compra === productId);
  check(
    line.cantidad_solicitada === 5000 &&
      line.precio_unitario === "3100.50" &&
      line.cantidad_sticker === 10999 &&
      line.cantidad_corrugado === 220,
    "Se guardan las condiciones finales editadas",
  );
  check(db.orden_compra.find((order) => order.id === productId).no_orden === '2805', 'La orden creada conserva el número mostrado');
  const initialProductLot = db.lote_producto.find((lot) => lot.id_orden_producto === line.id);
  check(db.lote_producto.filter((lot) => lot.id_orden_producto === line.id).length===1 &&
    initialProductLot.numero_lote===null && initialProductLot.cantidad_recibida===null &&
    initialProductLot.fecha_estimada_batch_record==='2026-10-20T12:00:00.000Z',
    'Crear la orden persiste un lote inicial con la estimación y sin recepción');
  check(!Object.hasOwn(line,'fecha_estimada_batch_record') &&
    await page.getByText('Fecha estimada de Batch record:',{exact:false}).count()===0,
    'El renglón de producto no guarda ni muestra una estimación de batch record');
  check(await page.getByRole('button',{name:'Completar lote del producto 1',exact:true}).isDisabled() &&
    await page.getByText('Sin número de lote',{exact:true}).isVisible(),
    'El lote inicial es visible pero su modificación exige autorización');
  check(JSON.stringify(materialState(db)) === JSON.stringify(materialState(beforeProductEmission)) &&
    JSON.stringify(db.abastecimiento_material) === JSON.stringify(beforeProductEmission.abastecimiento_material),
    "Emitir la OC conserva los materiales, vínculos y su consecutivo");
  check(
    await page
      .getByRole("button", { name: "Agregar lote", exact: true })
      .isDisabled(),
    "Recepción bloqueada antes de autorización",
  );
  await unauthorizedActionsBlocked('producto');
  await shot('29-seguimiento-sin-autorizacion');
  const beforeUnauthorized=await state();
  for (const estado of ['cerrada','anulada']) {
    const response=await apiCommand('setLineState',{entity:'orden_producto',id:line.id,estado,confirm:true});
    check(response.status()===422 && (await response.json()).code==='AUTHORIZATION',
      'El servicio rechaza '+estado+' de producto sin autorización');
  }
  check(JSON.stringify(await state())===JSON.stringify(beforeUnauthorized),
    'Rechazar seguimiento sin autorización conserva todos los datos');
  await authorize();

  await page
    .getByRole("button", { name: "Completar lote del producto 1", exact: true })
    .click();
  check(
    (await dialog()
      .getByRole("textbox", { name: "Batch record estimado", exact: true })
      .inputValue()) === "20/10/2026",
    "Batch estimado precargado desde la entrega de la cabecera",
  );
  await dialog()
    .getByRole("textbox", { name: "Número de lote", exact: true })
    .fill("CLI-LOTE-001");
  await dialog()
    .getByRole("spinbutton", { name: "Cantidad recibida", exact: true })
    .fill("5000");
  await dialog()
    .getByRole("textbox", { name: "Batch record recibido", exact: true })
    .fill("2026-10-13");
  await dialog()
    .getByRole("combobox", { name: "Estado de batch record", exact: true })
    .selectOption({ label: "Validado" });
  await dialog()
    .getByRole("textbox", { name: "Fecha de inspección", exact: true })
    .fill("2026-10-14");
  await dialog()
    .getByRole("combobox", { name: "Inspección", exact: true })
    .selectOption({ label: "Aprobada" });
  await dialog()
    .getByRole("textbox", { name: "Recepción", exact: true })
    .fill("2026-10-15");
  await dialog()
    .getByRole("textbox", { name: "Confirmación", exact: true })
    .fill("2026-10-15");
  await dialog()
    .getByRole("textbox", { name: "Ubicación de recepción", exact: true })
    .fill("Bodega de demostración");
  await dialog()
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption({ label: "Cerrado" });
  await dialog()
    .getByRole("textbox", { name: "Buscar número de factura", exact: true })
    .fill(" cli-0001 ");
  await dialog()
    .getByRole("button", { name: "Agregar factura", exact: true })
    .click();
  check(
    await dialog()
      .getByRole("combobox", { name: "Proveedor", exact: true })
      .isDisabled(),
    "Factura desde lote conserva el proveedor",
  );
  check(
    (await page.locator("form form").count()) === 0,
    "Los diálogos no anidan formularios HTML",
  );
  const ids = await page
    .locator("[role=dialog] [id]")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  check(
    new Set(ids).size === ids.length,
    "Identificadores de controles únicos en diálogos simultáneos",
  );
  const beforeDraftAttachment = await state();
  await dialog().getByRole('button', {name:'Adjuntar documento', exact:true}).click();
  await dialog().getByRole('heading', {name:'Agregar placeholder', exact:true}).waitFor();
  check(await page.locator('form form').count() === 0, 'Adjuntar documento a una factura conserva formularios separados');
  await dialog().getByRole('textbox', {name:'Nombre del archivo', exact:true}).fill('Factura-CLI-adjunta.html');
  await shot('52-factura-adjunto-placeholder');
  await dialog().getByRole('button', {name:'Guardar placeholder', exact:true}).click();
  await page.getByRole('heading', {name:'Agregar placeholder',exact:true}).waitFor({state:'hidden'});
  check(await dialog().getByRole('button', {name:'Reemplazar documento',exact:true}).isVisible() &&
    await dialog().getByText('Factura-CLI-adjunta.html',{exact:true}).isVisible(),
    'El placeholder queda preparado dentro del formulario de factura');
  const afterDraftAttachment = await state();
  check(JSON.stringify(afterDraftAttachment) === JSON.stringify(beforeDraftAttachment),
    'Preparar un adjunto conserva el estado hasta guardar la factura');
  await dialog()
    .getByRole("button", { name: "Guardar factura", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Agregar factura", exact: true })
    .waitFor({ state: "hidden" });
  check(
    (await dialog()
      .getByRole("combobox", {
        name: "Seleccionar factura del proveedor",
        exact: true,
      })
      .inputValue()) !== "",
    "Factura recién creada seleccionada",
  );
  await shot("03-lote-factura");
  await dialog()
    .getByRole("button", { name: "Guardar lote", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  db = await state();
  const lot = db.lote_producto.find((r) => r.numero_lote === "CLI-LOTE-001");
  check(lot.id===initialProductLot.id && db.lote_producto.filter((row) => row.id_orden_producto===lot.id_orden_producto).length===1,
    'Completar el lote inicial conserva su identidad y evita un lote duplicado');
  line = db.orden_producto.find((r) => r.id === lot.id_orden_producto);
  check(
    db.factura.find((r) => r.id === lot.id_factura).numero_factura ===
      "CLI-0001",
    "Factura normalizada y asociada al guardar el lote",
  );
  check(
    line.estado === "en_seguimiento" &&
      lot.estado === "cerrado" &&
      lot.estado_batch_record === "validado" &&
      lot.estado_inspeccion === "aprobada",
    "Estados independientes y ausencia de cierre automático",
  );
  await shot("04-seguimiento");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Reabrir", exact: true }).waitFor();
  check(
    (await state()).orden_producto.find((r) => r.id === line.id).estado ===
      "cerrada",
    "Cierre del producto mediante acción manual",
  );

  await page.getByRole("button", { name: "Correo", exact: true }).click();
  await dialog()
    .getByText("Completa los documentos antes de simular el envío.", {
      exact: true,
    })
    .waitFor();
  const mailCount = (await state()).correo_enviado.length;
  await dialog()
    .getByRole("button", { name: "Simular envío", exact: true })
    .click();
  await dialog().getByRole("alert").waitFor();
  check(
    (await state()).correo_enviado.length === mailCount,
    "Documento faltante impide registrar el correo",
  );
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await dialog()
    .getByRole("textbox", { name: "Nombre del archivo", exact: true })
    .fill("orden-cli-firmada.html");
  await dialog()
    .getByRole("button", { name: "Guardar placeholder", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Correo", exact: true }).click();
  await dialog()
    .getByRole("link", { name: "orden-cli-firmada.html", exact: true })
    .waitFor();
  await shot("05-correo-simulado");
  await dialog()
    .getByRole("button", { name: "Simular envío", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  db = await state();
  check(
    db.correo_enviado.length === mailCount + 1 &&
      db.correo_enviado_destinatario.some(
        (r) => r.id_correo === db.correo_enviado.at(-1).id_correo,
      ),
    "Mensaje y destinatarios guardados después de confirmación simulada",
  );
  check(
    db.correo_enviado.every(
      (r) =>
        Object.keys(r).sort().join(",") ===
        "fecha_envio,id_correo,remitente,tipo_evento",
    ),
    "Historial de correo sin cuerpo ni adjuntos",
  );

  await nav("Facturas");
  const invoiceRows = () => page.locator('.invoice-table tbody tr').filter({has: page.locator('td:first-child a')});
  await page.getByRole('link',{name:'AUR-00128',exact:true}).click();
  await page.getByRole('button',{name:/^Asignar (lotes|recepciones)$/}).click();
  const assignedOptions=()=>dialog().locator('.check-list label').filter({hasText:'Factura actual: AUR-00128'});
  const selectedAtOpen=await assignedOptions().count();
  check(selectedAtOpen>0 && await assignedOptions().locator('input').evaluateAll(inputs=>inputs.every(input=>input.checked)),
    'La factura existente abre con todos sus lotes y recepciones asociados marcados');
  check(await dialog().getAttribute('data-dirty')!=='true',
    'La selección precargada no marca el formulario como modificado');
  await dialog().getByRole('textbox',{name:'Buscar orden o lote para la factura',exact:true}).fill('PRO-26-018');
  await dialog().getByRole('textbox',{name:'Buscar orden o lote para la factura',exact:true}).fill('');
  check(await assignedOptions().count()===selectedAtOpen && await assignedOptions().locator('input').evaluateAll(inputs=>inputs.every(input=>input.checked)),
    'Buscar y limpiar la búsqueda conserva las casillas ya marcadas');
  await shot('50-factura-lotes-precargados');
  await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/^Asignar (lotes|recepciones)$/}).click();
  check(await assignedOptions().locator('input').evaluateAll(inputs=>inputs.every(input=>input.checked)),
    'Reabrir la asignación recupera los lotes asociados');
  await dialog().getByRole('button',{name:'Guardar asociaciones',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/^Asignar (lotes|recepciones)$/}).click();
  check(await assignedOptions().count()===selectedAtOpen && await assignedOptions().locator('input').evaluateAll(inputs=>inputs.every(input=>input.checked)),
    'Guardar la selección precargada conserva las asociaciones de la factura');
  const beforeUnassignInvoice=await state();
  const targetInvoice=beforeUnassignInvoice.factura.find(row=>row.numero_factura==='AUR-00128');
  const unassignedLot=beforeUnassignInvoice.lote_producto.find(row=>row.id_factura===targetInvoice.id);
  await dialog().locator('input[value="'+unassignedLot.id+'"]').uncheck();
  await dialog().getByRole('textbox',{name:'Buscar orden o lote para la factura',exact:true}).fill('PRO-26-021');
  await dialog().getByRole('button',{name:'Guardar asociaciones',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const afterUnassignInvoice=await state();
  check(afterUnassignInvoice.lote_producto.find(row=>row.id===unassignedLot.id).id_factura===null &&
    JSON.stringify(afterUnassignInvoice.lote_producto)===JSON.stringify(beforeUnassignInvoice.lote_producto.map(row=>row.id===unassignedLot.id ? {...row,id_factura:null}:row)),
    'Desmarcar un lote y guardar desde Facturas retira únicamente su factura aunque quede oculto por la búsqueda');
  check(JSON.stringify(afterUnassignInvoice.factura)===JSON.stringify(beforeUnassignInvoice.factura) &&
    JSON.stringify(afterUnassignInvoice.documento)===JSON.stringify(beforeUnassignInvoice.documento),
    'Desasignar conserva la factura y sus documentos');
  await page.reload();
  await page.getByRole('button',{name:/^Asignar (lotes|recepciones)$/}).click();
  check(!await dialog().locator('input[value="'+unassignedLot.id+'"]').isChecked(),
    'La desasignación de factura persiste al recargar');
  await shot('53-factura-desasignacion');
  await dialog().locator('input[value="'+unassignedLot.id+'"]').check();
  await dialog().getByRole('button',{name:'Guardar asociaciones',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/^Asignar (lotes|recepciones)$/}).click();
  await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await nav('Facturas');
  const invoiceMenu = async (name) => {
    const label = (name === 'Documentos' ? 'Filtrar ' : 'Filtrar y ordenar ') + name;
    await page.getByRole('button', {name: label, exact: true}).click();
    const menu = page.getByRole('dialog', {name: label, exact: true});
    await menu.waitFor();
    return menu;
  };
  const clearInvoiceFilters = async () => {
    const clear = page.getByRole('button', {name: /^Limpiar filtros/});
    if (await clear.count()) await clear.click();
  };
  const invoiceSearch = page.getByRole('searchbox', {name: 'Buscar facturas', exact: true});
  check(await invoiceSearch.isVisible() &&
    await page.getByRole('checkbox', {name: 'Solo sin lotes o recepciones', exact: true}).count() === 0,
    'Facturas combina la búsqueda general con los filtros de columna');
  check(await page.locator('.invoice-table thead .column-filter-button').count() === 5,
    'Cada columna de datos de Facturas dispone de filtro');
  const unfilteredInvoiceCount = await invoiceRows().count();
  for (const [query, number] of [['\u200B cli-0001 \u200B','CLI-0001'],['pro-26-018','AUR-00128'],['ocm 1601','ENV-00412']]) {
    await invoiceSearch.fill(query);
    check(await invoiceRows().count()===1 && await invoiceRows().locator('td:first-child a').textContent()===number,
      'Búsqueda de facturas por '+query+' recupera su factura');
    check(await invoiceSearch.evaluate(el=>el===document.activeElement), 'La búsqueda de facturas conserva el foco al escribir');
  }
  await invoiceSearch.fill('Crema corporal');
  check(await invoiceRows().count()>0 && await page.getByRole('link',{name:'AUR-00128',exact:true}).isVisible(),
    'Facturas encuentra el producto de sus lotes asociados');
  await invoiceSearch.fill('Aurora');
  check(await invoiceRows().count()>0 && (await invoiceRows().locator('td:nth-child(2)').allTextContents()).every(value=>value==='Aurora'),
    'Facturas busca por proveedor');
  const combinedInvoiceFilter=await invoiceMenu('Recepciones');
  await combinedInvoiceFilter.getByRole('combobox',{name:'Condición',exact:true}).selectOption('greater');
  await combinedInvoiceFilter.getByRole('textbox',{name:'Valor del filtro',exact:true}).fill('0');
  await combinedInvoiceFilter.getByRole('button',{name:'Aplicar',exact:true}).click();
  check(await invoiceRows().count()>0 && (await invoiceRows().locator('td:nth-child(4)').allTextContents()).every(value=>Number(value)>0),
    'La búsqueda de facturas se combina con una condición numérica');
  await (await invoiceMenu('Número de factura')).getByRole('button',{name:'De Z a A',exact:true}).click();
  const invoiceSearchUrl=page.url(), invoiceSearchCount=await invoiceRows().count();
  await page.reload();
  await page.locator('.invoice-table').waitFor();
  check(page.url()===invoiceSearchUrl && await invoiceSearch.inputValue()==='Aurora' && await invoiceRows().count()===invoiceSearchCount &&
    await page.getByRole('columnheader',{name:/Número de factura/}).getAttribute('aria-sort')==='descending',
    'La URL recupera búsqueda, filtros y ordenamiento de facturas');
  await clearInvoiceFilters();
  check(await invoiceSearch.inputValue()==='Aurora' && new URL(page.url()).searchParams.has('ordenar'),
    'Limpiar filtros de factura conserva la búsqueda y el ordenamiento');
  for (const width of [375,1440]) {
    await page.setViewportSize({width,height:900});
    const bounds=await invoiceSearch.boundingBox();
    check(bounds.x>=0 && bounds.x+bounds.width<=width && await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),
      'Barra de búsqueda de facturas contenida a '+width+' px');
    await shot('54-facturas-busqueda-'+width);
  }
  await page.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();
  check(!new URL(page.url()).searchParams.has('q') && new URL(page.url()).searchParams.has('ordenar') && await invoiceRows().count()===unfilteredInvoiceCount,
    'Limpiar búsqueda de factura conserva el ordenamiento y recupera los resultados');
  await (await invoiceMenu('Número de factura')).getByRole('button',{name:'Quitar ordenamiento',exact:true}).click();
  await invoiceSearch.fill('FACTURA-INEXISTENTE-BUSQUEDA');
  check(await invoiceRows().count()===0 && await invoiceSearch.isVisible() && await page.locator('.invoice-table thead .column-filter-button').count()===5,
    'La búsqueda de facturas sin coincidencias conserva la barra y los menús');
  await page.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();
  let invoiceFilter = await invoiceMenu('Número de factura');
  await invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}).selectOption('contains');
  await invoiceFilter.getByRole('textbox', {name: 'Valor del filtro', exact: true}).fill("\u200B cli-0001 \u200B");
  await invoiceFilter.getByRole('button', {name: 'Aplicar', exact: true}).click();
  await page.getByRole("link", { name: "CLI-0001", exact: true }).waitFor();
  check(
    (await page
      .getByRole("link", { name: "CLI-0001", exact: true })
      .count()) === 1,
    "Filtro de número de factura normaliza espacios externos e invisibles",
  );
  check(await invoiceRows().count() === 1, 'La condición de número filtra el listado de facturas');
  const invoiceFilteredUrl = page.url();
  await page.reload();
  await page.getByRole('link', {name: 'CLI-0001', exact: true}).waitFor();
  check(page.url() === invoiceFilteredUrl && await invoiceRows().count() === 1,
    'Facturas recupera los filtros al recargar la URL');
  await shot("06-facturas");
  await clearInvoiceFilters();
  const invoiceCount = await invoiceRows().count();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({width, height: 668});
    invoiceFilter = await invoiceMenu('Número de factura');
    const bounds = await invoiceFilter.boundingBox();
    const scroll = await invoiceFilter.locator('.column-filter-content').evaluate((el) => ({height: el.clientHeight, total: el.scrollHeight}));
    check(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 668 && bounds.height <= 400.8,
      'Menú de factura limitado a la ventana a '+width+' px');
    check(scroll.total > scroll.height && await invoiceFilter.locator('.column-filter-footer').isVisible(),
      'Menú de factura desplaza el contenido y conserva sus acciones a '+width+' px');
    await shot('46-facturas-filtros-'+width);
    await page.keyboard.press('Escape');
    check(await page.getByRole('button', {name: 'Filtrar y ordenar Número de factura', exact: true}).evaluate((el) => el === document.activeElement),
      'Escape devuelve el foco a la columna de factura a '+width+' px');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'Facturas mantiene el desplazamiento horizontal dentro de su tabla a '+width+' px');
  }
  invoiceFilter = await invoiceMenu('Número de factura');
  await invoiceFilter.getByRole('button', {name: 'De Z a A', exact: true}).click();
  check(await page.getByRole('columnheader', {name: /Número de factura/}).getAttribute('aria-sort') === 'descending',
    'Facturas identifica el orden descendente de texto en su cabecera');
  invoiceFilter = await invoiceMenu('Número de factura');
  await invoiceFilter.getByRole('button', {name: 'Quitar ordenamiento', exact: true}).click();
  check(!new URL(page.url()).searchParams.has('ordenar'), 'Facturas permite quitar el ordenamiento desde el menú de columna');
  invoiceFilter = await invoiceMenu('Recepciones');
  check((await optionsFor(invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}))).includes('Es mayor que') &&
    !(await optionsFor(invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}))).includes('Contiene'),
    'Recepciones ofrece condiciones numéricas');
  await invoiceFilter.getByRole('button', {name: 'De menor a mayor', exact: true}).click();
  const receptionCounts = (await invoiceRows().locator('td:nth-child(4)').allTextContents()).map(Number);
  check(receptionCounts.every((value, index) => index === 0 || value >= receptionCounts[index - 1]),
    'Recepciones se ordena por su cantidad numérica');
  invoiceFilter = await invoiceMenu('Recepciones');
  await invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}).selectOption('equals');
  await invoiceFilter.getByRole('textbox', {name: 'Valor del filtro', exact: true}).fill('0');
  await invoiceFilter.getByRole('button', {name: 'Aplicar', exact: true}).click();
  await page.getByRole("link", { name: "AND-00001", exact: true }).waitFor();
  check(
    (await page
      .getByRole("link", { name: "CLI-0001", exact: true })
      .count()) === 0,
    "Facturas sin recepciones se consulta mediante el valor cero de su columna",
  );
  invoiceFilter = await invoiceMenu('Proveedor');
  check((await optionsFor(invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}))).includes('Comienza con'),
    'Proveedor ofrece condiciones de texto');
  await invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}).selectOption('contains');
  await invoiceFilter.getByRole('textbox', {name: 'Valor del filtro', exact: true}).fill('Andina');
  await invoiceFilter.getByRole('button', {name: 'Aplicar', exact: true}).click();
  check(await invoiceRows().count() > 0 && (await invoiceRows().locator('td:nth-child(2)').allTextContents()).every((value) => value === 'Andina') &&
    (await invoiceRows().locator('td:nth-child(4)').allTextContents()).every((value) => value === '0'),
    'Proveedor y cantidad de recepciones se filtran conjuntamente');
  await clearInvoiceFilters();
  invoiceFilter = await invoiceMenu('Registro');
  check((await optionsFor(invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}))).includes('Es anterior a'),
    'Registro ofrece condiciones de fecha');
  await invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}).selectOption('between');
  await invoiceFilter.getByRole('textbox', {name: 'Desde', exact: true}).fill('02/10/2026');
  await invoiceFilter.getByRole('textbox', {name: 'Hasta', exact: true}).fill('01/10/2026');
  await invoiceFilter.getByRole('button', {name: 'Aplicar', exact: true}).click();
  await invoiceFilter.getByRole('alert').waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'alert');
  check(await invoiceFilter.getByRole('alert').evaluate((element) => element === document.activeElement), 'Un rango de fechas invertido mantiene el menú abierto y enfoca su error');
  await invoiceFilter.getByRole('textbox', {name: 'Desde', exact: true}).fill('01/10/2026');
  await invoiceFilter.getByRole('button', {name: 'Aplicar', exact: true}).click();
  check(await page.getByRole('link', {name: 'AUR-00128', exact: true}).count() === 1 && await page.getByRole('link', {name: 'CLI-0001', exact: true}).count() === 0,
    'El intervalo de Registro filtra por el día mostrado en la tabla');
  invoiceFilter = await invoiceMenu('Registro');
  await invoiceFilter.getByRole('button', {name: 'De más antigua a más reciente', exact: true}).click();
  check(await page.getByRole('columnheader', {name: /Registro/}).getAttribute('aria-sort') === 'ascending',
    'Registro permite ordenar fechas desde su menú');
  await clearInvoiceFilters();
  invoiceFilter = await invoiceMenu('Documentos');
  check((await invoiceFilter.getByRole('checkbox').allTextContents()).length === 2 &&
    await invoiceFilter.getByRole('checkbox', {name: 'Con documento', exact: true}).count() === 1 &&
    await invoiceFilter.getByRole('checkbox', {name: 'Sin documento', exact: true}).count() === 1 &&
    await invoiceFilter.getByRole('combobox').count() === 0 &&
    await invoiceFilter.getByRole('searchbox').count() === 0 &&
    await invoiceFilter.locator('.column-sort-actions').count() === 0,
    'Documentos solo ofrece Con documento y Sin documento, sin búsqueda, condición ni ordenamiento');
  await invoiceFilter.locator('.column-value-option').filter({hasText: 'Sin documento'}).locator('span').last().click();
  check(await invoiceFilter.isVisible() && !await invoiceFilter.getByRole('checkbox', {name: 'Sin documento', exact: true}).isChecked() &&
    await invoiceFilter.getByRole('checkbox', {name: 'Con documento', exact: true}).isChecked(),
    'Hacer clic sobre el texto del valor alterna su checkbox sin cerrar el menú');
  await shot('47-facturas-documentos');
  await invoiceFilter.getByRole('button', {name: 'Aplicar', exact: true}).click();
  check(await invoiceRows().count() > 0 && (await invoiceRows().locator('td:nth-child(5) a').allTextContents()).every((value) => value === '1 archivo'),
    'Con documento muestra las facturas con archivo propio');
  invoiceFilter = await invoiceMenu('Documentos');
  await invoiceFilter.getByRole('checkbox', {name: 'Sin documento', exact: true}).check();
  await invoiceFilter.getByRole('checkbox', {name: 'Con documento', exact: true}).uncheck();
  await invoiceFilter.getByRole('button', {name: 'Aplicar', exact: true}).click();
  check(await invoiceRows().count() > 0 && (await invoiceRows().locator('td:nth-child(5) a').allTextContents()).every((value) => value === 'Sin archivo'),
    'Sin documento muestra las facturas pendientes de archivo');
  await clearInvoiceFilters();
  invoiceFilter = await invoiceMenu('Número de factura');
  await invoiceFilter.getByRole('combobox', {name: 'Condición', exact: true}).selectOption('equals');
  await invoiceFilter.getByRole('textbox', {name: 'Valor del filtro', exact: true}).fill('FACTURA-INEXISTENTE-PRUEBA');
  await invoiceFilter.getByRole('button', {name: 'Aplicar', exact: true}).click();
  check(await page.getByRole('heading', {name: 'No hay facturas coincidentes', exact: true}).isVisible() &&
    await page.locator('.invoice-table thead .column-filter-button').count() === 5,
    'El estado vacío conserva los filtros de todas las columnas');
  invoiceFilter = await invoiceMenu('Número de factura');
  await invoiceFilter.getByRole('button', {name: 'Quitar filtro', exact: true}).click();
  check(await invoiceRows().count() === invoiceCount, 'Quitar el filtro recupera todas las facturas');
  await shot('48-facturas-listado');

  await nav("Abastecimiento");
  const supplyRows=() => page.locator('.supply-table tbody tr').filter({has:page.locator('td:first-child a')});
  const supplyMenu=async name=>{
    const label='Filtrar y ordenar '+name;
    await page.getByRole('button',{name:label,exact:true}).click();
    const menu=page.getByRole('dialog',{name:label,exact:true});
    await menu.waitFor();
    return menu;
  };
  const clearSupply=async()=>{
    const button=page.getByRole('button',{name:/^Limpiar filtros/});
    if(await button.count()) await button.click();
  };
  const supplyCondition=async(name,operator,value)=>{
    const menu=await supplyMenu(name);
    await menu.getByRole('combobox',{name:'Condición',exact:true}).selectOption(operator);
    await menu.getByRole('textbox',{name:'Valor del filtro',exact:true}).fill(value);
    await menu.getByRole('button',{name:'Aplicar',exact:true}).click();
  };
  const supplySearch=page.getByRole('searchbox',{name:'Buscar órdenes de producto o material',exact:true});
  check(await supplySearch.isVisible() &&
    await page.locator('.supply-table thead .column-filter-button').count()===5,
    'Vínculos combina búsqueda de órdenes y filtros de sus cinco columnas');
  const allSupplyRows=await supplyRows().count();
  check(allSupplyRows>0 && await supplyRows().locator('td:first-child a').allTextContents().then((labels) => labels.every((label) => /^OC \d+$/.test(label.trim()))) &&
    await supplyRows().locator('td:nth-child(3) a').allTextContents().then((labels) => labels.every((label) => /^OCM \d+$/.test(label.trim()))),
    'Abastecimiento distingue OC de producto y OCM de material');
  for (const [query,expected] of [['2801',3],['OC 2801',3],['OC2802',1],['1601',2],['ocm1601',2],['  OCM   1602  ',1],['OCM',allSupplyRows],['OC 1601',0]]) {
    await supplySearch.fill(query);
    check(await supplyRows().count()===expected, 'La búsqueda de vínculos por '+query+' distingue el grupo de órdenes');
    check(await supplySearch.evaluate(el=>el===document.activeElement), 'La búsqueda de vínculos conserva el foco al escribir');
  }
  check(await supplySearch.isVisible() && await page.locator('.supply-table thead .column-filter-button').count()===5,
    'La búsqueda de vínculos sin coincidencias conserva barra y cabeceras');
  await supplySearch.fill('OC 2801');
  await supplyCondition('Orden de material','equals','1601');
  check(await supplyRows().count()===2,'La búsqueda de OC se combina con el filtro de OCM en el mismo vínculo');
  await (await supplyMenu('Orden de material')).getByRole('button',{name:'De mayor a menor',exact:true}).click();
  const supplySearchUrl=page.url();
  await page.reload();
  await page.locator('.supply-table').waitFor();
  check(page.url()===supplySearchUrl && await supplySearch.inputValue()==='OC 2801' && await supplyRows().count()===2 &&
    await page.getByRole('columnheader',{name:/Orden de material/}).getAttribute('aria-sort')==='descending',
    'La URL recupera búsqueda, filtros y ordenamiento de vínculos');
  await page.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();
  check(new URL(page.url()).searchParams.has('filtros') && new URL(page.url()).searchParams.has('ordenar') && await supplyRows().count()===2,
    'Limpiar búsqueda de vínculos conserva filtros y ordenamiento');
  await supplySearch.fill('OC 2801');
  await clearSupply();
  check(await supplySearch.inputValue()==='OC 2801' && await supplyRows().count()===3 && new URL(page.url()).searchParams.has('ordenar'),
    'Limpiar filtros de vínculos conserva búsqueda y ordenamiento');
  for (const width of [375,1440]) {
    await page.setViewportSize({width,height:900});
    const bounds=await supplySearch.boundingBox();
    check(bounds.x>=0 && bounds.x+bounds.width<=width && await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),
      'Barra de búsqueda de vínculos contenida a '+width+' px');
    await shot('55-vinculos-busqueda-'+width);
  }
  await page.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();
  await (await supplyMenu('Orden de material')).getByRole('button',{name:'Quitar ordenamiento',exact:true}).click();
  for (const [column,value,expected] of [['Orden de producto','2801',3],['Orden de producto','2802',1],['Orden de material','1601',2],['Orden de material','1602',1]]) {
    await supplyCondition(column,'equals',value);
    check(await supplyRows().count()===expected,'Filtro '+column+' por '+value+' conserva sus vínculos');
    await clearSupply();
  }
  await supplyCondition('Orden de producto','equals','2801');
  await supplyCondition('Orden de material','equals','1601');
  check(await supplyRows().count()===2, 'Los filtros de OC y OCM se combinan sobre el mismo vínculo');
  const supplyFilteredUrl=page.url();
  await page.reload();
  await page.locator('.supply-table').waitFor();
  check(page.url()===supplyFilteredUrl && await supplyRows().count()===2, 'La URL de abastecimiento recupera las columnas filtradas');
  await clearSupply();
  await supplyCondition('Producto / maquilador','contains','Aurora');
  check(await supplyRows().count()>0 && (await supplyRows().locator('td:nth-child(2)').allTextContents()).every(value=>value.includes('Aurora')),
    'Producto / maquilador admite condiciones de texto sobre el maquilador');
  await supplyCondition('Material / proveedor','contains','Envases');
  check(await supplyRows().count()>0 && (await supplyRows().locator('td:nth-child(4)').allTextContents()).every(value=>value.includes('Envases')),
    'Material / proveedor admite condiciones de texto combinadas');
  await clearSupply();
  let supplyFilter=await supplyMenu('Estado del material');
  const stateOperators=await optionsFor(supplyFilter.getByRole('combobox',{name:'Condición',exact:true}));
  check(stateOperators.includes('Es igual a') && !stateOperators.includes('Contiene'), 'Estado del material usa valores de su enumeración');
  await page.keyboard.press('Escape');
  supplyFilter=await supplyMenu('Orden de material');
  await supplyFilter.getByRole('button',{name:'De mayor a menor',exact:true}).click();
  const materialNumbers=(await supplyRows().locator('td:nth-child(3) a').allTextContents()).map(value=>Number(value.replace('OCM ','')));
  check(materialNumbers.every((value,index)=>index===0 || value<=materialNumbers[index-1]), 'Vínculos ordena las OCM numéricamente');
  for (const width of [375,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    check(await page.locator('.panel:has(.supply-table) .table-footer [role=status]').isVisible(),
      'El contador de vínculos permanece visible a '+width+' px');
    supplyFilter=await supplyMenu('Orden de producto');
    const bounds=await supplyFilter.boundingBox();
    check(bounds.x>=0 && bounds.x+bounds.width<=width && bounds.height<=400.8 &&
      await page.evaluate(() => document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),
      'Menú y tabla de abastecimiento contenidos a '+width+' px');
    if (width===375 || width===1440) await shot('51-abastecimiento-columnas-'+width);
    await page.keyboard.press('Escape');
    check(await page.getByRole('button',{name:'Filtrar y ordenar Orden de producto',exact:true}).evaluate(el=>el===document.activeElement),
      'Escape devuelve el foco a la columna de abastecimiento a '+width+' px');
  }
  await supplyCondition('Orden de producto','equals','999999');
  check(await supplyRows().count()===0 && await page.getByRole('heading',{name:'Sin vínculos coincidentes',exact:true}).isVisible() &&
    await page.locator('.supply-table thead .column-filter-button').count()===5,
    'El estado vacío de abastecimiento conserva los filtros de columna');
  await clearSupply();
  check(await supplyRows().count()===allSupplyRows, 'Limpiar filtros recupera todos los vínculos');
  await shot("07-vinculos-ordenes");
  await page.goto(origin + "/ordenes/" + initial.orden_compra.find((order) => order.no_orden === "2801").id);
  check(await page.locator('.related-link strong').allTextContents().then((labels) => labels.length > 0 && labels.every((label) => /^OCM \d+$/.test(label.trim()))),
    "Órdenes de material vinculadas desde el producto muestran OCM");
  const materialId = initial.orden_compra.find((order) => order.tipo_orden === "material" && order.no_orden === "1602").id;
  await page.goto(origin + "/ordenes/" + materialId);
  await page.getByRole("heading", { name: /^Orden de compra /, level: 1 }).waitFor();
  check(await page.locator('.related-link strong').allTextContents().then((labels) => labels.length > 0 && labels.every((label) => /^OC \d+$/.test(label.trim()))),
    "Desde una OCM las órdenes de producto vinculadas mantienen OC");
  db = await state();
  const materialLine = db.orden_material.find((row) => row.id_orden_compra === materialId);
  check(JSON.stringify(db.orden_material) === JSON.stringify(initial.orden_material),
    "Consultar vínculos conserva íntegramente los renglones de material");
  await authorize();
  await page
    .getByRole("button", { name: "Registrar / editar", exact: true })
    .click();
  await dialog()
    .getByRole("spinbutton", {
      name: "Cantidad recibida (facturada)",
      exact: true,
    })
    .fill(String(materialLine.cantidad_solicitada));
  await dialog()
    .getByRole("textbox", { name: "Ubicación de recepción", exact: true })
    .fill("Bodega de materiales");
  await dialog()
    .getByRole("textbox", { name: "Entrega recibida", exact: true })
    .fill("2026-10-25");
  await dialog()
    .getByRole("combobox", {
      name: "Identidad del lote de material",
      exact: true,
    })
    .selectOption({ label: "MAT-26-041" });
  await dialog()
    .getByRole("combobox", {
      name: "Seleccionar factura del proveedor",
      exact: true,
    })
    .selectOption({ label: "ENV-00412" });
  await dialog()
    .getByRole("button", { name: "Guardar recepción", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  db = await state();
  check(
    db.orden_material.find((r) => r.id === materialLine.id).estado ===
      "en_seguimiento",
    "Recepción de material no cierra el material de la orden",
  );
  const otherMaterialOrder = initial.orden_compra.find((order) => order.tipo_orden === "material" && order.no_orden === "1603");
  const otherMaterialLine = initial.orden_material.find((row) => row.id_orden_compra === otherMaterialOrder.id);
  check((await apiCommand("authorizeOrder", { id: otherMaterialOrder.id, confirm: true })).ok(),
    "Autorizar una segunda OCM habilita su recepción independiente");
  check((await apiCommand("saveReceipt", {
    entity: "orden_material", id: otherMaterialLine.id,
    row: {
      cantidad_recibida: otherMaterialLine.cantidad_solicitada,
      fecha_entrega: "2026-10-25T12:00:00.000Z",
      ubicacion: "Bodega de materiales",
      id_lote_material: initial.lote_material.find((lot) => lot.numero_lote === "MAT-26-041").id,
      id_factura: initial.factura.find((invoice) => invoice.numero_factura === "ENV-00412").id,
    },
  })).ok(), "Dos OCM conservan sus recepciones y comparten identidad de lote y certificados");
  await page.reload();
  await page.getByRole("heading", { name: /^Orden de compra /, level: 1 }).waitFor();
  db = await state();
  await shot("08-recepcion-material");
  const card = page
    .locator(".doc-item")
    .filter({ hasText: "Calidad-MAT-26-041.html" });
  const contentLink=await card.getByRole("link",{name:"Ver",exact:true}).getAttribute("href");
  const content=await page.request.get(new URL(contentLink,origin).href);
  check(
    content.ok()&&/placeholder/i.test(await content.text()),
    "Previsualización de documento claramente ficticio",
  );
  const downloadLink=await card.getByRole("link",{name:"Descargar",exact:true}).getAttribute("href");
  const download=await page.request.get(new URL(downloadLink,origin).href);
  check(
    download.ok()&&download.headers()['content-disposition'].includes('Calidad-MAT-26-041.html'),
    "Descarga con nombre de documento",
  );
  const qualityBefore = db.documento.find(
    (r) => r.nombre_archivo === "Calidad-MAT-26-041.html",
  );
  await card.getByRole("button", { name: "Reemplazar", exact: true }).click();
  await dialog()
    .getByRole("textbox", { name: "Nombre del archivo", exact: true })
    .fill("Calidad-MAT-26-041-actualizada.html");
  await dialog()
    .getByRole("button", { name: "Reemplazar placeholder", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  db = await state();
  check(
    db.documento.find((r) => r.id === qualityBefore.id).nombre_archivo ===
      "Calidad-MAT-26-041-actualizada.html" &&
      db.documento.length === initial.documento.length + 2,
    "Reemplazo conserva registro sin versiones",
  );
  await page
    .getByRole("button", { name: "Enviar liberación", exact: true })
    .click();
  await dialog()
    .getByRole("link", { name: "Liberacion-MAT-26-041.html", exact: true })
    .waitFor();
  const release = await dialog()
    .getByRole("textbox", { name: "Contenido del correo", exact: true })
    .inputValue();
  check(
    release.includes("Laboratorios Aurora") &&
      release.includes("Laboratorios Andina") &&
      release.includes("Dirección:"),
    "Liberación comunica materiales y destinos de ambos maquiladores",
  );
  await shot("10-liberacion-destinos");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();

  await nav("Órdenes de compra");
  await page.locator('.page-heading').getByRole("button", { name: "Nueva orden", exact: true }).click();
  await dialog()
    .getByRole("combobox", { name: "Tipo de orden", exact: true })
    .selectOption({ label: "Otros" });
  await dialog()
    .getByRole("combobox", { name: "Producto o concepto", exact: true })
    .fill("Servicio de demostración CLI");
  await page.keyboard.press('Tab');
  await dialog()
    .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
    .fill("2");
  await dialog()
    .getByRole("textbox", { name: "Precio unitario", exact: true })
    .fill("40000.00");
  await requiredDeliveryBlocked('otros');
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).pressSequentially('23102026');
  await dialog()
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  check(await dialog().locator('.dialog-heading p').innerText().then((text) => text.includes('Revisión de OCM ')),
    'La revisión de una orden de otros muestra OCM');
  await dialog()
    .getByRole("button", { name: "Crear orden", exact: true })
    .click();
  await page
    .getByRole("heading", { name: /^Orden de compra /, level: 1 })
    .waitFor();
  const otherId = page.url().split("/").pop();
  check((await state()).orden_otro.find((r) => r.id_orden_compra === otherId).fecha_estimada_entrega==='2026-10-23T12:00:00.000Z','Otro creado hereda entrega de la cabecera');
  await unauthorizedActionsBlocked('otros');
  await authorize();
  await page
    .getByRole("button", { name: "Registrar / editar", exact: true })
    .click();
  await dialog()
    .getByRole("spinbutton", {
      name: "Cantidad recibida (facturada)",
      exact: true,
    })
    .fill("2");
  await dialog()
    .getByRole("textbox", { name: "Ubicación de recepción", exact: true })
    .fill("Oficina");
  await dialog()
    .getByRole("button", { name: "Guardar recepción", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(
    (await state()).orden_otro.find((r) => r.id_orden_compra === otherId)
      .cantidad_recibida === 2,
    "Orden de otros con concepto libre y una recepción",
  );
  await shot("11-orden-otros");

  await nav("Configuración");
  check(await page.getByRole('tab',{name:'Consecutivos y pendientes',exact:true}).count()===0,'Consecutivos retirados de Configuración');
  check(await page.getByRole('tab',{name:'Pendientes documentados',exact:true}).count()===1,'Configuración conserva los pendientes documentados');
  await page
    .getByRole("spinbutton", { name: "Nueva tolerancia (%)", exact: true })
    .fill("5");
  await page
    .getByRole("button", { name: "Guardar nueva configuración", exact: true })
    .click();
  await page.getByText("±5 % vigente", { exact: true }).waitFor();
  check(
    (await state()).parametros_seguimiento.length ===
      initial.parametros_seguimiento.length + 1,
    "Tolerancia configurable con histórico",
  );
  await page.goto(origin + "/#/ordenes/000000000000000000000064");
  const tracking = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Crema corporal · 250 ml",
        exact: true,
      }),
    });
  await tracking.getByText("-50.0 % / ±5 %", { exact: true }).waitFor();
  check(
    (await tracking.innerText()).includes("-50.0 % / ±5 %"),
    "Seguimiento usa la tolerancia vigente y desviación por producto",
  );

  await nav("Códigos de barras");
  await page
    .getByRole("button", { name: "Registrar código", exact: true })
    .click();
  await dialog()
    .getByRole("textbox", { name: "Código de barras", exact: true })
    .fill("770100000099");
  await dialog()
    .getByRole("button", { name: "Registrar código", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const codeRow = page.getByRole("row").filter({ hasText: "770100000099" });
  await codeRow
    .getByRole("button", { name: "Confirmar disponibilidad", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await codeRow
    .getByRole("button", { name: "Asignar producto", exact: true })
    .click();
  await dialog()
    .getByRole("combobox", { name: "Producto", exact: true })
    .selectOption({ label: "Crema corporal · 250 ml" });
  await dialog()
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  db = await state();
  check(
    db.codigos_barras.find((r) => r.codigo === "770100000099").estado ===
      "asignado",
    "Código recorre creación, verificación y asignación explícitas",
  );
  check(
    db.orden_producto.find((r) => r.id === line.id).id_codigo_barras ===
      line.id_codigo_barras,
    "Asignar código nuevo conserva las órdenes anteriores",
  );
  await shot("14-codigos");
  await nav("Catálogos");
  await page
    .getByRole("textbox", { name: "Buscar en Productos", exact: true })
    .fill("770999999999");
  await page
    .getByRole("cell", { name: "Crema corporal · 250 ml", exact: true })
    .waitFor();
  check(
    (await page
      .getByRole("cell", { name: "Crema corporal · 250 ml", exact: true })
      .count()) === 1,
    "Consulta de producto por código antiguo inactivo",
  );
  await page
    .getByRole("textbox", { name: "Buscar en Productos", exact: true })
    .fill("");
  await shot("15-catalogos");

  // Independent stickers in one order, including returning to the first step.
  await nav("Órdenes de compra");
  await page.locator('.page-heading').getByRole('button',{name:'Nueva orden',exact:true}).click();
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).pressSequentially('24102026');
  await dialog().locator('.order-form-line').nth(0).getByRole('spinbutton',{name:'Cantidad solicitada',exact:true}).fill('101');
  await dialog().locator('.order-form-line').nth(0).getByRole('textbox',{name:'Precio unitario',exact:true}).fill('2.50');
  await dialog().getByRole('button',{name:'Agregar producto',exact:true}).click();
  await dialog().locator('.order-form-line').nth(1).getByRole('spinbutton',{name:'Cantidad solicitada',exact:true}).fill('101');
  await dialog().locator('.order-form-line').nth(1).getByRole('textbox',{name:'Precio unitario',exact:true}).fill('3.25');
  check(await dialog().locator('output[aria-label="Total del producto 1"]').innerText()==='$ 252,50' && await dialog().locator('output[aria-label="Total del producto 2"]').innerText()==='$ 328,25','Totales independientes se actualizan en cada producto');
  await page.setViewportSize({width:375,height:900});
  check(await dialog().evaluate((el) => el.scrollWidth<=el.clientWidth+1),'Totales del formulario sin desborde en móvil');
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  const reviewLines=() => dialog().locator('.order-form-line');
  const pct=(i) => reviewLines().nth(i).getByRole('spinbutton',{name:'Adicional recomendado de sticker (%)',exact:true});
  const stickerQty=(i) => reviewLines().nth(i).getByRole('spinbutton',{name:'Cantidad de sticker · provisional',exact:true});
  await pct(0).fill('5');
  check(await stickerQty(0).inputValue()==='213' && await stickerQty(1).inputValue()==='223' && await pct(1).inputValue()==='10','5 % y 10 % se aplican a productos independientes con redondeo');
  const corrugado=reviewLines().nth(1).getByRole('combobox',{name:'Referencia de corrugado',exact:true});
  const assigned=await corrugado.inputValue();
  await corrugado.selectOption('');
  check(await reviewLines().nth(1).locator('.order-line-basis').innerText().then((s) => s.includes('Sin configuración para la referencia seleccionada')),'Capacidad mostrada corresponde a la referencia seleccionada');
  await corrugado.selectOption(assigned);
  await pct(0).fill('11');
  await dialog().getByRole('button',{name:'Crear orden',exact:true}).click();
  await dialog().getByRole('alert').waitFor();
  check(await pct(0).getAttribute('aria-invalid')==='true' && await pct(1).getAttribute('aria-invalid')!=='true','Porcentaje inválido marca únicamente el producto correspondiente');
  await pct(0).fill('5');
  await stickerQty(0).fill('212');
  await dialog().getByRole('button',{name:'Volver',exact:true}).click();
  check(await dialog().getByRole('spinbutton',{name:'Adicional recomendado de sticker (%)',exact:true}).count()===0,'Volver al primer paso mantiene los porcentajes en revisión');
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  check(await pct(0).inputValue()==='5' && await pct(1).inputValue()==='10' && await stickerQty(0).inputValue()==='212','Volver a revisión conserva porcentajes y cantidad final editada');
  for (const width of [375,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    check(await dialog().evaluate((el) => el.scrollWidth<=el.clientWidth+1),'Revisión por producto sin desborde a '+width+' px');
    const fields=await reviewLines().nth(0).getByRole('group',{name:'Sticker del producto 1',exact:true}).locator('input').evaluateAll((els) => els.map((el) => {const r=el.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,width:r.width};}));
    check(Math.abs(fields[0].top-fields[1].top)<1 && fields[1].left-fields[0].right>=0 && fields[1].left-fields[0].right<=12 && fields[1].width<=70 && fields[1].width<fields[0].width,'Cantidad sticker y porcentaje compacto en la misma fila a '+width+' px');
  }
  await page.setViewportSize({width:802,height:668});
  await dialog().evaluate((el) => {el.scrollTop=0;});
  await dismissHelp();
  await shot('18-sticker-individual-corrugado');
  await helpFor(reviewLines().nth(0).getByRole('spinbutton',{name:'Cantidad de corrugado',exact:true})).hover();
  await (await tooltipFor(reviewLines().nth(0).getByRole('spinbutton',{name:'Cantidad de corrugado',exact:true}))).waitFor({state:'visible'});
  await shot('21-tooltip-corrugado');
  await dismissHelp();
  await helpFor(pct(0)).hover();
  const compactTip=await tooltipFor(pct(0));
  await compactTip.waitFor({state:'visible'});
  check(await compactTip.evaluate((el) => {const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;}),'Tooltip de porcentaje queda dentro de la ventana de 802 px');
  await shot('22-tooltip-sticker-porcentaje');
  await dismissHelp();
  await page.setViewportSize({width:375,height:900});
  await shot('19-revision-productos-movil');
  await helpFor(pct(0)).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await compactTip.waitFor({state:'visible'});
  check(await compactTip.evaluate((el) => {const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;}),'Tooltip de porcentaje queda dentro de la ventana móvil');
  await helpFor(pct(0)).press('Escape');
  await page.setViewportSize({width:1440,height:900});
  await dialog().getByRole('button',{name:'Crear orden',exact:true}).click();
  await page.getByRole('heading',{name:/^Orden de compra /,level:1}).waitFor();
  const individualId=page.url().split('/').pop();
  const individualLines=(await state()).orden_producto.filter((r) => r.id_orden_compra===individualId);
  check(individualLines.length===2 && individualLines[0].cantidad_sticker===212 && individualLines[1].cantidad_sticker===223 && individualLines.every((r) => !('sticker_pct' in r)),'Guardado conserva cantidades individuales sin ampliar atributos de la tabla');

  await page.goto(origin+'/ordenes/materiales');
  await page.locator('.page-heading').getByRole('button',{name:'Nueva orden',exact:true}).click();
  await requiredDeliveryBlocked('material');
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).pressSequentially('24102026');
  await dialog().getByRole('spinbutton',{name:'Cantidad solicitada',exact:true}).fill('12');
  await dialog().getByRole('textbox',{name:'Precio unitario',exact:true}).fill('100.00');
  await shot('20-creacion-material-fecha-cabecera');
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  await dialog().getByRole('button',{name:'Crear orden',exact:true}).click();
  await page.getByRole('heading',{name:/^Orden de compra /,level:1}).waitFor();
  const manualMaterialId=page.url().split('/').pop();
  check((await state()).orden_material.find((r) => r.id_orden_compra===manualMaterialId).fecha_estimada_entrega==='2026-10-24T12:00:00.000Z','Material creado directamente hereda entrega de cabecera');
  await unauthorizedActionsBlocked('material');
  await authorize();
  await page.getByRole('button',{name:'Registrar / editar',exact:true}).click();
  check(await dialog().getByRole('textbox',{name:'Entrega estimada',exact:true}).inputValue()==='24/10/2026','Recepción de material muestra la fecha heredada y permite editarla');
  await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();

  await nav('Órdenes de compra');
  await page.locator('.page-heading').getByRole('button',{name:'Nueva orden',exact:true}).click();
  await dialog().getByRole('combobox',{name:'Producto',exact:true}).selectOption({label:'Gel de limpieza · 100 ml'});
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).fill('24/10/2026');
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  const tape=dialog().getByRole('spinbutton',{name:'Cantidad de cinta · provisional',exact:true});
  await helpFor(tape).hover();
  const tapeTip=await tooltipFor(tape);
  await tapeTip.waitFor({state:'visible'});
  check(await tapeTip.innerText().then((s) => s.includes('÷ 4000')),'Cinta muestra su fórmula en el icono de ayuda');
  check(await dialog().getByRole('group',{name:'Sticker del producto 1',exact:true}).count()===0,'Producto con cinta conserva exclusión de campos de sticker');
  await shot('23-tooltip-cinta');
  await dismissHelp();
  await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();

  await nav("Órdenes de compra");
  const tab = page.getByRole("tab", { name: /^Seguimiento/ });
  await tab.focus();
  await page.keyboard.press("ArrowLeft");
  check(
    (await page
      .getByRole("tab", { name: /^No autorizadas/ })
      .getAttribute("aria-selected")) === "true",
    "Pestañas operables con flechas",
  );
  await page.keyboard.press("ArrowRight");
  const toastClose=page.getByRole('button',{name:'Cerrar aviso',exact:true});
  if(await toastClose.isVisible()) await toastClose.click();
  const viewports = [];
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => {
      return !document.querySelector('#app-navigation[data-modal=true]');
    });
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    check(
      size.scroll <= size.client + 1,
      "Sin desborde de página a " + width + " px",
    );
    viewports.push({ width, ...size });
    await shot("ordenes-" + width);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page
    .getByRole("button", { name: "Abrir navegación", exact: true })
    .click();
  await page.getByRole("link", { name: "Facturas", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector('#app-navigation[data-modal=true]'),
  );
  check(
    await page
      .getByRole("button", { name: "Abrir navegación", exact: true })
      .evaluate((n) => n === document.activeElement),
    "Escape cierra navegación móvil y devuelve foco",
  );
  await page.locator('.page-heading').getByRole("button", { name: "Nueva orden", exact: true }).click();
  await dialog()
    .getByRole("spinbutton", { name: "Cantidad solicitada", exact: true })
    .fill("1.5");
  await dialog()
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  await dialog().getByRole("alert").waitFor();
  await shot("12-error-movil");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/#/ordenes/" + productId + "/imprimir");
  await page.getByRole("heading", { name: /ORDEN DE PRODUCCIÓN/ }).waitFor();
  check(
    (await page.locator(".print-table tbody tr").count()) === 7,
    "Formato imprimible con siete posiciones para productos",
  );
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  check(
    await page.locator(".print-toolbar").isHidden(),
    "Impresión oculta controles de navegación",
  );
  await shot("13-impresion");
  await page.pdf({
    path: "tests/evidence/orden-producto.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: null, reducedMotion: "reduce" });
  await page.goto(origin + "/#/ordenes");
  await page.reload();
  db = await state();
  check(
    db.lote_producto.some((r) => r.numero_lote === "CLI-LOTE-001"),
    "Recarga conserva cambios del servicio local",
  );
  const ruleProduct=db.productos.find((product) => product.id==='000000000000000000000046');
  check(ruleProduct.activo===true,'Producto de control inicialmente activo');
  const setProductActive=async (active) => {
    const response=await apiCommand('saveEntity',{entity:'productos',key:{id:ruleProduct.id},row:{...ruleProduct,activo:active}});
    check(response.ok(),'Cambio de estado de producto en catálogo de prueba: '+active);
  };
  await setProductActive(false);
  await page.reload();
  await page.locator('.page-heading').getByRole('button',{name:'Nueva orden',exact:true}).click();
  const productChoice=dialog().getByRole('combobox',{name:'Producto',exact:true});
  await productChoice.fill('');
  await productChoice.press('ArrowDown');
  check(await page.locator('[role=option][data-key="'+ruleProduct.id+'"]').count()===0,
    'Producto inactivo no aparece como opción al crear una OC');
  const availableProductIds=await page.getByRole('option').evaluateAll(options=>options.map(option=>option.dataset.key).filter(Boolean));
  await page.keyboard.press('Escape');
  check(availableProductIds.length>0 && availableProductIds.every((id) => db.productos.find((product) => product.id===id)?.activo===true),
    'La lista de productos disponibles contiene únicamente activos');
  await requiredDeliveryBlocked('producto con catálogo actualizado');
  await shot('28-productos-activos-fecha-obligatoria');
  await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();
  const beforeInactive=await state();
  const inactiveResponse=await apiCommand('createOrder',{
    tipo_orden:'producto',id_proveedor:ruleProduct.id_maquilador,
    fecha_solicitada_entrega:'2026-10-30T12:00:00.000Z',
    lines:[{id_producto:ruleProduct.id,cantidad_solicitada:100,precio_unitario:'2.50'}],
  });
  const inactiveError=await inactiveResponse.json();
  check(inactiveResponse.status()===422 && Boolean(inactiveError.fields['lines.0.id_producto']),
    'El servicio rechaza productos inactivos aunque se omita el selector');
  check(JSON.stringify(await state())===JSON.stringify(beforeInactive),
    'Rechazar producto inactivo conserva órdenes, vínculos y consecutivos');
  await setProductActive(true);
  await page.reload();
  await page.locator('.page-heading').getByRole('button',{name:'Nueva orden',exact:true}).click();
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).fill('30/10/2026');
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  await dialog().getByRole('button',{name:'Crear orden',exact:true}).waitFor();
  await setProductActive(false);
  const beforeStaleProduct=await state();
  await dialog().getByRole('button',{name:'Crear orden',exact:true}).click();
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).waitFor();
  const rejectedProduct=dialog().getByRole('combobox',{name:'Producto',exact:true});
  check(await rejectedProduct.getAttribute('aria-invalid')==='true',
    'Desactivar el producto durante revisión devuelve el formulario al campo con error');
  check(await rejectedProduct.locator('option[value="'+ruleProduct.id+'"]').count()===0,
    'Tras un rechazo el catálogo se actualiza y elimina la opción inactiva');
  check(JSON.stringify(await state())===JSON.stringify(beforeStaleProduct),
    'Desactivación durante revisión impide emitir y conserva los consecutivos');
  await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();
  await setProductActive(true);
  await page.reload();
  // Product composition and initial lot dates are checked in a separate order.
  await page.goto(origin+'/ordenes/productos');
  await page.locator('.page-heading').getByRole('button',{name:'Nueva orden',exact:true}).click();
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).fill('30/10/2026');
  await dialog().getByRole('button',{name:'Agregar producto',exact:true}).click();
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  await dialog().getByRole('button',{name:'Crear orden',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const initialLotsOrderId=page.url().split('/').pop();
  const beforeInitialEdit=await state();
  const initialLines=beforeInitialEdit.orden_producto.filter((row) => row.id_orden_compra===initialLotsOrderId);
  const firstInitialLot=beforeInitialEdit.lote_producto.find((row) => row.id_orden_producto===initialLines[0].id);
  const removedInitialLot=beforeInitialEdit.lote_producto.find((row) => row.id_orden_producto===initialLines[1].id);
  check(initialLines.length===2 && await page.locator('.lot-list tbody tr').count()===2,
    'Dos renglones recién creados muestran sus dos lotes iniciales antes de autorizar');
  for (const width of [375,1440]) {
    await page.setViewportSize({width,height:900});
    await shot('31-lotes-iniciales-'+width);
  }
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  check(await dialog().getByRole('combobox',{name:'Producto',exact:true}).evaluateAll((fields) => fields.every((field) => !field.disabled)),
    'Los productos siguen disponibles para corregir una orden sin autorizar');
  await dialog().getByRole('button',{name:'Eliminar producto 2',exact:true}).click();
  await dialog().getByRole('button',{name:'Agregar producto',exact:true}).click();
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).fill('31/10/2026');
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  await dialog().getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const afterInitialEdit=await state();
  const editedInitialLines=afterInitialEdit.orden_producto.filter((row) => row.id_orden_compra===initialLotsOrderId);
  const editedInitialLots=afterInitialEdit.lote_producto.filter((lot) => editedInitialLines.some((row) => row.id===lot.id_orden_producto));
  check(editedInitialLots.length===2 && editedInitialLots.every((lot) => lot.fecha_estimada_batch_record==='2026-10-31T12:00:00.000Z') && editedInitialLots.some((lot) => lot.id===firstInitialLot.id),
    'Editar la entrega sin autorizar propaga la estimación y conserva la identidad del primer lote');
  check(!afterInitialEdit.lote_producto.some((lot) => lot.id===removedInitialLot.id) &&
    !afterInitialEdit.abastecimiento_material.some((link) => link.id_orden_producto===initialLines[1].id) &&
    JSON.stringify(afterInitialEdit.orden_material)===JSON.stringify(beforeInitialEdit.orden_material),
    'Quitar el producto elimina su lote y vínculos, conservando las órdenes de materiales');
  await authorize();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  for (const width of [375,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    check(await dialog().getByRole('combobox',{name:'Producto',exact:true}).evaluateAll((fields) => fields.length===2 && fields.every((field) => field.disabled)) &&
      await dialog().getByRole('button',{name:'Agregar producto',exact:true}).isDisabled() &&
      await dialog().getByRole('button',{name:/^Eliminar producto /}).evaluateAll((buttons) => buttons.length===2 && buttons.every((button) => button.disabled)),
      'La edición autorizada bloquea agregar, quitar y sustituir productos a '+width+' px');
    check(await dialog().getByRole('spinbutton',{name:'Cantidad solicitada',exact:true}).first().isEnabled() &&
      await dialog().getByRole('textbox',{name:'Precio unitario',exact:true}).first().isEnabled() &&
      await dialog().locator('#order-products-locked').isVisible(),
      'La edición autorizada explica el bloqueo y permite cantidad y precio a '+width+' px');
    if (width===375 || width===1440) await shot('32-edicion-productos-autorizada-'+width);
  }
  await dialog().getByRole('textbox',{name:'Entrega solicitada',exact:true}).fill('04/11/2026');
  await dialog().getByRole('button',{name:'Revisar orden',exact:true}).click();
  await dialog().getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  check((await state()).lote_producto.filter((lot) => editedInitialLots.some((row) => row.id===lot.id)).every((lot) => lot.fecha_estimada_batch_record==='2026-10-31T12:00:00.000Z'),
    'Editar la entrega después de autorizar conserva las estimaciones de los lotes');
  await page.getByRole('button',{name:'Completar lote del producto 1',exact:true}).click();
  await dialog().getByRole('textbox',{name:'Batch record estimado',exact:true}).fill('02/11/2026');
  const pendingLotNumber=dialog().getByRole('textbox',{name:'Número de lote',exact:true});
  check(await pendingLotNumber.inputValue()==='' && await pendingLotNumber.getAttribute('required')===null,
    'La fecha de un lote puede ajustarse sin conocer el número');
  await dialog().getByRole('spinbutton',{name:'Cantidad recibida',exact:true}).fill('1');
  check(await pendingLotNumber.getAttribute('required')!==null || await pendingLotNumber.getAttribute('aria-required')==='true','Registrar recepción vuelve obligatorio el número de lote');
  await dialog().getByRole('spinbutton',{name:'Cantidad recibida',exact:true}).fill('');
  await dialog().getByRole('button',{name:'Guardar lote',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  check((await state()).lote_producto.find((lot) => lot.id===firstInitialLot.id).fecha_estimada_batch_record==='2026-11-02T12:00:00.000Z',
    'Guardar solo la estimación conserva el lote inicial y su número pendiente');
  await page.getByRole('button',{name:'Agregar lote',exact:true}).first().click();
  check(await dialog().getByRole('textbox',{name:'Batch record estimado',exact:true}).inputValue()==='04/11/2026',
    'Un lote adicional toma la entrega actual de la cabecera');
  await dialog().getByRole('textbox',{name:'Batch record estimado',exact:true}).fill('03/11/2026');
  await dialog().getByRole('button',{name:'Guardar lote',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const independentLots=(await state()).lote_producto.filter((lot) => lot.id_orden_producto===editedInitialLines[0].id);
  check(independentLots.length===2 && new Set(independentLots.map((lot) => lot.fecha_estimada_batch_record)).size===2,
    'Un mismo producto conserva dos lotes con estimaciones independientes');
  for (const width of [375,1440]) {
    await page.setViewportSize({width,height:900});
    await shot('33-estimaciones-por-lote-'+width);
  }
  // Header invariants are verified through the interface and actual HTTP commands.
  const invoke = async (name, payload) => {
    const response = await apiCommand(name, payload);
    if (!response.ok()) throw new Error(name + ': ' + await response.text());
    return (await response.json()).result;
  };
  const sid = (n) => n.toString(16).padStart(24, '0');
  const acceptSupplier = async () => {
    await dialog().getByRole('button', { name: 'Cambiar proveedor', exact: true }).click();
    await page.getByRole('dialog', { name: 'Cambiar proveedor y reemplazar la orden', exact: true }).waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('[role=dialog] input.date-input-text[id$="field-fecha_solicitada_entrega"]')?.value === '');
  };
  const rejected = async (name, payload, code, label) => {
    const before = await state();
    const response = await apiCommand(name, payload);
    check(response.status() === 422 && (await response.json()).code === code, label);
    check(JSON.stringify(await state()) === JSON.stringify(before), label + ': datos y consecutivos intactos');
  };
  for (const [id, type] of [[initialLotsOrderId, 'producto'], [manualMaterialId, 'material'], [otherId, 'otro']]) {
    await page.goto(origin + '/ordenes/' + id);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      check(!await dialog().getByRole('textbox', { name: 'Número de orden', exact: true }).isEditable() &&
        await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).isDisabled(),
        'Número inmutable y proveedor bloqueado en ' + type + ' autorizado a ' + width + ' px');
    }
    await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
    const db = await state();
    const header = db.orden_compra.find((row) => row.id === id);
    const table = type === 'producto' ? 'orden_producto' : type === 'material' ? 'orden_material' : 'orden_otro';
    const edit = { ...header, lines: db[table].filter((row) => row.id_orden_compra === id), confirm: true };
    await rejected('editOrder', { ...edit, no_orden: '99999' }, 'VALIDATION', 'HTTP rechaza cambiar el número de ' + type);
    await rejected('editOrder', { ...edit, id_proveedor: sid(type === 'producto' ? 2 : type === 'material' ? 4 : 1) }, 'AUTHORIZATION', 'HTTP rechaza cambiar el proveedor de ' + type + ' autorizado');
  }

  // Supplier replacement keeps the saved order intact throughout the draft and review.
  const originalRequest = {
    tipo_orden: 'producto', id_proveedor: sid(1), fecha_elaboracion: '2026-09-10T12:00:00.000Z',
    fecha_solicitada_entrega: '2026-10-28T12:00:00.000Z',
    lines: [
      { id_producto: sid(70), cantidad_solicitada: 111, precio_unitario: '12.34', cantidad_corrugado: 555, cantidad_sticker: 666 },
      { id_producto: sid(71), cantidad_solicitada: 222, precio_unitario: '56.78', cantidad_cinta: 777 },
    ],
  };
  await rejected('createOrder', { ...originalRequest, no_orden: '99999' }, 'VALIDATION', 'HTTP rechaza el número manual al crear');
  const replaced = await invoke('createOrder', originalRequest);
  const replacementOrderId = replaced.orderId;
  await invoke('saveDocument', { tipo_entidad: 'orden_compra', id_entidad: replacementOrderId, tipo_documento: 'orden_compra_escaneada', nombre_archivo: 'OC-anterior.html' });
  const beforeReplacement = await state();
  const oldHeader = beforeReplacement.orden_compra.find((row) => row.id === replacementOrderId);
  const previousLines = beforeReplacement.orden_producto.filter((row) => row.id_orden_compra === replacementOrderId);
  const previousLots = beforeReplacement.lote_producto.filter((lot) => previousLines.some((row) => row.id === lot.id_orden_producto));
  const previousDocuments = beforeReplacement.documento.filter((doc) => doc.tipo_entidad === 'orden_compra' && doc.id_entidad === replacementOrderId);
  await page.goto(origin + '/ordenes/' + replacementOrderId);
  check(await page.getByRole('button', { name: /^Eliminar lote / }).evaluateAll((buttons) => buttons.length === 2 && buttons.every((button) => button.disabled)),
    'Eliminar cualquier lote inicial queda bloqueado antes de autorizar');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  check(!await dialog().getByRole('textbox', { name: 'Número de orden', exact: true }).isEditable() &&
    await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).isEnabled(),
    'Editar sin autorizar mantiene número inmutable y permite seleccionar proveedor');
  await dialog().getByRole('spinbutton', { name: 'Cantidad solicitada', exact: true }).first().fill('333');
  await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(sid(2));
  await dialog().getByRole('heading', { name: 'Cambiar proveedor y reemplazar la orden', exact: true }).waitFor();
  check((await dialog().innerText()).includes('documentos propios') && (await dialog().innerText()).includes('Las OCM anteriores'),
    'Advertencia inmediata explica productos, lotes, documentos y conservación de las OCM');
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  check(await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).inputValue() === sid(1) &&
    await dialog().getByRole('spinbutton', { name: 'Cantidad solicitada', exact: true }).first().inputValue() === '333' &&
    await dialog().locator('.order-form-line').count() === 2,
    'Cancelar la advertencia restaura el proveedor y conserva el borrador');
  check(JSON.stringify(await state()) === JSON.stringify(beforeReplacement), 'Cancelar advertencia no modifica registros ni consecutivos guardados');
  await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(sid(2));
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(await dialog().evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'Advertencia de cambio de proveedor sin desborde a ' + width + ' px');
    if (width === 375 || width === 1440) await shot('34-advertencia-reemplazo-' + width);
  }
  await acceptSupplier();
  check(await dialog().getByRole('textbox', { name: 'Entrega solicitada', exact: true }).inputValue() === '' &&
    await dialog().locator('.order-form-line').count() === 1 &&
    await optionsFor(dialog().getByRole('combobox', { name: 'Producto', exact: true })).then(options=>options.length>0&&options.every(option=>beforeReplacement.productos.filter(p=>p.id_maquilador===sid(2)&&p.activo).some(p=>option.includes(p.nombre_producto)))) &&
    await dialog().getByRole('spinbutton', { name: 'Cantidad solicitada', exact: true }).inputValue() === '6000',
    'Aceptar prepara productos activos del nuevo proveedor, cantidades nuevas y entrega vacía obligatoria');
  await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(sid(1));
  await page.waitForFunction(() => document.querySelector('[role=dialog] input.date-input-text[id$="field-fecha_solicitada_entrega"]')?.value === '28/10/2026');
  check(await dialog().getByRole('spinbutton', { name: 'Cantidad solicitada', exact: true }).first().inputValue() === '333' &&
    await dialog().getByRole('textbox', { name: 'Entrega solicitada', exact: true }).inputValue() === '28/10/2026' &&
    await dialog().locator('.order-form-line').count() === 2 && await dialog().locator('p.notice[role=status]').count() === 0,
    'Volver al proveedor original restaura literalmente el borrador previo y sale del reemplazo');
  await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(sid(2));
  await acceptSupplier();
  await requiredDeliveryBlocked('reemplazo por proveedor');
  await dialog().getByRole('textbox', { name: 'Entrega solicitada', exact: true }).fill('06/11/2026');
  await dialog().getByRole('button', { name: 'Revisar orden', exact: true }).click();
  check(await dialog().getByRole('button', { name: 'Guardar reemplazo', exact: true }).isVisible() &&
    (await dialog().locator('p.notice[role=status]').innerText()).includes('Reemplazo pendiente'),
    'Revisión final identifica el reemplazo pendiente y permite guardarlo explícitamente');
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await shot('35-revision-reemplazo-' + width);
  }
  check(JSON.stringify(await state()) === JSON.stringify(beforeReplacement), 'Revisar reemplazo conserva íntegramente la orden guardada');
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  check(JSON.stringify(await state()) === JSON.stringify(beforeReplacement), 'Cerrar la edición sin guardar conserva todos los registros y consecutivos');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(sid(2));
  await acceptSupplier();
  await dialog().getByRole('textbox', { name: 'Entrega solicitada', exact: true }).fill('06/11/2026');
  await dialog().getByRole('spinbutton', { name: 'Cantidad solicitada', exact: true }).fill('234');
  await dialog().getByRole('textbox', { name: 'Precio unitario', exact: true }).fill('8.50');
  await dialog().getByRole('button', { name: 'Revisar orden', exact: true }).click();
  await dialog().getByRole('button', { name: 'Guardar reemplazo', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const afterReplacement = await state();
  const replacementHeader = afterReplacement.orden_compra.find((row) => row.id === replacementOrderId);
  const replacementLines = afterReplacement.orden_producto.filter((row) => row.id_orden_compra === replacementOrderId);
  const replacementLots = afterReplacement.lote_producto.filter((lot) => replacementLines.some((line) => line.id === lot.id_orden_producto));
  check(replacementHeader.id === oldHeader.id && replacementHeader.no_orden === oldHeader.no_orden &&
    replacementHeader.tipo_orden === oldHeader.tipo_orden && replacementHeader.id_proveedor === sid(2) &&
    replacementHeader.estado_autorizacion === 'no_autorizada' && replacementHeader.fecha_autorizacion === null &&
    replacementHeader.fecha_elaboracion !== oldHeader.fecha_elaboracion && replacementHeader.fecha_solicitada_entrega === '2026-11-06T12:00:00.000Z',
    'Guardar reemplazo conserva identidad, número y tipo; usa únicamente la cabecera nueva');
  check(!afterReplacement.orden_producto.some((row) => previousLines.some((old) => old.id === row.id)) &&
    !afterReplacement.lote_producto.some((row) => previousLots.some((old) => old.id === row.id) || previousLines.some((old) => old.id === row.id_orden_producto)) &&
    !afterReplacement.abastecimiento_material.some((row) => previousLines.some((old) => old.id === row.id_orden_producto)) &&
    !afterReplacement.documento.some((row) => previousDocuments.some((old) => old.id === row.id)),
    'Ningún renglón, lote, documento propio ni vínculo anterior sobrevive al reemplazo');
  check(JSON.stringify(afterReplacement.orden_compra.filter((row) => beforeReplacement.orden_compra.some((old) => old.id === row.id && old.id !== replacementOrderId))) ===
      JSON.stringify(beforeReplacement.orden_compra.filter((row) => row.id !== replacementOrderId)) &&
    JSON.stringify(materialState(afterReplacement)) === JSON.stringify(materialState(beforeReplacement)) &&
    JSON.stringify(afterReplacement.documento.filter((row) => beforeReplacement.documento.some((old) => old.id === row.id))) === JSON.stringify(beforeReplacement.documento.filter((row) => !previousDocuments.some((old) => old.id === row.id))),
    'OCM anteriores, recepciones y documentos independientes conservados íntegramente en navegador');
  check(replacementLines.length === 1 && replacementLines[0].id_producto === sid(72) && replacementLines[0].cantidad_solicitada === 234 &&
    replacementLines[0].precio_unitario === '8.50' && replacementLots.length === 1 && replacementLots[0].numero_lote === null &&
    replacementLots[0].cantidad_recibida === null && replacementLots[0].fecha_estimada_batch_record === replacementHeader.fecha_solicitada_entrega &&
    JSON.stringify(afterReplacement.abastecimiento_material) === JSON.stringify(beforeReplacement.abastecimiento_material.filter((link) => !previousLines.some((line) => line.id === link.id_orden_producto))) &&
    JSON.stringify(afterReplacement.consecutivo_orden) === JSON.stringify(beforeReplacement.consecutivo_orden),
    'Reemplazo crea identificadores nuevos y un lote inicial, conservando relaciones independientes y consecutivos');
  await authorize();

  // Delete, cancel and reopen operate on lots without deleting independent invoices.
  await page.getByRole('button', { name: 'Completar lote del producto 1', exact: true }).click();
  await dialog().getByRole('textbox', { name: 'Número de lote', exact: true }).fill('BORRAR-CERRADO');
  await dialog().getByRole('spinbutton', { name: 'Cantidad recibida', exact: true }).fill('234');
  await dialog().getByRole('combobox', { name: 'Estado', exact: true }).selectOption('cerrado');
  await dialog().getByRole('combobox', { name: 'Seleccionar factura del proveedor', exact: true }).selectOption(sid(152));
  await dialog().getByRole('button', { name: 'Guardar lote', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Agregar lote', exact: true }).click();
  await dialog().getByRole('button', { name: 'Guardar lote', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const beforeDelete = await state();
  await page.getByRole('button', { name: 'Eliminar lote BORRAR-CERRADO del producto 1', exact: true }).click();
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  check(JSON.stringify(await state()) === JSON.stringify(beforeDelete), 'Cancelar la eliminación del lote conserva todos sus datos');
  await page.getByRole('button', { name: 'Eliminar lote BORRAR-CERRADO del producto 1', exact: true }).click();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(await dialog().evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'Confirmación de borrado sin desborde a ' + width + ' px');
    if (width === 375 || width === 1440) await shot('36-eliminar-lote-' + width);
  }
  await dialog().getByRole('button', { name: 'Eliminar lote', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const afterDelete = await state();
  check(!afterDelete.lote_producto.some((row) => row.numero_lote === 'BORRAR-CERRADO') &&
    afterDelete.orden_producto.find((row) => row.id === replacementLines[0].id).estado === 'en_seguimiento' &&
    JSON.stringify(afterDelete.factura) === JSON.stringify(beforeDelete.factura) && JSON.stringify(afterDelete.documento) === JSON.stringify(beforeDelete.documento),
    'Eliminar lote cerrado, recibido y facturado conserva producto, facturas y documentos');
  check(await page.locator('.line-metadata').innerText().then((text) => text.includes('-100.0 %')), 'Eliminar lote cerrado recalcula la desviación visible');
  await page.getByRole('button', { name: /^Eliminar lote / }).click();
  check((await dialog().innerText()).includes('último lote') && (await dialog().innerText()).includes('quedará anulado'), 'Borrar el último lote advierte que anulará el producto');
  await dialog().getByRole('button', { name: 'Eliminar lote', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(await page.getByRole('button', { name: 'Reabrir', exact: true }).isVisible() &&
    await page.getByRole('button', { name: 'Agregar lote', exact: true }).isDisabled() &&
    (await state()).orden_producto.find((row) => row.id === replacementLines[0].id).estado === 'anulada',
    'Último lote eliminado anula el producto y bloquea agregar hasta reabrir');
  await rejected('saveLot', { row: { id_orden_producto: replacementLines[0].id } }, 'VALIDATION', 'HTTP bloquea lotes nuevos de un producto anulado');
  await page.getByRole('button', { name: 'Reabrir', exact: true }).click();
  await page.getByRole('button', { name: 'Completar lote del producto 1', exact: true }).waitFor();
  const reopenedLot = (await state()).lote_producto.find((lot) => lot.id_orden_producto === replacementLines[0].id);
  check(reopenedLot.numero_lote === null && reopenedLot.cantidad_recibida === null && reopenedLot.estado_batch_record === 'pendiente' &&
    reopenedLot.estado_inspeccion === 'pendiente' && reopenedLot.fecha_estimada_batch_record === replacementHeader.fecha_solicitada_entrega &&
    !beforeDelete.lote_producto.some((lot) => lot.id === reopenedLot.id), 'Reabrir crea un lote inicial nuevo con la entrega actual y estados pendientes');
  await invoke('setLineState', { entity: 'orden_producto', id: replacementLines[0].id, estado: 'en_seguimiento' });
  check((await state()).lote_producto.filter((lot) => lot.id_orden_producto === replacementLines[0].id).length === 1, 'Repetir reapertura no duplica lotes');
  await page.reload();
  await page.getByRole('button', { name: 'Agregar lote', exact: true }).click();
  await dialog().getByRole('button', { name: 'Guardar lote', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Anular', exact: true }).click();
  check((await dialog().innerText()).includes('todos sus lotes (2)'), 'Anular producto explica la eliminación conjunta de sus lotes');
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  check((await state()).lote_producto.filter((lot) => lot.id_orden_producto === replacementLines[0].id).length === 2, 'Cancelar anulación conserva los dos lotes');
  await page.getByRole('button', { name: 'Anular', exact: true }).click();
  await dialog().getByRole('button', { name: 'Anular producto', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check((await state()).lote_producto.filter((lot) => lot.id_orden_producto === replacementLines[0].id).length === 0 &&
    JSON.stringify((await state()).abastecimiento_material) === JSON.stringify(afterReplacement.abastecimiento_material),
    'Anular elimina todos los lotes y conserva abastecimiento y renglón');

  // Invoice forms associate existing receipts from the same supplier.
  const invoiceOrder = await invoke('createOrder', {
    tipo_orden: 'otro', id_proveedor: sid(5), fecha_solicitada_entrega: '2026-11-16T12:00:00.000Z',
    lines: [{ producto: 'Servicio para asociación de factura', cantidad_solicitada: 1, precio_unitario: '250.00' }],
  });
  await invoke('authorizeOrder', { id: invoiceOrder.orderId, confirm: true });
  const beforeInvoiceViews = await state();
  const existingReceipt = beforeInvoiceViews.orden_otro.find((row) => row.id_orden_compra === invoiceOrder.orderId);
  await page.goto(origin + '/facturas');
  await page.getByRole('button', { name: 'Agregar factura', exact: true }).click();
  await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(sid(5));
  await dialog().getByRole('textbox', { name: 'Número de factura', exact: true }).fill('FACT-RECEPCIONES-UI');
  for (const width of [375, 708, 1440]) {
    await page.setViewportSize({ width, height: 668 });
    check((await dialog().locator('.btn').allTextContents()).map((value) => value.trim()).filter(Boolean).join('|') === 'Adjuntar documento|Cancelar|Guardar factura',
      'Acciones del formulario de factura a ' + width + ' px');
    check(await dialog().evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'Factura sin desborde a ' + width + ' px');
    if (width === 708) await shot('39-factura-formulario');
  }
  await dialog().getByRole('button', { name: 'Guardar factura', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Factura FACT-RECEPCIONES-UI', exact: true }).waitFor();
  const savedInvoice = (await state()).factura.find((row) => row.numero_factura === 'FACT-RECEPCIONES-UI');
  check(await page.getByRole('heading', { name: 'Factura sin recepciones', exact: true }).isVisible(), 'Factura guardada sin recepciones');
  check((await page.locator('.page-heading').getByRole('button').allTextContents()).map((value) => value.trim()).join('|') === 'Asignar lotes',
    'Acción principal del detalle de factura');
  await shot('40-factura-detalle');
  await page.getByRole('button', { name: 'Asignar lotes', exact: true }).click();
  const receiptOption = dialog().getByRole('checkbox', { name: /Servicio para asociación de factura/ });
  await receiptOption.check();
  for (const width of [375, 708, 1440]) {
    await page.setViewportSize({ width, height: 668 });
    check((await dialog().locator('.btn').allTextContents()).map((value) => value.trim()).filter(Boolean).join('|') === 'Cancelar|Guardar asociaciones',
      'Acciones de asociación de recepciones a ' + width + ' px');
    if (width === 708) await shot('41-factura-asociacion');
  }
  await dialog().getByRole('button', { name: 'Guardar asociaciones', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const afterInvoiceViews = await state();
  check(afterInvoiceViews.orden_otro.find((row) => row.id === existingReceipt.id).id_factura === savedInvoice.id,
    'Asignar recepciones conserva la relación con la factura guardada');
  check(JSON.stringify(afterInvoiceViews.lote_producto) === JSON.stringify(beforeInvoiceViews.lote_producto) &&
    JSON.stringify(afterInvoiceViews.lote_material) === JSON.stringify(beforeInvoiceViews.lote_material),
    'Las operaciones de factura conservan íntegramente los lotes existentes');

  // Authorization can change while a replacement is being reviewed.
  const race = await invoke('createOrder', originalRequest);
  await page.goto(origin + '/ordenes/' + race.orderId);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await dialog().getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(sid(2));
  await acceptSupplier();
  await dialog().getByRole('textbox', { name: 'Entrega solicitada', exact: true }).fill('06/11/2026');
  await dialog().getByRole('button', { name: 'Revisar orden', exact: true }).click();
  await invoke('authorizeOrder', { id: race.orderId, confirm: true });
  const raceBefore = await state();
  await dialog().getByRole('button', { name: 'Guardar reemplazo', exact: true }).click();
  await dialog().getByRole('alert').waitFor();
  check((await dialog().getByRole('alert').innerText()).includes('proveedor de una orden autorizada') && JSON.stringify(await state()) === JSON.stringify(raceBefore),
    'Autorizar durante la revisión rechaza el reemplazo en UI sin borrar información');
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  // A document remains a single owned record through creation, cancellation and replacement.
  const documentCases = [
    ['producto', sid(1), { id_producto: sid(70) }],
    ['material', sid(3), { id_material: sid(50) }],
    ['otro', sid(5), { producto: 'Servicio con orden escaneada' }],
  ];
  for (const [type, supplier, item] of documentCases) {
    const order = await invoke('createOrder', {
      tipo_orden: type, id_proveedor: supplier, fecha_solicitada_entrega: '2026-11-15T12:00:00.000Z',
      lines: [{ ...item, cantidad_solicitada: 100, precio_unitario: '120.00' }],
    });
    await page.goto(origin + '/ordenes/' + order.orderId);
    const documentsPanel = page.locator('.detail-side > section.panel').first();
    await documentsPanel.getByRole('button', { name: 'Agregar', exact: true }).click();
    await dialog().getByRole('textbox', { name: 'Nombre del archivo', exact: true }).fill('OC-' + type + '.html');
    await dialog().getByRole('button', { name: 'Guardar placeholder', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const savedDocument = (await state()).documento.find((row) => row.id_entidad === order.orderId);
    check(await documentsPanel.getByRole('button', { name: 'Agregar', exact: true }).count() === 0 &&
      await documentsPanel.getByRole('button', { name: 'Reemplazar', exact: true }).count() === 1,
      'Una orden escaneada oculta Agregar y ofrece Reemplazar en ' + type);
    await rejected('saveDocument', { tipo_entidad: 'orden_compra', id_entidad: order.orderId,
      tipo_documento: 'orden_compra_escaneada', nombre_archivo: 'Duplicada.html' }, 'R07',
      'HTTP rechaza una segunda orden escaneada de ' + type);
    const beforeCancel = await state();
    await documentsPanel.getByRole('button', { name: 'Reemplazar', exact: true }).click();
    check(await dialog().getByRole('combobox', { name: 'Clase de documento', exact: true }).isDisabled(),
      'Reemplazar conserva la clase de documento en ' + type);
    await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
    check(JSON.stringify(await state()) === JSON.stringify(beforeCancel), 'Cancelar reemplazo conserva registros en ' + type);
    await documentsPanel.getByRole('button', { name: 'Reemplazar', exact: true }).click();
    await dialog().getByRole('textbox', { name: 'Nombre del archivo', exact: true }).fill('OC-' + type + '-reemplazada.html');
    await dialog().getByRole('button', { name: 'Reemplazar placeholder', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const replacedDoc = (await state()).documento.filter((row) => row.id_entidad === order.orderId);
    check(replacedDoc.length === 1 && replacedDoc[0].id === savedDocument.id &&
      replacedDoc[0].clave_almacenamiento !== savedDocument.clave_almacenamiento &&
      replacedDoc[0].tipo_documento === savedDocument.tipo_documento,
      'Reemplazar actualiza el mismo documento y conserva su propietario en ' + type);
    if (type === 'producto') await shot('38-documento-unico-reemplazar');
  }
  const invoiceWithDocument = (await invoke('createInvoice', {
    id_proveedor: sid(1), numero_factura: 'FECHAS-DOC', placeholder: false,
  })).row;
  await page.goto(origin + '/facturas/' + invoiceWithDocument.id);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await dialog().getByRole('textbox', { name: 'Nombre del archivo', exact: true }).fill('Factura-fechas.html');
  await dialog().getByRole('button', { name: 'Guardar placeholder', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(await page.getByRole('button', { name: 'Agregar', exact: true }).count() === 0 &&
    await page.getByRole('button', { name: 'Reemplazar', exact: true }).count() === 1,
    'Factura admite un documento y ofrece Reemplazar');
  await rejected('saveDocument', { tipo_entidad: 'factura', id_entidad: invoiceWithDocument.id,
    tipo_documento: 'factura_fisica', nombre_archivo: 'Factura-duplicada.html' }, 'R07', 'HTTP rechaza el segundo documento de factura');
  const invoiceDoc = (await state()).documento.find((row) => row.id_entidad === invoiceWithDocument.id);
  await page.getByRole('button', { name: 'Reemplazar', exact: true }).click();
  await dialog().getByRole('textbox', { name: 'Nombre del archivo', exact: true }).fill('Factura-fechas-reemplazada.html');
  await dialog().getByRole('button', { name: 'Reemplazar placeholder', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check((await state()).documento.find((row) => row.id_entidad === invoiceWithDocument.id).id === invoiceDoc.id,
    'Reemplazar factura conserva el identificador usado por su hipervínculo');
  const plainInvoice = (await invoke('createInvoice', {
    id_proveedor: sid(1), numero_factura: 'FECHAS-SIN-DOC', placeholder: false,
  })).row;
  const detailOrder = await invoke('createOrder', {
    tipo_orden: 'producto', id_proveedor: sid(1), fecha_solicitada_entrega: '2026-11-05T12:00:00.000Z',
    lines: [
      { id_producto: sid(70), cantidad_solicitada: 12000, precio_unitario: '3200.00', ref_corrugado: sid(53), cantidad_corrugado: 505, cantidad_sticker: 25200 },
      { id_producto: sid(71), cantidad_solicitada: 8000, precio_unitario: '2450.00', ref_corrugado: sid(53), cantidad_corrugado: 334, cantidad_cinta: 8400 },
    ],
  });
  await invoke('authorizeOrder', { id: detailOrder.orderId, confirm: true });
  const detailState = await state();
  const detailLines = detailState.orden_producto.filter((row) => row.id_orden_compra === detailOrder.orderId);
  const lotWithDates = detailState.lote_producto.find((row) => row.id_orden_producto === detailLines[0].id);
  await invoke('saveLot', { row: { ...lotWithDates, numero_lote: 'PRO-26-018', cantidad_recibida: 3000,
    id_factura: invoiceWithDocument.id, ubicacion: 'Bodega Barranquilla', estado: 'cerrado',
    fecha_recepcion: '2026-10-30T02:00:00.000Z', fecha_estimada_batch_record: '2026-11-05T12:00:00.000Z',
    estado_batch_record: 'validado', fecha_entrega_batch_record: '2026-10-31T02:00:00.000Z',
    estado_inspeccion: 'aprobada', fecha_inspeccion: '2026-11-01T02:00:00.000Z', fecha_confirmacion: '2026-11-02T02:00:00.000Z',
  } });
  const lotWithoutDates = detailState.lote_producto.find((row) => row.id_orden_producto === detailLines[1].id);
  await invoke('saveLot', { row: { ...lotWithoutDates, numero_lote: 'PRO-PENDIENTE', id_factura: plainInvoice.id } });
  const alternateCorrugado = (await invoke('saveEntity', { entity: 'materiales', row: {
    nombre_material: 'Caja recomendada posterior', codigo_material: 998, id_tipo_material: sid(43),
  } })).row;
  await invoke('saveEntity', { entity: 'producto_corrugado', key: { id_producto: sid(70) },
    row: { id_producto: sid(70), id_material: alternateCorrugado.id, unidades_por_corrugado: 48 } });
  await page.goto(origin + '/ordenes/' + detailOrder.orderId);
  const firstLine = page.locator('.line-card').first();
  check((await firstLine.locator('.line-packaging').innerText()).includes('Caja corrugada · 24 unidades') &&
    !(await firstLine.locator('.line-packaging').innerText()).includes('Caja recomendada posterior'),
    'Ref. corrugado procede del renglón guardado después de cambiar la recomendación del catálogo');
  check(await firstLine.locator('.line-metadata dt').allTextContents().then((labels) =>
    labels.join('|') === 'Código de barras|Cantidad solicitada|Precio unitario|Recibido en lotes cerrados|Desviación / margen') &&
    await page.locator('.line-card').nth(1).locator('.line-packaging dt').last().innerText() === 'Cinta',
    'Código y resumen comercial comparten la cabecera; corrugado y sticker o cinta ocupan la franja secundaria');
  const lotRow = firstLine.locator('.product-lots-table tbody tr').first();
  const expectedDates = ['29/10/2026', '05/11/2026', '30/10/2026', '31/10/2026', '01/11/2026'];
  check(await lotRow.locator('time').allTextContents().then((dates) => dates.join('|') === expectedDates.join('|')),
    'Las cinco fechas muestran el día de Bogotá en dd/mm/aaaa, incluidos timestamps cercanos a medianoche');
  check(await page.locator('.line-card').nth(1).locator('.lot-date').filter({ hasText: 'Sin registrar' }).count() === 4,
    'Fechas ausentes del lote se muestran como Sin registrar');
  const invoiceLink = lotRow.getByRole('link', { name: 'Abrir documento de factura FECHAS-DOC', exact: true });
  check(await invoiceLink.getAttribute('href') === '/api/documents/' + invoiceDoc.id + '/content' &&
    await invoiceLink.getAttribute('target') === '_blank' && (await invoiceLink.getAttribute('rel')).includes('noopener'),
    'Número de factura con documento enlaza de forma segura a su documento vigente');
  await lotRow.focus();
  for(let step=0;step<20&&!await invoiceLink.evaluate(link=>link===document.activeElement);step++){
    await page.keyboard.press('ArrowRight');
    await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(ok)));
  }
  check(await invoiceLink.evaluate((link) => link === document.activeElement && getComputedStyle(link).textDecorationLine.includes('underline')),
    'El hipervínculo de factura admite foco de teclado y está subrayado');
  const popupPromise = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const invoicePopup = await popupPromise;
  await invoicePopup.waitForLoadState();
  check((await invoicePopup.locator('body').innerText()).includes('Factura-fechas-reemplazada.html'),
    'El hipervínculo abre el contenido del documento reemplazado');
  await invoicePopup.close();
  check(await page.locator('.line-card').nth(1).getByRole('link', { name: /FECHAS-SIN-DOC/ }).count() === 0 &&
    (await page.locator('.line-card').nth(1).locator('.lot-identity').innerText()).includes('FECHAS-SIN-DOC'),
    'Factura sin documento conserva su número como texto');
  for (const width of [375, 768, 815, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const pinned of (width >= 1024 ? [false, true] : [false])) {
      if (pinned) {
        const drawer = await openNavigation();
        await drawer.getByRole('button', { name: 'Fijar navegación', exact: true }).click();
        await finishLayoutTransition();
      }
      const layout = await firstLine.evaluate((line) => {
        const head = line.querySelector('.line-card-head'), code = line.querySelector('.line-code');
        const table = line.querySelector('.product-lots-table'), row = table.querySelector('tbody tr');
        const detail = line.querySelector('.line-content');
        const style = getComputedStyle(row), headStyle = getComputedStyle(head), codeStyle = getComputedStyle(code);
        const box = row.getBoundingClientRect();
        const batchDates = Array.from(row.querySelectorAll('.lot-batch-dates > .lot-date')).map((date) => date.getBoundingClientRect());
        const actionCell = row.querySelector('.lot-actions').getBoundingClientRect();
        const actionButtons = row.querySelector('.lot-actions .inline').getBoundingClientRect();
        const datesFit = Array.from(row.querySelectorAll('.lot-date')).every((date) => {
          const r = date.getBoundingClientRect(); return r.width > 0 && r.left >= box.left && r.right <= box.right + 1;
        });
        return { containerWidth: detail.clientWidth - parseFloat(getComputedStyle(detail).paddingLeft) - parseFloat(getComputedStyle(detail).paddingRight),
          mode: style.display, padding: style.paddingTop, rowGap: style.rowGap, columnGap: style.columnGap,
          headColor: headStyle.backgroundColor, accentWidth: headStyle.borderLeftWidth, accentColor: headStyle.borderLeftColor,
          codeFont: codeStyle.fontSize, codeWeight: codeStyle.fontWeight, codeFamily: codeStyle.fontFamily,
          datesFit, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          tableOverflow: table.scrollWidth > table.clientWidth + 1,
          batchDatesAdjacent: Math.abs(batchDates[0].top - batchDates[1].top) < 1 && batchDates[1].left > batchDates[0].right,
          compactActions: actionCell.width <= actionButtons.width + 26, rowHeight: box.height,
          allRowsRendered: Array.from(document.querySelectorAll('.product-lots-table tbody tr')).every((lot) =>
            getComputedStyle(lot).contentVisibility === 'visible' && getComputedStyle(lot).containIntrinsicSize === 'none'),
          titles: Array.from(row.querySelectorAll('.lot-section-title')).every((title) => getComputedStyle(title).display === 'block') };
      });
      const context = width + ' px, navegación ' + (pinned ? 'fijada' : 'flotante');
      const cards = layout.containerWidth < 720;
      check((layout.mode === 'grid') === cards && !layout.overflow && !layout.tableOverflow,
        'Lotes alternan tabla y tarjetas según el contenedor sin desborde a ' + context);
      check(!cards || (layout.padding === '16px' && layout.rowGap === '16px' && layout.columnGap === '12px' && layout.titles),
        'Tarjetas de lote conservan padding 16 px y separación 16/12 px a ' + context);
      check(layout.headColor === 'rgb(246, 248, 252)' && layout.accentWidth === '3px' && layout.accentColor === 'rgb(37, 99, 235)' &&
        layout.codeFont === '16px' && layout.codeWeight === '600' && layout.codeFamily.includes('monospace'),
        'Cabecera y código respetan paleta y tipografía de MASTER a ' + context);
      check(layout.datesFit && await lotRow.locator('time').allTextContents().then((dates) => dates.join('|') === expectedDates.join('|')),
        'Todas las fechas del lote permanecen visibles y dentro de sus límites a ' + context);
      check(layout.allRowsRendered, 'Todos los lotes se dibujan sin alturas provisionales al desplazarse a ' + context);
      check(!cards || (layout.containerWidth > 260 ? layout.batchDatesAdjacent : !layout.batchDatesAdjacent),
        'Batch record estimado y recibido comparten fila, con una columna en el contenedor estrecho a ' + context);
      check(cards || (layout.compactActions && layout.rowHeight <= 140), 'Tabla de lotes con columna de acciones ajustada y fila compacta a ' + context);
      if (!pinned || width === 815) {
        await page.locator('.page-heading h1').click();
        await page.mouse.move(0, 0);
        await shot('37-detalle-lotes-fechas-' + width + (pinned ? '-fijada' : ''));
      }
      if (pinned) {
        await page.locator('#app-navigation').getByRole('button', { name: 'Desfijar navegación', exact: true }).click();
        await finishLayoutTransition();
        await page.keyboard.press('Escape');
        await page.locator('#app-navigation').waitFor({ state: 'hidden' });
      }
    }
  }
  for (const [id, type] of [[manualMaterialId, 'material'], [otherId, 'otro']]) {
    const current = await state();
    const table = type === 'material' ? 'orden_material' : 'orden_otro';
    const line = current[table].find((row) => row.id_orden_compra === id);
    const supplier = current.orden_compra.find((row) => row.id === id).id_proveedor;
    const invoice = (await invoke('createInvoice', { id_proveedor: supplier, numero_factura: 'DETALLE-' + type, placeholder: true })).row;
    await invoke('saveReceipt', { entity: table, id: line.id, row: { id_factura: invoice.id } });
    await page.goto(origin + '/ordenes/' + id);
    await page.getByRole('link', { name: 'Abrir documento de factura ' + invoice.numero_factura, exact: true }).waitFor();
    check(await page.getByRole('link', { name: 'Abrir documento de factura ' + invoice.numero_factura, exact: true }).count() === 1,
      'Factura de recepción de ' + type + ' enlaza su documento asociado');
    check(await page.locator('.line-card-head').first().evaluate((head) =>
      getComputedStyle(head).backgroundColor === 'rgb(246, 248, 252)' && getComputedStyle(head).borderLeftWidth === '3px'),
      'El renglón de ' + type + ' comparte la cabecera distinguible');
    if (type === 'material') check(await page.locator('.line-code').first().evaluate((code) =>
      getComputedStyle(code).fontSize === '16px' && /^\d{3}$/.test(code.textContent)), 'Código MAIA también usa 16 px');
    await shot('39-recepcion-factura-documento-' + type);
  }
  check(errors.length === 0, "Sin errores JavaScript en los recorridos");
  check(
    responses.length === 3 && responses.every((r) => r.status === 422 && r.url.endsWith("/api/commands")),
    "Sin fallos HTTP inesperados; rechazos de adjunto faltante, producto inactivo y autorización durante revisión previstos",
  );
  return {
    date: new Date().toISOString(),
    checks,
    viewports,
    errors,
    responses,
    productId,
    materialId,
    otherId,
    individualId,
    manualMaterialId,
    replacementOrderId,
    detailOrderId: detailOrder.orderId,
  };
}
