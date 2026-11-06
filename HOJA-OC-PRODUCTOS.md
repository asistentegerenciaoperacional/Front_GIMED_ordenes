# Hoja alternativa de OC de productos

Rama: `codex/hoja-oc-productos`, creada desde `master` en `931b0fb`. Los cambios locales previos se conservan en el área de trabajo.

## Activación y presentación

Configuración → Apariencia → **Vista alternativa de la tabla de OC de productos**. Desactivada por defecto; clave local `gimed:ui:product-order-sheet`. La preferencia de creación de órdenes es independiente. Materiales/OCM conserva su tabla clásica. El módulo y sus estilos se cargan al utilizar la hoja.

La hoja ocupa el ancho disponible, con una cinta compacta de dos filas en escritorio, sin tarjetas de resumen ni paginación. La cinta puede ocultarse y recuperarse desde un control siempre accesible. En móvil conserva desplazamiento horizontal interno. Los encabezados reutilizan `ColumnHeader`, sus filtros y ordenamiento; permanecen visibles verticalmente. Ninguna columna queda fija horizontalmente.

El cuerpo utiliza filas de 32 px, texto de 12 px, bordes finos y cifras alineadas a la derecha. Blanco representa seguimiento, verde suave cierre y rojo suave anulación. La selección dibuja bordes azules y conserva el color del lote; el estado también se comunica mediante la etiqueta accesible de la fila. Las columnas elegidas se recuerdan por hoja en `gimed:ui:product-sheet-columns:<hoja>`; siempre queda una visible.

## Hojas y propiedad de los datos

**No autorizadas** muestra una fila por renglón y nueve columnas: No. de orden, Código de barras, Producto, Cantidad solicitada, Precio unitario, Proveedor, Fecha de elaboración, Fecha solicitada de entrega y Fecha estimada de batch record. Seleccionar parte de una OC incluye todos sus renglones en la autorización, aunque estén filtrados. El rango y la inclusión de la OC se distinguen visualmente.

**En seguimiento** muestra lotes abiertos y cerrados de OC autorizadas. **Anuladas** muestra sus lotes anulados. La clasificación depende del lote. Ambas hojas tienen estas 24 columnas, en orden:

1. No. de orden
2. Factura
3. Lote
4. Código de barras
5. Producto
6. Cantidad solicitada
7. Cantidad recibida
8. Precio unitario
9. Proveedor
10. Sticker
11. Cinta
12. OCM vinculadas
13. Referencia de corrugado
14. Cantidad de corrugado
15. Fecha de elaboración
16. Fecha solicitada de entrega
17. Fecha estimada de batch record
18. Fecha de entrega de batch record
19. Estado batch record
20. Fecha de inspección
21. Inspección
22. Fecha de recepción
23. Fecha de confirmación
24. Ubicación

Cada fila conserva los identificadores de cabecera, renglón y lote. Los cambios de cabecera se repiten en la OC; los de renglón, en sus lotes; los de lote afectan únicamente a ese registro. La selección y el borrador utilizan esas identidades, no posiciones visibles.

No. de orden, código de barras, OCM vinculadas y saldos calculados son de lectura. Proveedor y producto quedan bloqueados después de autorizar. Cambiar proveedor antes de autorizar utiliza el reemplazo completo y confirmado existente. La estimada de batch de No autorizadas sigue la entrega de cabecera; después de autorizar mantiene su seguimiento independiente.

Las OCM vinculadas se resuelven por renglón y se repiten en sus lotes. Se muestran sus números y un tooltip con los materiales específicos, accesible con cursor, foco y toque.

## Saldo, selección e interacción

El saldo anterior a cada lote utiliza el orden de creación de la colección, independientemente de filtros y ordenamiento:

`max(0, solicitada original − recibidas de lotes anteriores no anulados)`

Incluye recibidas de abiertos y cerrados, y excluye anulados. La solicitada original se edita desde el primer lote. Una sobreentrega se señala con cero y un triángulo ámbar que explica las unidades de más por cursor, foco o toque. La desviación comercial mantiene su cálculo con lotes cerrados.

Clic selecciona; Shift+clic y Shift+flechas extienden un rectángulo. Doble clic, F2 o escritura inicia edición. Enter confirma y baja; Escape cancela esa edición. Desplegables y calendarios tienen prioridad. Tab permite salir de la navegación cuando no se está editando. Una región accesible anuncia fila, columna y valor.

