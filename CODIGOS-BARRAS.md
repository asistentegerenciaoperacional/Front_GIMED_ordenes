# Códigos de barras: vigencia y asignación

Vigente desde el 20 de octubre de 2026. El esquema autoritativo es `../Planeacion/db.md`; el prototipo conserva sus 28 colecciones JSON y genera modelos/metadatos con `npm run models`.

## Estados y operaciones

| Estado | Significado | Badge existente |
| --- | --- | --- |
| Creado en GS1 | Registrado externamente, pendiente de verificar. | Ámbar |
| Verificado en sistema | Disponible para asociar a un producto. | Naranja |
| Activo | Vigente y asociado, disponible como alternativa. | Verde (`validado`) |
| Asignado | Único código del producto para nuevas órdenes. | Azul |
| Inactivo | Retirado; conserva asociaciones e historial. | Rojo |

Activo y Asignado son valores distintos del enum, ambos requieren producto. Asociar un verificado lo convierte automáticamente en Asignado y deja el anterior Activo. «Asignar código» recupera cualquier Activo del mismo producto, con confirmación que muestra ambas selecciones. Desactivar el asignado advierte y deja el producto sin selección; nuevas órdenes quedan bloqueadas hasta elegir otra. No se reactiva un Inactivo ni se cambia el producto de un código asociado en este flujo.

`advanceBarcode` exige estado original esperado y, al asociar/desactivar, `expectedAssignedId` (ID o null). `setAssignedBarcode` recibe `id`, `id_producto`, `expectedAssignedId` y `confirm: true`. La cola del store aplica cambios y validación en una sola transacción y escritura atómica. `BARCODE_CHANGED` actualiza el snapshot y conserva el diálogo; hay que revisar los datos actuales antes de reintentar. Fallos no guardan cambios parciales.

`assignedBarcode` reemplaza la inferencia por fecha. Crear o sustituir un producto en una orden usa el asignado; editar el mismo renglón conserva `id_codigo_barras`. Impresión, búsqueda e historial siguen consultando el código almacenado en la orden.

## Vistas y accesibilidad

La tabla muestra una fila por código, con búsqueda por código o producto, filtros y ordenamiento. Mantiene registro, verificación, asignación, inactividad y aviso de códigos nuevos. La selección utiliza identificadores, el proveedor de GS1 permanece bloqueado y las confirmaciones devuelven el foco al disparador. En móvil las columnas se desplazan dentro de la tabla.

Los cinco colores reutilizan estilos y conservan texto, tamaño y bordes. Contraste medido por Playwright ≥4,5:1. La variante verde se aplica mediante `Badge`; no se crea otra paleta ni se cambian los estados de otros procesos.

## Recuperación, compatibilidad y demo

Commit previo: `068cae7a43f13fd2e3aa0323998eb2faba259087`. Antes de cambiar el esquema se respaldaron la base y DBML en `data/database-before-barcodes-20261020.bak` y `data/schema-before-barcodes-20261020.md.bak`. Son archivos ignorados y no forman parte de la entrega portable. Hashes e informe: [delivery-report.json](tests/evidence/barcodes/delivery-report.json).

La apertura de bases antiguas convierte múltiples Asignados: conserva el seleccionado por la regla anterior (fecha UTC más reciente única) y pasa los demás a Activo. Fechas ausentes/ambiguas y referencias inválidas detienen la apertura y conservan el original. Validar toda la base antes del respaldo exacto y reemplazo atómico. Segunda ejecución no modifica datos. La conversión se compone con la migración de favoritos.

El restablecimiento completo de la demo fue solicitado expresamente: usar semilla validada con el servicio detenido y reemplazo atómico, conservando el respaldo. Incluye los cinco estados, dos alternativas para Crema, Sérum sin Asignado y Jabón sin códigos. Las aperturas normales nunca restablecen datos automáticamente.

## Verificación reproducible

`npm test`, `npm run build`; `node scripts/verify-aria-browser.mjs tests/barcodes.browser.js chromium` (también Firefox y WebKit), `tests/barcode-steps.browser.js`, `tests/favorites.browser.js` y recorrido completo `tests/browser-journey.js`. Firefox en Windows admite la copia temporal indicada en VERIFICACION.md. Las pruebas usan bases aisladas.

Rendimiento: compilar el commit de recuperación en `tests/.tmp/barcodes-baseline/dist`; ejecutar `scripts/measure-aria.ts baseline` con `ARIA_DIST` apuntando allí y después `scripts/measure-aria.ts after` con la compilación nueva. Usar `ARIA_BASELINE_COMMIT=068cae7a43f13fd2e3aa0323998eb2faba259087`, `ARIA_EVIDENCE=tests/evidence/barcodes` y el mismo `ARIA_GUARD_FILE` respaldado en ambas fases. `node scripts/compare-aria.mjs` aplica los límites acordados sobre equipo actual: P95 interacción +máx(15 %,20 ms), carga +máx(15 %,100 ms), heap estable +máx(15 %,5 MB), con 6.000/60.000 lotes deterministas. CPU 4× es solo estrés y no condiciona aceptación.

Informes, capturas a 375/768/1024/1440 px y comparación: [tests/evidence/barcodes](tests/evidence/barcodes).

El restablecimiento se ejecuta mediante `npx tsx scripts/reset-demo.ts --confirm-reset`, con el servicio detenido; guarda un respaldo adicional exacto, reemplaza atómicamente y registra `demo-reset.json`. La entrega actual restableció 6 productos y 10 códigos (4 Asignados, 3 Activos y uno en cada estado restante). El servicio se reinició y se verificó mediante su API. Las capturas de la tabla se generan en el recorrido de navegador aislado.
