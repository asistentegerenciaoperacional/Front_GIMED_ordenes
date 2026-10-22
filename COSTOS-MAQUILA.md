# Costos de maquila: periodos y consulta agrupada

Vigente desde el 22 de octubre de 2026. El esquema autoritativo continúa en `../Planeacion/db.md`; se conservan las 28 colecciones y los comandos `saveEntity`/`deleteEntity`.

## Restricciones y selección del costo

Producto, costo e inicio son obligatorios. El costo es un entero seguro mayor que cero, expresado en pesos; la fecha final es opcional. Las fechas representan días de America/Bogota y ambos extremos son inclusivos. Un periodo cerrado puede durar un solo día y puede haber huecos entre periodos. El siguiente periodo debe empezar después del día final del anterior.

Los periodos del mismo producto nunca se solapan: se rechazan rangos contenidos, parciales, idénticos y días límite compartidos. Existe como máximo un periodo sin final, cuyo inicio es posterior a todos los periodos cerrados. Primero se guarda el cierre del anterior y después se agrega otro abierto; no hay cierres o ajustes de fechas automáticos. Una edición excluye su propio ID. Productos homónimos siguen siendo entidades distintas.

`shared/maquila-costs.ts` comparte la validación entre formulario, validación en vivo y servicio. La integridad de toda la colección se comprueba ordenando por producto e inicio, en O(n log n). La transacción del store valida contra los datos actuales, de modo que dos solicitudes concurrentes no pueden crear periodos incompatibles. `COST_PERIOD_CONFLICT` identifica los campos de fecha y el costo incompatible; actualiza el snapshot del cliente y conserva el borrador. Los errores de campos obligatorios e importe utilizan la validación habitual.

`currentCost` consulta el intervalo que cubre la fecha indicada, incluyendo todo el último día. Un periodo futuro no se anticipa. Si ningún periodo cubre hoy, no se elige un sustituto histórico; se conserva el aviso y comportamiento existentes en órdenes. Editar o eliminar costos no recalcula precios almacenados en órdenes.

## Lista y formulario

Catálogos → Productos → Costos de maquila utiliza `GroupedRelationsTable`. Cada producto muestra nombre, conteo, despliegue y botón +. Los grupos se ordenan alfabéticamente y el historial por inicio descendente. Productos con nombres iguales incluyen maquilador e identificador abreviado. El detalle conserva importe, inicio, final y acciones.

El selector **Filtro personalizado de costos**, junto a Agregar, comienza en **Con costos** y permite **Todos los productos**, incluidos inactivos. Los productos vacíos conservan el + y deshabilitan el despliegue. Buscar producto, importe o fecha (texto mostrado, ISO o dd/mm/aaaa) abre las coincidencias con su historial completo. El pie cuenta los productos y costos de la consulta.

Agregar general usa el selector de productos existente. El + abre el mismo formulario con producto seleccionado y bloqueado. El lápiz permite editar un costo. Guardar actualiza los conteos y mantiene abierto el grupo afectado. Los formularios conservan errores y borrador, impiden envíos duplicados y bloquean cierre durante el guardado. Cancelar con cambios pide confirmación; cancelar el descarte conserva el borrador.

El lápiz y la papelera del historial aparecen al hacer hover sobre la fila o al entrar su foco de teclado; en dispositivos táctiles permanecen visibles. Se reserva el ancho de las acciones para evitar movimientos. El + del producto permanece visible. Eliminar utiliza la confirmación destructiva compartida. El cierre recupera foco y scroll; si desaparece el grupo de origen, enfoca Agregar. Los detalles reutilizan sangría, animación y movimiento reducido de favoritos; el desbordamiento horizontal es interno. La cabecera se adapta al ancho móvil conservando juntos filtro y Agregar.

## Recuperación y compatibilidad

Commit previo: `62410899848934140d0c2543962afe6c84169b7a`. Los respaldos exactos de base y DBML se conservan, ignorados por Git, en `data/costs-recovery-20261022T153204555Z/`. Sus hashes están en [recovery.json](tests/evidence/costs/recovery.json).

La corrección autorizada retiró exclusivamente el registro `e86e766ec339006bdbb45239`: $2.000 de Crema corporal, 01/11/2025–01/11/2026. `scripts/correct-maquila-cost.ts` requiere servicio detenido, respaldo byte a byte coincidente e identidad completa del registro; valida la base resultante antes del reemplazo atómico. No modifica las otras colecciones ni otros costos. Una segunda ejecución o una identidad diferente se rechaza. [Informe de corrección](tests/evidence/costs/data-correction.json).

No existe una migración que borre o cierre periodos de otras bases automáticamente. Bases antiguas incompatibles se rechazan con el informe de campos o periodos, conservando su archivo original. Deben corregirse explícitamente antes de utilizarlas. Las semillas ya cumplen las nuevas restricciones.

## Verificación reproducible

Ejecutar `npm test`, `npm run build`, y `node scripts/verify-aria-browser.mjs tests/maquila-costs.browser.js chromium`; repetir con `firefox` y `webkit`. El recorrido incluye los cuatro anchos 375/768/1024/1440 y un contexto táctil. En Windows, Firefox puede utilizar `PROTOTIPO_FIREFOX_EXECUTABLE=tests/.tmp/firefox-runtime/firefox.exe`. Las pruebas usan datos temporales aislados.

Los informes de [tests/evidence/costs](tests/evidence/costs) registran pruebas, capturas reales y comparación de producción. La referencia de rendimiento corresponde al commit de recuperación, con datos deterministas de 6.000/60.000 lotes y el mismo navegador/equipo. Además de las interacciones generales, se comparan carga, búsqueda, limpieza y apertura/cierre de edición de costos; expansión/colapso son métricas nuevas sin equivalente en la lista anterior. Los tiempos comienzan en eventos reales y terminan tras pintar el resultado; excluyen la automatización.

`scripts/measure-aria.ts` y `scripts/measure-costs.ts` generan ambas fases. `scripts/compare-aria.mjs`, seguido por `scripts/compare-costs.mjs`, aplica P95 +máx(15 %,20 ms) para interacciones, +máx(15 %,100 ms) para carga y +máx(15 %,5 MB) para heap tras GC. `scripts/benchmark-costs.mjs` reproduce la secuencia. CPU 4× es solo estrés separado; no altera estos límites.

El [informe de entrega](tests/evidence/costs/delivery-report.json) reúne resultados, hashes de recuperación y conservación de datos. Las capturas `current-groups-*` y `current-add-*` muestran la base local a los cuatro anchos; su generación comprueba que no se envíen escrituras a la API.