Las acciones alcanzan todas las filas del rango, deduplicando OC, productos y lotes. Cambiar hoja, búsqueda, filtro u ordenamiento limpia la selección y conserva el borrador. Las filas mantienen posición y pertenencia durante la captura; se recalculan al guardar o aplicar explícitamente una consulta. Los errores ofrecen acceso a su celda, mostrando su columna o retirando filtros si es necesario.

Los atajos de la hoja son **Alt+O** nueva orden, **Alt+A** autorizar, **Alt+H** ocultar columnas seleccionadas, **Alt+S** mostrar todas, **Alt+D** nuevo lote, **Alt+C** cerrar, **Alt+N** anular, **Alt+R** reabrir y **Alt+Supr** eliminar lotes. Las acciones respetan la selección y los permisos de sus botones; no se ejecutan mientras se edita un campo o hay un diálogo abierto.

La papelera elimina los lotes seleccionados de órdenes autorizadas tras una confirmación. Para varios lotes, el diálogo enumera cada lote con su producto y OC; la operación se valida y guarda de forma atómica, comprueba el snapshot y conserva las facturas y sus documentos.

**Nuevo lote** prepara uno por renglón distinto con campos y restricciones existentes, sin copiar recepción, factura ni inspección de otro lote. El diálogo identifica OC, posición y producto. **Imprimir** y **Ver orden escaneada** requieren exactamente una OC distinta; varias filas de la misma OC son válidas.

## Portapapeles y recuperación

Copiar/Pegar y Ctrl/Cmd+C/V utilizan matrices TSV con comillas, tabulaciones y saltos de línea compatibles con Excel. Las fechas admiten `dd/mm/aaaa` o `aaaa-mm-dd`; las cantidades e importes admiten el formato colombiano y números sin separadores de miles.

Los destinos se fijan según filas y columnas visibles al comenzar el pegado. Se comprueba protección antes del contenido, luego tipos y reglas relacionadas. Se preparan las celdas válidas y se resumen/señalan las rechazadas, sin desplazar valores. Asignaciones contradictorias al mismo dato compartido se rechazan conjuntamente. Las referencias deben existir y ser inequívocas; el pegado no crea entidades ni lotes.

Solo **Guardar** persiste las ediciones de la hoja. El borrador local versionado contiene fecha, destino, original y cambio pendiente en `gimed:draft:product-order-sheet:v1`. Al encontrar una copia se ofrecen Recuperar/Descartar con fecha y cantidad; puede revisarse después de cerrar el aviso inicial. Recuperar sustituye la sesión actual y permite seguir editando, sin escribir en la base. Fallos de almacenamiento se comunican y los cambios permanecen en memoria.

Guardar compara originales y revalida permisos y relaciones contra los datos actuales. La transacción es todo o nada; conflictos y errores conservan el borrador. Antes de autorizar, cambiar estados, crear lotes o reemplazar proveedor se ofrecen Guardar y continuar / Descartar y continuar / Cancelar.

## Filtros personalizados

Se combinan con búsqueda y filtros de columna en la hoja actual. Las fechas corresponden al día de Bogotá. Recibido significa cantidad positiva o fecha de recepción.

| Variantes | Coincidencia |
| --- | --- |
| Con / sin orden escaneada | Documento de cabecera. |
| Recepciones sin factura | Lote recibido sin factura. |
| Entrega solicitada vencida | Entrega anterior a hoy, lote abierto y saldo global del renglón positivo. |
| Próximas entregas 7 / 15 / 30 días | Hoy hasta el límite inclusivo, lote abierto y saldo global positivo. |
| Sin recepciones registradas | Lote sin cantidad positiva ni fecha de recepción. |
| Batch record vencido | Lote abierto con estimada anterior a hoy y sin entrega de batch. |
| Producto recibido sin batch | Lote recibido sin entrega de batch. |
| Inspección pendiente | Entrega de batch existente y fecha de inspección vacía. |
| Recibidos sin inspección | Lote recibido sin fecha de inspección. |
| Confirmación pendiente | Lote recibido sin fecha de confirmación. |
| Con / sin vínculos | Vínculos del renglón. |
| OCM vinculadas pendientes | Material vinculado en seguimiento, aunque tenga toda su cantidad recibida. |

## Servicio y ciclo global de estados

`POST /api/commands` incorpora `saveProductOrderSheet`, `createProductLots`, `setProductLotStates`, `setProductLineStates` y `deleteLots`. El guardado mixto admite cambios de `orden_compra`, `orden_producto` y `lote_producto`, con `{entity,id,field,expected,value}`. El servidor verifica campos permitidos, tipos, propietarios, originales y relaciones. Aplica juntos los lotes mediante el motor compartido y mantiene la transacción del almacén. Los comandos admiten cuerpos de hasta 16 MB; los demás endpoints mantienen su límite anterior.

Conflictos de originales o snapshots responden HTTP 409 con `SHEET_CHANGED` o `LOT_STATE_CHANGED`. El proveedor utiliza su flujo de reemplazo confirmado. Los errores incluyen destinos para localizar las celdas.

Anular conserva lotes y datos. El estado del producto se guarda al cambiar sus lotes: alguno abierto lo mantiene en seguimiento; ninguno abierto y alguno cerrado lo cierra; todos anulados o ningún lote lo anulan. Reabrir un lote o crear uno abierto reactiva el producto sin cambiar sus hermanos. Se elimina el menú Productos y el filtro Seguimiento por cerrar; la tolerancia queda informativa. Nuevo lote admite productos cerrados/anulados autorizados. Eliminar físicamente sigue siendo una operación distinta. Detalles y snapshots: [CICLO-LOTES.md](CICLO-LOTES.md).

## Virtualización y verificación

La ventana monta las filas visibles y aproximadamente seis adicionales por lado, con espaciadores y posiciones accesibles globales. Selección y edición viven fuera de los nodos montados. Las pruebas de volumen generan una base temporal con más de 5.000 lotes, recorren el scroll, navegan a filas no montadas y guardan 5.000 cambios en una sola operación.

Estándar visual: [design-system/MASTER.md](design-system/MASTER.md). Comandos, resultados y evidencias: [VERIFICACION.md](VERIFICACION.md).

## Corrección de congelamiento y rendimiento

Checkpoint de recuperación previo a la reparación: `d4273e5`. Se reprodujo el bloqueo usando Vite y React de desarrollo con StrictMode. El inspector de cambios de React consultaba propiedades internas del `Proxy` de celdas; este suponía que cualquier propiedad era una columna y lanzaba `Cannot read properties of undefined (reading 'key')`. El fallo ocurría al actualizar props de la tabla, aunque la operación de servicio hubiera terminado. La compilación de producción no ejecutaba ese inspector, por lo que las pruebas anteriores no lo detectaron.

Las celdas ahora utilizan lectores finitos de columnas conocidas, con caché privada y propiedades no enumerables. Las propiedades ajenas a las columnas siguen el comportamiento normal de un objeto; inspección y serialización no disparan cálculos ni excepciones. Los filtros consultan únicamente columnas con condiciones activas; sin condiciones conservan el array. Una superposición vacía conserva la identidad de la base. La hoja comparte el modelo de lectura entre proyección y datos actuales y no lo reconstruye al cambiar únicamente una consulta. Las columnas y opciones abiertas permanecen estables; los marcadores de edición/error utilizan índices `Set`.

El scroll actualiza la ventana al cambiar de fila, no por cada píxel. El adaptador evita invalidar el renderizador por cambiar un objeto de fila que conserva ID y evita escrituras redundantes de atributos accesibles. Los avisos de error mantienen su identidad entre renders para no repetir foco y desplazamiento.

Los menús con más de 50 valores presentan grupos de 50, con Anterior/Siguiente y conteo. La búsqueda abarca todas las opciones y cambiar de grupo conserva las selecciones. El resumen de errores también monta como máximo 50 enlaces con navegación al resto; la colección completa de errores sigue disponible y cada enlace localiza su celda estable. Esto no introduce paginación en las filas de la hoja, que continúan virtualizadas.

La medición local del modelo con 20.000 lotes, mediana de cinco muestras, pasó de **480,59 a 2,15 ms** sin filtros, de **492,21 a 27,15 ms** con un filtro y de **477,72 a 21,72 ms** al filtrar/ordenar. Son tiempos del procesamiento del modelo, no del recorrido completo del navegador. Evidencias: [antes](tests/evidence/product-sheet-performance/model-before.json) y [después](tests/evidence/product-sheet-performance/model-after.json).

El runner admite `$env:PROTOTIPO_BROWSER_MODE='development'` para ejecutar la aplicación real con Vite/StrictMode y proxy a una base temporal. Sin esa variable usa `dist`. Los reportes de desarrollo se distinguen con `development-` en el nombre. El recorrido `product-order-sheet-performance.browser.js` ejecuta consecutivamente cambios de filtros, hoja, búsqueda, columnas, selección, edición, guardado, pegado/descarte y diálogos con más de 5.000 lotes, sin recargar entre acciones. Comprueba respuesta, ausencia de errores y DOM acotado, incluidos pegados de 5.000 celdas válidas/protegidas.
