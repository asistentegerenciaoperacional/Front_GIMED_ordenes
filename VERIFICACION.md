# Verificación del prototipo

## Hoja alternativa de creación — 27 de octubre de 2026

Compilación de producción y **267 pruebas automatizadas aprobadas**. Las pruebas nuevas cubren siete posiciones, claves estables, compactación con huecos, correspondencia de errores de cantidad/precio con las posiciones compactadas, conservación de filas parciales (cero, fracción, cantidad/precio inválido, consulta pendiente y concepto), separación de metadatos visuales del payload y preferencia local con recuperación ante escritura bloqueada.

**Chromium y WebKit: 56 comprobaciones por motor**, con cuatro órdenes guardadas por recorrido en bases temporales. Incluyen los tres tipos de orden, siete posiciones, selección por autocompletado, navegación con flechas/Enter, prioridad del menú abierto, calendario, subtotales y total exactos, compactación `1,3 → 1,2` y `2,4,5 → 1,2,3`, errores en las nuevas posiciones, vaciado de la fila activa, cancelación, revisión y regreso, guardado sin metadatos de UI, OCM desde Abastecimiento con materiales bloqueados y conservación de bases/orígenes/adicionales. También comprueban edición clásica de una orden creada, impresión existente, ancho mínimo/ausencia de desborde a 375 px, preferencia desactivada por defecto, persistencia tras recarga y funcionamiento en sesión con almacenamiento bloqueado. Sin errores ni advertencias de React/React Aria.

Regresiones actuales aprobadas en Chromium: **27 comprobaciones de fechas de creación** y **26 de entrega de OCM desde Abastecimiento**, con modo alternativo desactivado, a 375 y 1440 px. Conservan los rechazos de API, el foco del banner y el borrador ante errores. Las capturas de la hoja en escritorio y móvil se revisaron visualmente.

Dos recorridos históricos adicionales no completaron: `form-validation.browser.js` intenta editar la fecha automática de elaboración, actualmente de solo lectura; `material-demand.browser.js` espera que no exista consulta inicial, aunque el comportamiento vigente carga pendientes sin rango. Son expectativas anteriores a esta implementación; no se modificó la aplicación para satisfacerlas. La validación relevante está cubierta por los recorridos actuales indicados arriba y por el nuevo recorrido completo.

[Chromium](tests/evidence/aria/chromium-order-entry-sheet.browser.json), [WebKit](tests/evidence/aria/webkit-order-entry-sheet.browser.json), [hoja en escritorio](tests/evidence/aria/order-entry-sheet-1440.png), [hoja en móvil](tests/evidence/aria/order-entry-sheet-375.png), [panel auxiliar de OCM](tests/evidence/aria/order-entry-sheet-supply.png).

Reproducción con bases temporales:

    npm test
    npm run build
    node scripts/verify-aria-browser.mjs tests/order-entry-sheet.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/order-entry-sheet.browser.js webkit
    node scripts/verify-aria-browser.mjs tests/order-creation-date.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/material-demand-delivery.browser.js chromium

Verificación general del **13 de octubre de 2026**, con Node.js 24 y Google Chrome, utilizando Playwright CLI. El recorrido principal utiliza archivos de datos separados del estado de la aplicación; la revisión adicional de errores usa formularios aislados en memoria. La implementación conserva los datos existentes y no reinicia el archivo de demostración.

La [cobertura](COBERTURA.md) relaciona los resultados con los requisitos actuales. La revisión específica de renglones del **14 de octubre de 2026**, descrita al final, añade las pruebas de despliegue, presentación y reapertura OCM.

## Resultados

| Comprobación                        | Resultado y evidencia                                                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos, relaciones, reglas y filtros | **126 pruebas correctas**, sin fallos. `tests/domain.test.ts`, `tests/documents.test.ts`, `tests/order-lifecycle.test.ts`, `tests/order-rules.test.ts`, `tests/product-lots.test.ts`, `tests/precision.test.ts`, `tests/interface.test.ts`, `tests/order-table.test.ts`, `tests/order-filters.test.ts`, `tests/invoice-table.test.ts`, `tests/supply-table.test.ts` y `tests/live-errors.test.ts`. [Resultado TAP](tests/evidence/domain-tests.tap). |
| Recorrido automatizado de navegador | **598 comprobaciones correctas**, incluidas búsquedas combinadas con filtros de facturas y vínculos, columnas de abastecimiento, desasignación de facturas y adjunto preparado durante su creación. `tests/browser-journey.js` y [reporte de navegador](tests/evidence/browser-report.json). |
| Filtros personalizados y rendimiento visual | **52 comprobaciones correctas**, 17 variantes y 153 cambios medidos en tres escenarios. [Reporte de filtros](tests/evidence/order-filters-browser-report.json), [benchmark](tests/evidence/order-filter-benchmark.json) e [informe](RENDIMIENTO.md). |
| Corrección de errores en formularios aislados | **43 comprobaciones correctas**, sin errores JavaScript ni registros guardados. [Reporte adicional](tests/evidence/live-errors-side-report.json). |
| Reinicio del servicio               | Las **28 colecciones** recuperadas coinciden íntegramente con el archivo guardado. `scripts/verify-persistence.mjs` y `tests/evidence/restart-report.json`.           |
| Compilación                         | TypeScript y Vite completan `npm run build`. Vite conserva un aviso de tamaño: el bloque JavaScript principal mide 506,38 kB minificado (144,52 kB gzip), frente al umbral de 500 kB. |
| Portable Windows x64 | **17 comprobaciones correctas** el 13 de octubre. [Reporte del paquete](tests/evidence/portable-report.json) y [SHA-256](../GIMED-Prototipo-Windows-x64.sha256.txt). |
| Tamaños de pantalla                 | 375, 708, 768, 815, 1024 y 1440 px: ancho de documento igual al ancho disponible; las tablas usan su propio desplazamiento horizontal. |
| Impresión                           | Siete posiciones, total, firmas y controles ocultos al imprimir. `tests/evidence/orden-producto.pdf`: una página A4 horizontal en la muestra revisada.                |
| Errores del navegador               | Sin errores JavaScript. Tres rechazos HTTP **422 previstos** desde la interfaz: correo sin el documento necesario, producto desactivado y autorización durante la revisión del reemplazo. Los rechazos de solicitudes directas se comprueban por separado. |
| Datos de demostración | Esta implementación no reinicia datos. La semilla actual representa productos anulados sin lotes; cargar registros heredados los conserva hasta una operación confirmada. El [reporte del reinicio previo](tests/evidence/demo-reset-report.json) corresponde a una etapa anterior del día, con ocho lotes en aquella semilla. |

Las pruebas de servicio abarcan R01–R13, reserva simultánea de consecutivos, siete posiciones, facturas duplicadas y proveedores incompatibles, propiedad y documentos repetidos por propietario/clase, incluida la plantilla global, exclusión sticker/cinta, autorización irreversible, históricos, redondeo exacto, cierre manual, tolerancias y correo confirmado antes de guardar. Una operación rechazada conserva el archivo anterior y los números disponibles.

El recorrido de navegador crea órdenes de producto, material y otros con sus renglones y lotes iniciales de producto, edita antes de autorizar, autoriza, completa el lote y registra recepción, crea y selecciona una factura desde el lote, guarda documentos, simula correo, consulta vínculos entre órdenes, modifica la tolerancia, recorre etapas de códigos y consulta un código antiguo. Comprueba también búsqueda sin coincidencia exacta, campos inválidos, estados vacíos, pestañas con teclado y navegación móvil.

En **Facturas** se verificó el registro sin recepciones, la consulta del detalle y la asociación posterior de una recepción existente del mismo proveedor. Se comprobó el guardado de la asociación y la conservación íntegra de los lotes de producto y material. Los formularios de registro y asociación se revisaron a 375, 708 y 1440 px; sus acciones y contenido permanecen dentro del área disponible. Las capturas de ambos formularios y del detalle se inspeccionaron visualmente.

## Búsquedas de facturas y vínculos

Se comprobó la búsqueda normalizada por factura, proveedor y orden, lote o producto asociado. En vínculos se consultaron números con y sin prefijos OC/OCM, con variantes de espacios y mayúsculas, comprobando que cada prefijo distingue su grupo. Ambas barras se combinan con filtros de columna y ordenamiento, recuperan la consulta desde la URL y conservan el foco al escribir. Limpiar búsqueda conserva filtros y ordenamiento; limpiar filtros conserva búsqueda y ordenamiento. Los estados sin coincidencias mantienen barras y cabeceras. Las capturas a 375 y 1440 px se inspeccionaron visualmente; los datos guardados de usuario conservaron su SHA-256.

## Abastecimiento, desasignación y adjunto de factura

Las pruebas de abastecimiento verifican las columnas numéricas separadas de OC y OCM, texto de producto/maquilador y material/proveedor, valores de estado, combinación de filtros, ordenamiento y recuperación de URL. El navegador recorre los cinco menús, mantiene las cabeceras sin coincidencias y comprueba la tabla, el contador y el foco a 375, 768, 1024 y 1440 px. Lotes y certificados conserva su consulta propia.

Se desmarcó un lote de AUR-00128, se ocultó mediante la búsqueda y se guardó. Al recargar, ese lote conservó todos sus datos salvo `id_factura: null`; los demás lotes, la factura y sus documentos quedaron iguales. Se comprobó también la desasignación de recepciones de material y otros, el bloqueo sin autorización y el rechazo de otro propietario o una selección contradictoria. Un fallo posterior de proveedor revierte tanto asignaciones como desasignaciones y conserva el archivo completo.

Adjuntar documento desde la creación abrió el mismo formulario de placeholder, con Factura física y nombre de archivo. Preparar el adjunto conservó íntegramente el estado guardado y dejó visible el formulario de factura; guardar la factura persistió conjuntamente su documento y asociaciones. Las pruebas rechazan metadatos inválidos y recepciones incompatibles sin dejar registros huérfanos. Se inspeccionaron las capturas `51-abastecimiento-columnas-375.png`, `51-abastecimiento-columnas-1440.png`, `52-factura-adjunto-placeholder.png` y `53-factura-desasignacion.png`.

## Drawer y selección de lotes: 13 de octubre

La fijación se comprobó a 1024 y 1440 px. A 375 y 768 px el botón está ausente. Reducir un panel fijado desde escritorio a 1023, 708 y 375 px lo convirtió en diálogo flotante, liberó su columna, bloqueó el fondo y enfocó su cierre. Volver a escritorio conservó el modo flotante y recuperó la opción de fijar. El recorrido mantiene las comprobaciones de teclado, navegación y contenido para los anchos permitidos.

La factura AUR-00128 abrió con sus asociaciones marcadas y sin cambios pendientes. Buscar y limpiar la búsqueda conservó las casillas. Cancelar, reabrir y guardar la selección precargada mantuvo sus asociaciones. Se inspeccionaron `49-drawer-redimensionado-375.png` y `50-factura-lotes-precargados.png`. El recorrido utiliza un archivo aislado; los datos de usuario permanecieron intactos.

## Filtros de columnas de Facturas

Las diez pruebas de `tests/invoice-table.test.ts` verifican texto normalizado con ceros y signos, consulta del proveedor por nombres y NIT, intervalos por día de Bogotá, cantidades enteras con cero, selección múltiple, combinación de columnas, ordenamiento y recuperación de URL. La presencia documental corresponde al propietario factura; las condiciones y el ordenamiento ajenos a las columnas disponibles se descartan al leer una URL.

El recorrido de navegador comprobó los cinco menús, la combinación de proveedor y recepciones, la consulta de cero recepciones, los intervalos y su error enfocado, el ordenamiento de texto, fecha y cantidad, y la recarga de una URL filtrada. Documentos muestra exactamente **Con documento** y **Sin documento**, y sus resultados coinciden con el archivo de cada factura. Pulsar el texto del valor alterna la casilla manteniendo el menú abierto. El estado vacío conserva las cabeceras y permite quitar el filtro para recuperar el listado completo.

Se comprobaron altura limitada, desplazamiento interno, acciones visibles, Escape con retorno del foco y tabla con desplazamiento propio a 375, 768, 1024 y 1440 px. Se inspeccionaron las capturas de escritorio y móvil. Los menús reutilizan el componente de Órdenes, cuyo recorrido y pruebas también pasaron. Las operaciones de esta consulta no guardan cambios de negocio.

## Filtros personalizados y lectura indexada

Los 13 filtros y sus 17 variantes se verificaron con cantidades vacías, cero y positivas; fechas parciales; cierres y anulaciones; renglones sin lotes; varios lotes con condiciones diferentes y límites de fecha de Bogotá. Las condiciones se cumplen en el mismo lote. Inspección pendiente y Recibidos sin inspección se probaron separadamente y con coincidencia. El caso de la OCM 150 con cajas cerradas para OC 2806 y etiquetas pendientes para OC 2807 muestra únicamente OC 2807.

El catálogo TypeScript coincide con las descripciones de [filtros.md](../filtros.md). Las pruebas de lectura comprueban estados, totales, búsqueda, propiedad documental, ambas direcciones del abastecimiento, conservación de registros y actualización al cambiar el snapshot. La referencia independiente coincide en las 34 comparaciones de las 17 variantes con 6.000 y 60.000 lotes.

El recorrido adicional pasó 52 comprobaciones: selector único, URL, columnas y búsqueda combinadas, opciones de columna sobre todas las páginas, máximo 50 órdenes montadas, reinicio de página, recuperación del filtro/página/scroll desde detalle e impresión, tipos compatibles, ayuda con 13 descripciones, Tab y Escape con devolución del foco. Retirar el personalizado conserva columnas y limpiar ambos conserva búsqueda. Guardar un documento actualiza la selección Sin documento y recargar mantiene el filtro. Una búsqueda exacta diferencia órdenes excluidas de inexistentes.

Las selecciones reutilizaron el snapshot y el modelo; cambiar de filtro no generó solicitudes HTTP ni recorridos de lotes. Se verificaron medianoche de Bogotá y recuperación del foco sin descargar datos. El navegador no registró errores JavaScript. Se inspeccionaron las capturas de escritorio, móvil y tablet con navegación fijada.

En la versión compilada, el p95 de actualización visible fue **32,3 ms con 6.000 lotes** y **31,6 ms con 60.000** en escritorio. En móvil simulado con CPU 4× fue **82,4 ms con 6.000**. El objetivo de 200 ms se cumplió para interacción en el equipo de prueba. La carga inicial observada fue de 132,4 y 894,3 ms respectivamente; son observaciones individuales con API en memoria y recursos ya visitados. El [informe de rendimiento](RENDIMIENTO.md) detalla preparación, HTTP, metodología, límites y recomendación para producción.

El archivo `data/database.json` conservó el SHA-256 `e48b8e9bb7e118cdd4531fa748299907d61907de54c8186c218361608532eba7`. Las pruebas usaron datos independientes y no migraron ni reiniciaron el estado del usuario.

El [reporte de entrega](tests/evidence/review-order-filters.json) reúne las comprobaciones, las medidas, la conservación de datos y la coincidencia exacta de los archivos compilados incluidos en el ZIP.

## Documentos únicos y detalle de lotes

Se comprobó una orden escaneada por OC y OCM y un documento por factura. La interfaz oculta **Agregar** cuando la clase ya está ocupada y ofrece **Reemplazar**. Cancelar conserva el documento; confirmar actualiza archivo y metadatos del mismo registro, sin cambiar propietario ni clase. El servicio rechaza duplicados y cambios de propietario/clase conservando íntegramente los datos y el archivo. Dos solicitudes simultáneas para la misma factura guardan exactamente un documento. El índice único del DBML y los modelos generados coinciden con estas reglas; la plantilla global mantiene su comprobación propia.

El detalle agrupa código de barras, referencia de corrugado guardada en el renglón, cantidad de corrugado y sticker o cinta en la cabecera con fondo y acento de MASTER. Cambiar la recomendación del catálogo dejó intacta la referencia de esa orden. Código de barras y MAIA usan monospace de 16 px y peso 600. El número de factura con documento abre su contenido vigente mediante un enlace subrayado, accesible con teclado y protegido al abrir otra pestaña; sin documento permanece como texto. Se verificó también el enlace desde recepciones de material y otros.

Los lotes muestran las cinco fechas en dd/mm/aaaa del día de Bogotá, incluidas marcas UTC cercanas a medianoche; ausentes como **Sin registrar**. La tabla se convierte en tarjetas según el ancho de su contenedor, con padding 16 px y separación 16/12 px. Batch record estimado y recibido comparten fila en tarjetas; los contenedores de hasta 260 px conservan una columna. La columna de acciones de escritorio ocupa el ancho de sus botones y las fechas compactas reducen la altura de la fila. Se comprobó el renderizado completo al cambiar de ancho y desplazarse, sin alturas provisionales ni tarjetas vacías.

El recorrido se verificó a 375, 768, 815, 1024 y 1440 px, con navegación flotante y, desde 1024 px, fijada. Las capturas de móvil, tablet y escritorio se inspeccionaron visualmente. El [reporte de documentos y lotes](tests/evidence/review-documents-lots.json) conserva la revisión previa; el [recorrido principal](tests/evidence/browser-report.json) recoge la comprobación actual.

## Lotes iniciales, estimaciones y productos autorizados

Se regeneraron los 28 modelos y sus metadatos desde el DBML. La estimación de batch record pertenece exclusivamente a `lote_producto` y su número admite `null` mientras solo se planifica la entrega. La validación estricta rechaza atributos ajenos al renglón de producto.

Las ocho pruebas de `tests/product-lots.test.ts` comprueban la creación conjunta de un lote inicial por cada producto, con estimación de cabecera, estados por defecto y datos reales vacíos. Editar una orden no duplica lotes. Cambiar la entrega antes de autorizar propaga las estimaciones y conserva sus identificadores. Quitar un producto elimina el lote inicial y sus vínculos, manteniendo íntegramente las órdenes y los renglones de materiales.

Después de autorizar, el servicio rechaza agregar, quitar o sustituir productos, incluidos intercambios con igual número de renglones e identificadores duplicados. Los rechazos conservan el estado y el archivo guardado. Cantidad y precio siguen editables; cambiar la entrega de cabecera ya no sobrescribe las fechas de sus lotes. Completar un lote conserva su identificador y los lotes adicionales tienen estimaciones independientes, también después de recuperar el archivo.

La modificación manual y los lotes adicionales requieren autorización. Se comprobaron estimaciones sin número y anulación de una entrega prevista; asociar factura, registrar cantidad —incluido cero—, fechas reales o ubicación, avanzar batch record/inspección o cerrar exige un número no vacío. Asignar una factura desde su propio formulario también valida esta condición y rechaza la operación completa cuando falta el número.

El navegador creó una orden con dos productos y consultó sus lotes antes de autorizar. Eliminó un producto, agregó otro y cambió la entrega, comprobando la propagación y la conservación de materiales. Después verificó los selectores y botones bloqueados a 375, 768, 1024 y 1440 px, el aviso explicativo y las cantidades y precios disponibles. Completó el mismo lote, agregó otro con una fecha diferente y confirmó que las estimaciones solo aparecen dentro de los lotes. Se inspeccionaron las capturas de escritorio y móvil.

En la etapa anterior del modelo se reemplazó el archivo de demostración con la semilla de entonces, según `demo-reset-report.json`. Esta implementación posterior conserva el archivo existente y adapta exclusivamente la semilla para que los productos anulados no tengan lotes. No se añadió migración ni restauración automática del archivo.

## Bloqueos, reemplazo por proveedor y eliminación de lotes

Las once pruebas de `tests/order-lifecycle.test.ts` verifican número automático e inmutable y proveedor bloqueado tras autorizar para producto, material y otros. Comparan estado completo y contenido exacto del archivo ante rechazos; los intentos no consumen consecutivos.

El reemplazo se probó con una OC de A con dos productos, tres lotes —incluido uno cerrado y facturado—, dos documentos propios y vínculos con distintas OCM. Una de las OCM también abastece otra OC y conserva recepción, factura y lote de material con certificados. Después de reemplazar por B, ningún renglón, lote, documento propio ni vínculo anterior de la OC permanece. La cabecera coincide exactamente con los datos nuevos, salvo identidad, número y tipo; los nuevos renglones tienen IDs distintos y exactamente un lote inicial con fecha nueva, estados por defecto y datos reales nulos.

Se compararon íntegramente todas las cabeceras y renglones de las OCM anteriores, incluidas sus recepciones, documentos y vínculos compartidos. Las facturas, lotes de material, certificados, catálogos y registros de correo permanecen iguales. Recuperar el archivo reproduce todas las colecciones.

Se rechazaron cambios sin confirmación, productos de A al reemplazar por B, renglones antiguos, proveedores incompatibles y fechas vacías. Un dato de empaque inválido en el segundo producto provoca un fallo después de crear el primer renglón de reemplazo y su lote inicial. La transacción revierte todos los borrados, registros nuevos, archivo y consecutivos. Autorizar la OC durante la revisión también rechaza el reemplazo completo sin borrar información.

Se verificó el borrado de lotes sin número, cerrados, recibidos, facturados y anulados, con autorización y confirmación obligatorias. Mantener otros lotes conserva el estado del producto; borrar el último lo anula. Anular producto elimina todos sus lotes y conserva el renglón y abastecimiento; facturas y documentos permanecen. Reabrir anulado crea un único lote inicial nuevo con entrega actual; repetir no duplica. Reabrir con lotes heredados exige confirmación para reemplazarlos y reabrir cerrado conserva los lotes. El servicio rechaza lotes nuevos de productos anulados.

Una solicitud directa tampoco puede pasar de producto anulado a cerrado para omitir la reapertura. Se comprobó su rechazo sin cambiar datos ni archivo; la reapertura sigue creando el lote inicial requerido.

El recorrido de Chrome comprobó los bloqueos de número y proveedor a 375, 768, 1024 y 1440 px en los tres tipos de orden, y sus rechazos mediante HTTP. Verificó la advertencia inmediata, cancelar sin perder el borrador, reiniciar con productos del nuevo proveedor y entrega vacía, volver al proveedor original y restaurar el borrador previo. La revisión muestra «Reemplazo pendiente» y «Guardar reemplazo». Cancelarla conserva todos los registros y consecutivos. Guardar elimina todos los registros propios anteriores y conserva las OCM, recepciones y documentos independientes.

Se eliminó un lote cerrado, recibido y facturado desde la interfaz, manteniendo las facturas y documentos y recalculando la desviación. Cancelar la eliminación conserva sus datos; borrar el último advierte la anulación y bloquea agregar. Reabrir crea un lote inicial nuevo, repetir no duplica y anular elimina sus dos lotes conservando abastecimiento. Una autorización realizada mientras se revisaba el reemplazo produjo el rechazo esperado sin eliminar información.

Se inspeccionaron las capturas de escritorio y móvil de advertencia, revisión y borrado. En la revisión de bloqueos, el recorrido registró 537 comprobaciones sin errores JavaScript; el servicio de reinicio recuperó íntegramente las 28 colecciones. Los 43 casos de corrección de errores de formularios aislados también pasaron. El [reporte de esta implementación](tests/evidence/review-order-lifecycle.json) reúne las evidencias; no se reinició el archivo de usuario.

## Revisión de interfaz

Se revisó el código y la interfaz siguiendo las [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), junto con ui-ux-pro-max y react-dev.

- `src/ui.tsx`: etiquetas enlazadas, identificadores únicos, errores asociados, foco en el resumen y diálogos nativos. Los diálogos se montan fuera de los formularios y detienen la propagación del envío; se verificó crear una factura dentro de la captura del lote.
- `src/App.tsx` y `src/navigation-drawer.tsx`: navegación mediante enlaces, enlace para saltar al contenido, drawer flotante y fijación desde 1024 px. Reducir por debajo libera su columna y enfoca el cierre. El modo flotante bloquea el fondo y devuelve el foco al cerrarse. El modo fijado conserva su espacio y su estado al navegar, con contenido interactivo.
- `src/styles.css`: foco visible, colores de texto con contraste revisado, estados acompañados de texto y movimiento reducido. Se corrigió el desborde en tablet al contener los elementos de la tabla en su área desplazable.
- `src/orders.tsx`, `src/flows.tsx` y `src/forms.tsx`: búsqueda por número exacto, normalización de facturas, avisos de archivos faltantes y errores junto a los campos de los formularios.

La revisión visual incluyó escritorio, móvil, formulario de lote, recepción de material, correo e impresión. La prueba del navegador no sustituye una evaluación completa con lectores de pantalla y distintos navegadores.

## Comprobaciones interactivas adicionales

Se abrió un certificado ficticio en una pestaña, se descargó su contenido y se sustituyó el archivo vigente manteniendo el mismo registro. La comprobación automatizada revisa las respuestas de los enlaces de previsualización y descarga; la apertura de pestaña y la descarga real se comprobaron durante la sesión interactiva.

Se intentó cerrar el producto de la OC 2801 con una desviación de **−50 %** y la tolerancia vigente de **±5 %**. La confirmación mostró ambos valores. Cancelarla conservó el producto en seguimiento. Se guardó también un lote cerrado con toda la cantidad solicitada, comprobando que el producto y la orden no se cerraran automáticamente.

Los destinatarios y los documentos resueltos para liberar el lote MAT-26-041 incluyeron materiales y destinos de Aurora y Andina. El certificado del lote se reutilizó sin duplicarlo por destino.

## Paquete portable

El **13 de octubre de 2026** se generó [GIMED-Prototipo-Windows-x64.zip](../GIMED-Prototipo-Windows-x64.zip) en la raíz del proyecto, con Node.js **v24.17.0**, 72 paquetes de ejecución y datos ficticios iniciales. El ejecutable incluido coincide con el SHA-256 de la distribución oficial. El tamaño del ZIP es aproximadamente **40,2 MB**. La [suma SHA-256](../GIMED-Prototipo-Windows-x64.sha256.txt) del archivo es `b70484cd758fe5f445bd7b48b8bd7c6863d89f43f663f687dfc9b0d4a503b736`.

Pasaron **17 comprobaciones** mediante `npm run test:portable`. El archivo se extrajo fuera de `prototipo`, en una ruta con espacios y acentos, y se ejecutó **Iniciar.cmd** con un PATH sin Node ni npm. Se comprobó el servicio, las 28 colecciones, los archivos de la interfaz, la carga en Chrome, las 17 variantes y ayuda de los 13 filtros con Escape y foco, la reutilización de la instancia existente, el guardado de una modificación, el cierre con Enter y la recuperación íntegra después de reiniciar. El archivo de datos del proyecto conservó su contenido.

El reporte está en `tests/evidence/portable-report.json` y la captura en `tests/evidence/portable-ordenes.png`. La comprobación se realizó en una extracción aislada del mismo equipo; no se probó en otro PC físico. El ZIP entregado conserva los datos iniciales y no contiene las modificaciones de la comprobación.

## Capturas

Los archivos están en `tests/evidence`:

| Captura                                                                      | Proceso                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| `01-ordenes-desktop.png`                                                     | Pantalla inicial de órdenes                 |
| `02-revision-orden.png` | Cantidades finales y empaque |
| `03-lote-factura.png`, `04-seguimiento.png`                                  | Lote, factura y estados independientes      |
| `05-correo-simulado.png`, `06-facturas.png`                                  | Preparación del envío y factura normalizada |
| `07-vinculos-ordenes.png`, `08-recepcion-material.png` | Consulta de vínculos y recepción por material |
| `09-placeholder.png`, `10-liberacion-destinos.png`                           | Documento ficticio y varios destinos        |
| `11-orden-otros.png`, `12-error-movil.png`                                   | Concepto libre y error accesible            |
| `13-impresion.png`, `orden-producto.pdf`                                     | Formato de impresión                        |
| `14-codigos.png`, `15-catalogos.png`                                         | Proceso de códigos y catálogos              |
| `ordenes-375.png`, `ordenes-768.png`, `ordenes-1024.png`, `ordenes-1440.png` | Adaptación a los tamaños solicitados        |
| `31-lotes-iniciales-375.png`, `31-lotes-iniciales-1440.png` | Lotes iniciales antes de autorizar |
| `32-edicion-productos-autorizada-375.png`, `32-edicion-productos-autorizada-1440.png` | Composición bloqueada con cantidades y precios editables |
| `33-estimaciones-por-lote-375.png`, `33-estimaciones-por-lote-1440.png` | Estimaciones diferentes en lotes del mismo producto |
| `34-advertencia-reemplazo-375.png`, `34-advertencia-reemplazo-1440.png` | Advertencia inmediata al cambiar de proveedor |
| `35-revision-reemplazo-375.png`, `35-revision-reemplazo-1440.png` | Reemplazo pendiente y confirmación final |
| `36-eliminar-lote-375.png`, `36-eliminar-lote-1440.png` | Confirmación de borrado de un lote recibido, cerrado y facturado |
| `37-detalle-lotes-fechas-375.png`, `37-detalle-lotes-fechas-768.png`, `37-detalle-lotes-fechas-815.png`, `37-detalle-lotes-fechas-1024.png`, `37-detalle-lotes-fechas-1440.png` | Cabecera, cinco fechas, batch record paralelo en tarjetas y filas compactas de escritorio |
| `38-documento-unico-reemplazar.png` | Documento único y acción Reemplazar |
| `39-recepcion-factura-documento-material.png`, `39-recepcion-factura-documento-otro.png` | Factura enlazada a su documento en recepción |
| `39-factura-formulario.png`, `40-factura-detalle.png`, `41-factura-asociacion.png` | Registro de factura, detalle y selección de recepciones existentes |
| `40-filtros-personalizados-escritorio.png`, `41-paginacion-ordenes.png` | Selector y listado de 50 órdenes por página |
| `42-ayuda-filtros-escritorio.png`, `44-ayuda-filtros-movil.png` | Ayuda con descripciones y ejemplos |
| `43-filtros-personalizados-movil.png`, `45-filtros-personalizados-fijada.png` | Adaptación móvil y tablet con navegación fijada |
| `46-facturas-filtros-375.png`, `46-facturas-filtros-768.png`, `46-facturas-filtros-1024.png`, `46-facturas-filtros-1440.png` | Menú de factura con altura limitada y desplazamiento interno |
| `47-facturas-documentos.png`, `48-facturas-listado.png` | Selección Con/Sin documento y listado con filtros de columna |
| `49-drawer-redimensionado-375.png`, `50-factura-lotes-precargados.png` | Drawer flotante tras reducir la ventana y selección inicial de la factura |
| `51-abastecimiento-columnas-375.png`, `51-abastecimiento-columnas-1440.png` | Menús de columnas de vínculos entre órdenes |
| `52-factura-adjunto-placeholder.png`, `53-factura-desasignacion.png` | Adjunto preparado en la creación y desasignación persistida de un lote |
| `54-facturas-busqueda-375.png`, `54-facturas-busqueda-1440.png` | Búsqueda de facturas combinada con ordenamiento |
| `55-vinculos-busqueda-375.png`, `55-vinculos-busqueda-1440.png` | Búsqueda por OC y filtros de columna en vínculos |

Para repetir la revisión automatizada ejecuta `npm test`, `npm run test:browser`, `npm run test:filters` y `npm run benchmark:filters`. Los reportes y las capturas se actualizan con cada ejecución; el archivo de datos de usuario permanece separado.

## Ajustes de las anotaciones

Se comprobaron las rutas `/ordenes/productos` y `/ordenes/materiales`, la separación de listas y contadores, el filtro material/otros, el número automático bloqueado y el guardado con el número mostrado. Una previsualización obsoleta no consume consecutivos ni guarda una orden distinta. Las fechas aceptan escritura parcial y completa, rechazan días inexistentes y sincronizan el selector con el texto. El nuevo lote toma su batch estimado de la cabecera; cambiar la entrega antes de autorizar actualiza los lotes iniciales y después de autorizar conserva sus estimaciones.

Capturas adicionales: `tests/evidence/16-ordenes-materiales.png` y `tests/evidence/17-creacion-fechas-consecutivo.png`.

La revisión adicional del calendario nativo confirmó la elección con el teclado y la sincronización de las fechas de los catálogos. Configuración ya no muestra consecutivos y conserva los pendientes documentados.

La última revisión comprobó la eliminación de textos redundantes y fechas estimadas individuales en la creación de materiales/otros, los separadores y el avance automático de fechas, el retroceso y reemplazo de día/mes, el pegado ISO, el total exacto por producto, la cantidad solicitada y capacidad del corrugado, y porcentajes de sticker distintos dentro de la misma orden. Volver al primer paso conserva los porcentajes y las cantidades finales editadas; un porcentaje inválido identifica su producto y el servicio revierte toda la operación. El porcentaje de cálculo no agrega atributos al esquema persistido.

Materiales y otros nuevos heredan la entrega de cabecera; las fechas de seguimiento existentes sobreviven a una edición de la cabecera. Se verificó la revisión por producto a 375, 768, 1024 y 1440 px. Capturas: `18-sticker-individual-corrugado.png`, `19-revision-productos-movil.png` y `20-creacion-material-fecha-cabecera.png`. Las pruebas mantuvieron intacto el archivo de datos de usuario.

El ajuste de tooltips verificó cantidad de sticker y porcentaje en la misma fila, con porcentaje estrecho y separación corta, a 375, 768, 1024 y 1440 px. Las fórmulas de corrugado, sticker y cinta se muestran mediante hover o foco; las descripciones están enlazadas al control. Se comprobó mover el cursor sobre la ayuda, conservar el foco y cerrar con Escape sin cerrar el formulario. Los tooltips del porcentaje permanecen dentro de la ventana de 802 px y de la pantalla móvil. TypeScript y Vite compilan, y las 28 colecciones del último recorrido se recuperan completas tras reiniciar.

Capturas adicionales: `21-tooltip-corrugado.png`, `22-tooltip-sticker-porcentaje.png` y `23-tooltip-cinta.png`. Reporte: `tests/evidence/review-tooltips.json`.

## Filtros y ordenamiento de columnas

El listado muestra fecha de elaboración y un menú por cada una de sus siete columnas de datos. Se comprobó selección múltiple de estados, búsqueda de valores, productos de renglones secundarios, condiciones de proveedor, rangos inclusivos de fechas e importes, ordenamiento de números de OC, importes y fechas, eliminación de filtros y cancelación de cambios. Un intervalo invertido muestra un error; seleccionar cero valores conserva las cabeceras para quitar el filtro. La búsqueda general y los enlaces de estado anteriores siguen funcionando. Recargar conserva búsqueda, filtros y ordenamiento.

Las pruebas de filtros comparan importes en centavos enteros, incluso fuera del rango seguro de los números JavaScript; las fechas corresponden al día mostrado en Bogotá. Cubren condiciones negativas sobre varios productos, valores vacíos, desempates estables y parámetros de URL inválidos.

El menú se limita a **400 px** y al **60 % de la altura de la ventana**. Solo el contenido central se desplaza; el título y las acciones permanecen visibles. Se verificó desplazamiento, límites de ventana y ausencia de desborde de página a 375, 768, 802, 1024 y 1440 px, incluyendo una ventana de 802 × 668 px. Escape devuelve el foco a la cabecera; un clic fuera cierra el menú. El recorrido también comprueba los iconos de ayuda de cálculo existentes.

TypeScript y Vite compilan. El recorrido completo no registró errores JavaScript y las 28 colecciones del archivo de prueba se recuperaron íntegras al reiniciar. Capturas: `24-filtros-columnas-combinados.png`, `25-filtro-total-375.png` y `25-filtro-total-1440.png`. Reporte: `tests/evidence/review-columnas.json`.

La revisión del clic en filas reprodujo un cierre prematuro al pulsar el texto de un valor: durante la activación de la etiqueta, el foco pasaba brevemente al contenido principal. El menú ahora distingue ese gesto interno de una salida con teclado. Se verificaron clics sobre texto, espacios de ambos extremos, casilla directa, pulsación mantenida, tecla Espacio y la fila Seleccionar todos a 375 y 1440 px. Cada clic alterna la casilla una sola vez y mantiene abierto el menú; salir con Tab sigue cerrándolo y conserva los cambios como borrador. Reporte: `tests/evidence/review-click-valores.json`.

## Navegación mediante drawer: revisión inicial del 9 de octubre

Se verificó la apertura desde el botón de menú a 375, 768, 1024 y 1440 px, conservando todos los destinos y la indicación de la página actual. El panel se superpone al contenido sin modificar su ancho; cerrado, no reserva espacio lateral. Tab y Shift+Tab permanecen dentro del drawer. Escape, el botón de cierre y el fondo lo cierran y restituyen el foco, la interacción y el desplazamiento de la página.

Se comprobó el desplazamiento interno en una ventana de 375 × 360 px, la disponibilidad del botón de cierre, el cambio de tamaño con el drawer abierto y el respeto por movimiento reducido. Seleccionar un destino cierra el panel y enfoca el contenido; las pestañas y los formularios mantienen su navegación con teclado.

Se verificó también fijar y desfijar a 375, 768, 1024 y 1440 px: el panel fijado reserva su columna, el contenido se reajusta sin solaparse y las nueve secciones conservan el estado durante la navegación. Escape y el clic en contenido mantienen visible el panel fijado. Se comprobó su posición al desplazar la página, el acceso con teclado al contenido y la búsqueda sin pérdida de foco, incluso después de seleccionar la página actual.

Desfijar mantiene el panel abierto como diálogo flotante y devuelve el ancho completo al contenido. Cerrar ese diálogo conserva el ancho y restituye el foco y el desplazamiento. Los dos cambios de estado conservan el foco en el botón de fijación.

Los detalles de órdenes de productos y materiales también mantienen el panel fijado y adaptan sus resúmenes al espacio disponible, sin desbordamiento de página a 375 y 1440 px.

En la revisión de esta etapa, el recorrido completo pasó 289 comprobaciones, sin errores JavaScript, y las 28 colecciones se recuperaron completas al reiniciar el servicio de prueba. Capturas: `26-drawer-375.png`, `26-drawer-1440.png`, `27-drawer-fijado-375.png` y `27-drawer-fijado-1440.png`. Reporte: `tests/evidence/review-drawer.json`. El total de la revisión posterior se recoge al inicio de este documento.

## Productos activos, autorización y entrega obligatoria

Las órdenes nuevas solo admiten productos activos. Se comprobó el rechazo de productos inactivos o con estado activo nulo, incluyendo una segunda fila inválida después de una válida. Al editar se bloquea agregar o sustituir por un producto inactivo; una fila histórica conserva su producto y código de barras si este se desactiva posteriormente.

Las acciones manuales de cerrar, anular y reabrir requieren una orden autorizada, también cuando la solicitud lleva confirmación. Se comprobó el bloqueo en productos, materiales y otros, y el rechazo del guardado directo de un lote cerrado o anulado sin autorización. Después de autorizar, las acciones vuelven a funcionar.

La entrega solicitada es obligatoria en la creación y edición de los tres tipos de orden. Se comprobaron fechas omitidas, nulas, vacías, con espacios, parciales y días inexistentes. Los rechazos conservan el archivo completo, los consecutivos, los vínculos y las fechas de seguimiento.

El navegador comprobó el campo obligatorio y su error accesible en los tres formularios, la ausencia de productos inactivos en el selector y los botones de cerrar/anular bloqueados antes de autorizar. También desactivó un producto después de pasar a revisión: el servicio rechazó la emisión, el formulario volvió al campo con error y actualizó las opciones del catálogo. Se restauró el selector Material/Otros que faltaba en la pestaña de materiales.

En la revisión de esta etapa pasaron 58 pruebas de servicio y 319 comprobaciones de navegador. La compilación terminó correctamente y las 28 colecciones se recuperaron íntegras al reiniciar el servicio de prueba. Capturas: `28-productos-activos-fecha-obligatoria.png` y `29-seguimiento-sin-autorizacion.png`. Reporte: `tests/evidence/review-reglas-orden.json`. El resultado vigente, que incluye estas reglas, se recoge al inicio de este documento.

## Búsqueda de abastecimiento y referencias OC/OCM: revisión inicial del 8 de octubre

Se consultó el índice de CodeGraph de `prototipo` mediante sus herramientas MCP y CLI. Se revisaron los componentes de órdenes, abastecimiento, formularios, catálogos, facturas, documentos y correo, junto con las etiquetas compartidas de referencias.

Los prefijos se resuelven según el tipo: OC para productos y OCM para materiales y otros. Se verificaron los listados, consecutivos, revisión de otros y enlaces en ambas direcciones entre producto y material. Los selectores de recepciones, propietarios de documentos y órdenes del correo usan la misma función compartida.

La búsqueda de abastecimiento se probó por números de producto y material, prefijos con y sin espacio, minúsculas y espacios exteriores. Se verificó que OC 1601 no seleccionara la OCM 1601, que las búsquedas sin coincidencias conservaran una acción para limpiar y que esa acción recuperara todos los vínculos.

La búsqueda conserva el foco y las tablas tienen desplazamiento propio a 375, 768, 1024 y 1440 px. En la revisión del 8 de octubre pasaron 87 pruebas automatizadas y 537 comprobaciones de navegador, sin errores JavaScript. TypeScript y Vite compilan, y las 28 colecciones se recuperaron completas al reiniciar el servicio de prueba. Capturas: `30-abastecimiento-busqueda-375.png` y `30-abastecimiento-busqueda-1440.png`. Reporte: `tests/evidence/review-abastecimiento.json`.

## Corrección de errores sin perder el foco

La revisión adicional comprobó errores de órdenes, porcentajes de sticker, contactos, códigos MAIA, lotes, facturas e intervalos. Corregir un dato retira únicamente el aviso que ya es válido y actualiza el resumen. Las fechas parciales o inexistentes, cantidades no enteras, precios inválidos, correos mal formados y valores aún duplicados mantienen el error.

Se comprobó que la corrección parcial y la del último campo conservaran el foco y retiraran las referencias a mensajes resueltos. Las validaciones de relaciones, proveedor de factura y exclusión sticker/cinta también se conservan al evaluar la corrección. Se registraron 43 comprobaciones de interfaz en memoria, sin guardar registros ni errores JavaScript, independientes del recorrido principal. Las seis pruebas de `tests/live-errors.test.ts` forman parte de las pruebas automatizadas. Cada formulario aislado se abre en una pestaña de prueba nueva para evitar que el aviso de cambios pendientes interrumpa el siguiente caso.

Evidencia del 8 de octubre: [live-errors-side-report.json](tests/evidence/live-errors-side-report.json). El recorrido principal, la compilación y el reinicio actuales están registrados en [browser-report.json](tests/evidence/browser-report.json) y [restart-report.json](tests/evidence/restart-report.json).

## Regreso a la vista de origen

La comprobación consolidada de regreso con Playwright verificó **Volver a órdenes** desde el detalle de productos, materiales y otros, y los botones de regreso de impresión, usando la misma pestaña. Conservó búsqueda, filtro, ordenamiento, vista y desplazamiento vertical; con navegación fijada recuperó también el desplazamiento horizontal de la tabla. El recorrido listado → detalle → impresión → detalle → listado conservó el origen. Los seis recorridos adicionales comprobaron, para cada tipo, el regreso y la excepción de salir a otra vista: al volver a Órdenes por la navegación se abrió la vista por defecto, sin filtros y con scroll en cero. La [prueba automatizada única de esta funcionalidad](tests/order-navigation.test.ts) cubre los tres tipos, la conservación durante impresión y el descarte al volver, salir o reabrir desde otra vista; pasó junto con las doce pruebas de filtros y ordenamiento. La posición se captura al abrir el detalle o pulsar Imprimir y se restaura después de mostrar el origen, sin observación continua del scroll. TypeScript completó la comprobación sin emitir archivos. Estas comprobaciones no modificaron los datos del prototipo ni los conteos del recorrido principal.

## Revisión de renglones del 14 de octubre de 2026

La compilación y **130 pruebas automatizadas** pasaron. Cuatro casos nuevos
en `tests/order-lifecycle.test.ts` verifican la reapertura de materiales y
conceptos cerrados o anulados, la persistencia íntegra de recepción, factura,
lote, documentos y vínculos, la repetición sin duplicados y el rechazo sin
autorización con estado y archivo intactos. La reapertura reutiliza
`setLineState`; no se duplicó el servicio de producto.

La prueba específica `tests/order-detail.browser.js` pasó **60 comprobaciones
en Chrome 155 y 60 en Edge 155**. Comprueba a 375, 799 y 1440 px: intercambio
de información y tipografía, código de barras conservado, despliegue inicial,
estado independiente por renglón, resumen y acciones visibles al ocultar,
altura cero, `inert` y `aria-hidden`, conservación del foco, apertura con Enter,
ausencia de nuevas solicitudes y desbordamiento, y movimiento reducido.
También verifica documentos y acciones ocultas de OCM, reapertura desde
cerrado y anulado conservando datos, fondos y ribetes de los tres estados,
contraste secundario mínimo 4,5:1 y alternancias rápidas. Las capturas del
renglón oculto en escritorio y móvil se inspeccionaron visualmente.

El ensayo de **7 renglones y 280 lotes** y sus límites están en
[RENDIMIENTO.md](RENDIMIENTO.md#despliegue-de-lotes-y-documentos).
Reportes: [Chrome](tests/evidence/order-detail/chrome-report.json) y
[Edge](tests/evidence/order-detail/msedge-report.json).

Se intentó también el recorrido general histórico. Su expectativa del orden
de los destinos del drawer se actualizó al orden actual de la aplicación.
Después se detuvo en un selector anterior de Producto que intenta usar
`selectOption` sobre el actual campo de búsqueda con datalist. Ese recorrido
no se contabiliza como aprobado en esta revisión; los resultados generales
del 13 de octubre conservan su fecha y alcance. La revisión actual usa bases
persistidas temporales y una respuesta amplificada solo en el navegador para
el ensayo de rendimiento, sin modificar el archivo de datos del usuario.

## Migración React Aria — 16 de octubre de 2026

La regla de componentes y el inventario están en [MASTER.md](design-system/MASTER.md) y [MIGRACION-ARIA.md](MIGRACION-ARIA.md). Las revisiones anteriores conservan su fecha y alcance. La verificación de la migración está completada: compilación, funcionalidad, persistencia y portable pasan; se aprobaron los 39 límites de rendimiento del equipo actual. El ensayo de CPU 4× queda separado por confirmación del usuario.

Resultados funcionales confirmados: **133 pruebas automatizadas; 598 comprobaciones del recorrido completo de Chromium; 43 de validación; 52 de filtros; 60 de detalle y desplegados; 56 de componentes en cada uno de Chromium, Firefox y WebKit**. Incluyen selección del calendario con flechas/Enter y cancelación con Escape a 375, 768, 1024 y 1440 px. Se comprobaron 32 clics de selección de recepciones con delta de scroll de 0 px, además de Tab, Espacio y rueda. El portable temporal superó 18 comprobaciones, incluyendo la carga local de formulario y calendario. El reinicio recuperó íntegramente las 28 colecciones temporales. Los datos del usuario conservan su SHA-256 inicial.

Los recorridos utilizan roles y nombres accesibles de React Aria y seleccionan opciones visibles por identificador. El calendario se verifica mediante celdas reales; los campos numéricos mantienen decimales inválidos para que los señale Zod. Los formularios anidados aíslan `FormContext` y el tooltip mantiene acceso sobre el diálogo modal. Las casillas conservan un área de foco de 14 px alineada con su indicador.

Evidencias: [pruebas automatizadas](tests/evidence/aria/unit-tests.tap), [recorrido completo](tests/evidence/aria/chromium-browser-journey.json), [validación](tests/evidence/aria/chromium-live-errors.browser.json), [filtros](tests/evidence/order-filters-browser-report.json), [detalle](tests/evidence/order-detail/chrome-report.json), [scroll de facturas](tests/evidence/aria/chromium-invoice-scroll.browser.json), [Chromium](tests/evidence/aria/chromium-aria-controls.browser.json), [Firefox](tests/evidence/aria/firefox-aria-controls.browser.json), [WebKit](tests/evidence/aria/webkit-aria-controls.browser.json), [reinicio](tests/evidence/restart-report.json) y [portable](tests/evidence/portable-report.json).

Firefox 156.0 de Playwright presentó un fallo SideBySide de Windows al iniciar. Se probó una copia temporal de sus mismos binarios, extrayendo `mozglue.manifest` del XML ya incluido en `mozglue.dll`; no se modificaron binarios ni instalaciones del usuario. `PROTOTIPO_FIREFOX_EXECUTABLE` permite indicar esa copia al runner.

`node scripts/prepare-firefox-runtime.mjs` prepara esa copia local. Después se usa `PROTOTIPO_FIREFOX_EXECUTABLE=tests/.tmp/firefox-runtime/firefox.exe` al ejecutar `node scripts/verify-aria-browser.mjs tests/aria-controls.browser.js firefox`. El mismo runner admite `chromium` y `webkit`.

La [prueba prolongada de memoria](tests/evidence/aria/soak-summary.json) completó 600 ciclos: 17.577.548 bytes finales frente a 13.223.152 en la referencia, dentro del margen de 5 MB. Entre los ciclos 510 y 600 varió 22.528 bytes (0,13 %); el heap no retuvo contenedores de formularios desmontados. La comparación y las limitaciones del ensayo de estrés están en [RENDIMIENTO.md](RENDIMIENTO.md#comparación-de-la-migración-a-react-aria).

## Proveedores favoritos por tipo — 16 de octubre de 2026

Implementada la opción A ajustada. Punto de recuperación: `ad313845dcb9f8aec535842d93415bfb0c751919`, más copias exactas de DBML y base local. La conversión reúne ocho relaciones en siete pares únicos. La inspección al convertir confirmó que las otras 27 colecciones no cambiaron. Los cambios posteriores de la base activa se conservan y no se usan como datos del ensayo.

Resultados funcionales: **151 pruebas automatizadas**, **598 comprobaciones del recorrido completo**, **71 comprobaciones de favoritos en cada uno de Chromium, Firefox y WebKit**, y **21 del portable actualizado**. Reinicio: las 28 colecciones temporales coinciden íntegramente. Se ejecutaron también validación (43), filtros (52), detalle (60), controles compartidos (56) y scroll de facturas (32 clics; delta máximo 0 px).

Los nuevos casos cubren herencia en dos materiales del mismo tipo, tipos vacíos, búsqueda y despliegue, selección múltiple independiente del filtro, bajas desde la selección final, homónimos diferenciados por NIT e ID, teclado, confirmaciones anidadas, errores del servicio, conflicto y revisión, envío único, bloqueo durante guardado, retorno de foco y conservación del scroll. Se comprobaron 375, 768, 1024 y 1440 px. No hubo errores ni advertencias de React/React Aria en los recorridos aprobados.

Las pruebas de datos incluyen formato anterior y mixto, duplicados, idempotencia, referencias inválidas, fallo al crear respaldo sin recurrir a la semilla, copia exacta, segunda apertura, integridad y atomicidad. El portable se probó desde una extracción temporal con una base anterior, respaldo exacto y dos reinicios; no se utilizaron los archivos guardados del usuario.

Especificación, inventario y recuperación: [PROVEEDORES-FAVORITOS.md](PROVEEDORES-FAVORITOS.md). Evidencias: [Chromium](tests/evidence/favorites/chromium-favorites.browser.json), [Firefox](tests/evidence/favorites/firefox-favorites.browser.json), [WebKit](tests/evidence/favorites/webkit-favorites.browser.json), [editor](tests/evidence/favorites/editor-1440.png) y [móvil](tests/evidence/favorites/editor-375.png). La comparación de rendimiento se registra separadamente en [RENDIMIENTO.md](RENDIMIENTO.md).

### Cierre de verificación — 19 de octubre de 2026

La revisión del repositorio actualizado conserva las 151 pruebas unitarias, 598 comprobaciones generales, 71 de favoritos por navegador y 21 del portable aprobadas. Se sincronizó la descripción de Documento de la orden en `../filtros.md` con el texto nuevo de la interfaz, conservando el cambio y la prueba de coherencia. La comparación de rendimiento se repitió con referencia y versión actual consecutivas en esta sesión: 39/39 límites aprobados, incluidos 60.000 lotes. Se conservó además un respaldo duradero del DBML anterior en `data/schema-before-favorites-20261016.md.bak`.

El [informe de entrega](tests/evidence/favorites/delivery-report.json) registra hashes, recuperación, migración, pruebas y rendimiento. Las modificaciones concurrentes de GS1 y los datos de la aplicación abierta permanecen conservados.

## Código MAIA de corrugados — 19 de octubre de 2026

Se corrigió la creación de corrugados cuyo campo de código permanece vacío
sin interacción: `null` se normaliza como ausencia antes de validar el
formato y no se transforma en cero. La obligación por tipo se comparte
entre formulario, validación en vivo y guardado; solo Corrugado admite
omitir el código. También se comprueba al editar o cambiar el tipo del material.
No se modificó el esquema ni se migraron los registros guardados.

La compilación pasó. Las cinco pruebas de `tests/material-code.test.ts`
verifican creación y edición con código omitido/null, persistencia al
reiniciar, rechazo sin modificaciones para los demás tipos, cambio de tipo,
código cero, rango, unicidad y corrección de errores al elegir Corrugado.
Las **26 comprobaciones de navegador** en Chrome, a 1440 y 375 px, recorren
el formulario real: crear con el código inicial intacto, editar, obligación
según tipo, cambio de tipo después de un error, dos dígitos, duplicados,
códigos con ceros iniciales y ausencia de desbordamiento. El navegador no
registró errores ni advertencias de React/React Aria.

[Reporte de formulario](tests/evidence/aria/chromium-material-code.browser.json).
Para reproducir, con base de pruebas independiente:

    node node_modules/tsx/dist/cli.mjs --test tests/material-code.test.ts
    npm run build
    node scripts/verify-aria-browser.mjs tests/material-code.browser.js chromium

La ejecución completa de pruebas obtuvo **155 correctas y un fallo** en
`tests/order-filters.test.ts`: las descripciones actuales de los filtros de
órdenes difieren de `filtros.md`. Ese desacuerdo pertenece a los cambios
previos de filtros y no se alteró como parte de esta corrección.

## Despliegue y presentación compacta de favoritos — 20 de octubre de 2026

Compilación correcta y 116 comprobaciones de navegador en Chromium: 45 del
nuevo recorrido de animación/presentación y 71 del recorrido de favoritos.
El primero verifica apertura/cierre con alturas intermedias, retirada completa
de la fila, foco, Enter/Espacio, exclusión accesible durante el cierre,
movimiento reducido, clics rápidos y ausencia de solicitudes al alternar.
A 375/803/1440 px se comprobaron peso 400, sangría 24 px respecto al tipo,
padding de proveedor 6 px, contenedor sin padding vertical superior ni de
celda, 4 px inferiores y ausencia de desbordamiento. Las capturas se
inspeccionaron visualmente.

El recorrido de favoritos conserva búsquedas, apertura automática y cierre
manual, selección múltiple, cancelación, errores, conflictos, guardado vacío
y prioridad de proveedores a 375/768/1024/1440 px. Sus localizadores se
actualizaron a los nombres y secciones actuales del editor, y esperan la
finalización del cierre antes de contar filas. Ambos recorridos usan bases
temporales y no registraron errores ni advertencias de React/React Aria.

Reportes: [animación y presentación](tests/evidence/favorites/chromium-favorites-disclosure.browser.json)
y [favoritos](tests/evidence/favorites/chromium-favorites.browser.json).
Reproducción y detalles en [PROVEEDORES-FAVORITOS.md](PROVEEDORES-FAVORITOS.md#verificación-reproducible).

## Pasos de códigos de barras como filtros — 20 de octubre de 2026

Compilación correcta y 37 comprobaciones de Chromium con una base temporal.
El recorrido verifica que los tres pasos comparten el filtro de estado de la
columna, sincronizan su selección con las casillas del menú, conservan búsqueda,
otros filtros y ordenamiento, y permiten quitar o limpiar filtros. Incluye
Inactivo desde la columna, combinaciones sin resultados, fondo normal blanco,
hover gris, Enter/Espacio y foco a 375/803/1440 px. Sin errores ni advertencias
de React/React Aria; capturas revisadas visualmente.

[Reporte](tests/evidence/aria/chromium-barcode-steps.browser.json).
Reproducción:

    npm run build
    node scripts/verify-aria-browser.mjs tests/barcode-steps.browser.js chromium


### Códigos de barras: vigencia y asignación · 20 de octubre de 2026

- 167 pruebas automatizadas: esquema, estados, selección explícita, errores, conflictos, transacción atómica, historial, conversión por fecha UTC e idempotencia.
- Referencia del recorrido integral anterior: 598 comprobaciones en Chromium; el reinicio conservó las 28 colecciones. Tras simplificar la vista se repiten los recorridos de códigos, filtros y favoritos, y el portable.
- Códigos: 34 comprobaciones por navegador de la tabla en Chromium, Firefox y WebKit, con 375/768/1024/1440 px. Comprueba búsqueda, errores, revisión de conflictos, cancelación y retorno del foco. Cinco colores existentes y contraste ≥4,5:1. El informe de cada navegador registra el total de comprobaciones.
- Filtros/ordenamiento de estados: 41 comprobaciones; favoritos: 71 comprobaciones de regresión del componente agrupado compartido.
- Portable nuevo: 23 comprobaciones, incluida conversión de códigos antiguos, respaldo exacto y segundo reinicio sin otra migración.
- La referencia inicial tenía 155/156 pruebas correctas: una diferencia previa entre descripciones de filtros y `../filtros.md`; se sincronizó la documentación con el texto vigente sin cambiar su lógica.

Reportes y capturas: [tests/evidence/barcodes](tests/evidence/barcodes). Recuperación, hashes, demo y comparación de rendimiento: [CODIGOS-BARRAS.md](CODIGOS-BARRAS.md).
## Filtros de la tabla de Documentos — 21 de octubre de 2026

Compilación correcta y 43 comprobaciones de Chromium aprobadas con una base
temporal. Se verificaron filtros de Documento, Propietario, Clase y Cargado;
condiciones de texto y fecha, selección múltiple, combinaciones entre columnas,
sincronización del selector de clase, búsqueda y ambas limpiezas conservando
el ordenamiento. Los estados sin resultados mantienen cabeceras y valores
seleccionados. Descargar y Gestionar siguen operativos.

Revisión visual a 375/862/1440 px, con selector de clase legible, desplazamiento
horizontal limitado a la tabla, cierre con Escape y devolución del foco.
Sin errores ni advertencias de React/React Aria.

[Reporte](tests/evidence/aria/chromium-documents-filters.browser.json).
Reproducción:

    npm run build
    node scripts/verify-aria-browser.mjs tests/documents-filters.browser.js chromium

## Navegación de Documentos al historial del lote — 21 de octubre de 2026

Compilación correcta y 39 comprobaciones de Chromium con datos temporales.
Desde los certificados de calidad y liberación, el número de lote abre la
pestaña Lotes y certificados y su diálogo existente con recepciones y documentos.
Se comprobaron enlaces por identificador, cierre con X/Escape, reapertura desde
la tabla, recarga, Atrás, cambio de pestaña y enlace a un lote inexistente.
Revisión visual a 375/862/1440 px y sin avisos ni errores de React/React Aria.

[Reporte de navegación](tests/evidence/aria/chromium-document-lot-navigation.browser.json).
Reproducción:

    npm run build
    node scripts/verify-aria-browser.mjs tests/document-lot-navigation.browser.js chromium

## Autocompletado de proveedores y materiales — 21 de octubre de 2026

Compilación correcta y 161 comprobaciones de Chromium: 34 de autocompletado,
56 de controles compartidos y 71 del recorrido de favoritos. Se verificaron
búsquedas por nombre y código MAIA, teclado, ausencia de coincidencias,
agrupaciones de favoritos y homónimos, persistencia de los identificadores en
contactos y OCM, proveedor de factura, corrugados sin código y restricciones
de tipo. Escribir un proveedor no dispara el reemplazo de una OC; seleccionarlo
mantiene la confirmación y cancelarla conserva la etiqueta y el borrador.
El proveedor de una orden autorizada sigue bloqueado.

El recorrido de controles conserva el comportamiento de productos, fechas,
importes, diálogos anidados y protección del borrador. Se revisaron capturas a
375/1440 px y no hubo errores ni advertencias de React/React Aria.

Reportes: [autocompletado](tests/evidence/favorites/chromium-favorites-autocomplete.browser.json),
[controles](tests/evidence/aria/chromium-aria-controls.browser.json) y
[favoritos](tests/evidence/favorites/chromium-favorites.browser.json).
Reproducción:

    npm run build
    node scripts/verify-aria-browser.mjs tests/favorites-autocomplete.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/aria-controls.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/favorites.browser.js chromium

### Productos y materiales · 23 de octubre de 2026

- Referencia inicial: 180/180 pruebas. Resultado: 199/199; las 19 nuevas cubren guardado conjunto, unicidad global, referencias, capacidades, exclusión, reclasificaciones, conflictos, concurrencia, rollback, persistencia y archivos incompatibles intactos.
- Playwright: 63 comprobaciones nuevas por navegador en Chromium, Firefox y WebKit, a 375/768/1024/1440 px. Incluye filtro por teclado, selección final con búsqueda, casillas excluyentes, errores, revisión de conflictos, descarte, foco, scroll, homónimos y un contexto táctil sin material especial disponible.
- Regresiones: 71 de favoritos, 45 de su despliegue, 66 de costos, 87 de alineación compartida, 195 de formularios y 598 del recorrido integral. Se adaptó la auditoría de los formularios antiguos al editor unificado: capacidad obligatoria con corrugado e inválida fraccionaria. Se conservan las comprobaciones de bordes, resumen y foco.
- Portable temporal: 23 comprobaciones. La base local no se modificó; respaldos y hashes figuran en el informe. Las capturas `current-*` se generaron en modo de solo lectura, comprobando que no hubiera escrituras a la API.

Reproducir con `npm test`, `npm run build` y `node scripts/verify-aria-browser.mjs tests/product-materials.browser.js chromium` (también Firefox y WebKit). Rendimiento: `node scripts/benchmark-product-materials.mjs`. [Informes y capturas](tests/evidence/product-materials), [especificación](PRODUCTOS-MATERIALES.md).

## Calendario: pantalla en blanco por caché compartida — 22 de octubre de 2026

Se reprodujo el fallo en el navegador del servidor de desarrollo al abrir el
calendario dentro de Nueva orden. React Aria lanzó `Invalid slot "previous".
Valid slot names are "close".` y desmontó la página. Los recursos cargados
incluían dos módulos Button/contextos de React Aria de distintas optimizaciones.

Se probaron copias exportadas de `ad31384`, `7e1b342` y `d05be98`, sin cambiar
el checkout ni los datos. Las tres versiones abren el calendario, seleccionan
25/10/2026 con teclado, navegan entre meses y cierran con Escape conservando el
formulario cuando usan cachés independientes. El lockfile es idéntico en las
tres. Por tanto, `d05be98` también es estable con caché limpia; no se necesita
revertir el componente ni los cambios visuales.

La causa era el uso de `node_modules/.vite` tanto por desarrollo como por los
servidores de fixtures con otra configuración de optimización. Al ejecutar
pruebas se reemplazaban dependencias que un formulario abierto todavía usaba;
la carga diferida del calendario mezclaba contextos incompatibles. Una prueba
aislada con caché compartida también produjo pantalla en blanco por un recurso
optimizado eliminado (404).

Reparación: desarrollo utiliza `node_modules/.vite-dev`; ambos ejecutores de
fixtures reutilizan `createFixtureVite` con una caché temporal por ejecución.
La regresión automatizada abre primero el formulario de desarrollo, ejecuta y
cierra un segundo servidor de fixtures y solo entonces carga su calendario.
Comprueba selección, navegación mensual, Escape, conservación del formulario y
ausencia de errores en Chromium a 375 y 1440 px, incluyendo reapertura.

Además se verificaron los dos calendarios del formulario real Nueva orden en
el servidor de desarrollo a 375/1440 px después de ejecutar la suite de
controles: sin pantalla en blanco ni errores y con un solo módulo Button.
Pasaron las 56 comprobaciones de controles compartidos, las 167 pruebas
unitarias y la compilación de producción (con el aviso de tamaño de chunk ya
existente).

[Comparación de commits](tests/evidence/calendar/history-comparison.json) y
[reporte de regresión de cachés](tests/evidence/calendar/cache-regression.json).
Reproducción:

    npm run test:calendar
    node scripts/verify-aria-browser.mjs tests/aria-controls.browser.js chromium
    npm test
    npm run build

## Validación uniforme de formularios — 22 de octubre de 2026

Los mensajes de error se presentan visualmente solo en `ErrorNotice`, encima
de los campos. Se conservan descripciones ocultas para lectores de pantalla,
enlaces al campo y foco tras enviar un formulario inválido. `ControlForm`
comparte `fieldErrors` con `Field` y los controles: los catálogos generados,
que antes mostraban el resumen sin marcar sus campos, ahora aplican el borde
rojo. Los errores nativos de formato, incluidas las fechas inexistentes y el
correo, se incorporan al aviso superior sin globos de validación del navegador.
Los filtros de columna siguen el mismo patrón. Corregir un valor retira su
error, conserva los pendientes y no desplaza el foco.

La auditoría nueva recorrió en Chromium los 14 tipos de formulario de catálogo
y directorio (incluidos configuración y lotes de material), nuevas órdenes de
producto/material/otros, facturas, documentos anidados, registro GS1 y
tolerancia a 375/1440 px. También comprobó edición de los tres tipos de orden,
lotes de producto, recepción de material, fechas inexistentes y correo.
Pasaron 195 comprobaciones de borde rojo, aviso único, descripción accesible,
foco y aislamiento de formularios. El estado final de la base temporal coincide
exactamente con el inicial: no se guardaron registros.

Además pasaron 51 comprobaciones de corrección en vivo (incluidas recepción de
otros y fecha de filtro), 56 de controles compartidos, 5 escenarios del
calendario con cachés aisladas, las 167 pruebas unitarias y la compilación.
Se revisaron capturas de productos y órdenes en escritorio/móvil, y se probó
manualmente un correo inválido en el servidor de desarrollo: aviso superior,
borde rojo y envío bloqueado, sin guardar mensajes.

El recorrido legado `tests/browser-journey.js` se detuvo en el escenario de
documento de factura porque todavía busca «Adjuntar documento», mientras la
interfaz ya usa «Seleccionar documento». No se modificó esa prueba ajena a la
validación. Antes de ese punto recorrió guardados válidos de órdenes y lotes;
el escenario actual del documento está cubierto por la auditoría nueva.

Reportes: [auditoría de formularios](tests/evidence/aria/chromium-form-validation.browser.json),
[corrección en vivo](tests/evidence/aria/chromium-live-errors.browser.json) y
[controles](tests/evidence/aria/chromium-aria-controls.browser.json).
Reproducción:

    npm run build
    node scripts/verify-aria-browser.mjs tests/form-validation.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/live-errors.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/aria-controls.browser.js chromium
    npm run test:calendar
    npm test

### Costos de maquila · 22 de octubre de 2026

- Referencia inicial: 167/167 pruebas. Resultado: 180/180, incluidos importe obligatorio, fechas y límites inclusivos, todos los solapamientos, cierre antes del siguiente abierto, concurrencia, historial, persistencia y corrección autorizada del archivo.
- Playwright: 66 comprobaciones de costos por navegador en Chromium, Firefox y WebKit, a 375/768/1024/1440 px y contexto táctil. Incluye búsqueda, filtro por teclado, escritura continua y parcial de fechas, acciones contextuales, errores, borrador, descarte, foco, scroll y cierre bloqueado durante guardado.
- Regresiones: 71 comprobaciones de favoritos, 195 de formularios y 598 del recorrido integral; sin errores de consola. Se adaptaron las etiquetas actuales de adjuntos/códigos y la automatización del borrado de ComboBox sin retirar comprobaciones de negocio.
- Portable nuevo en archivo temporal: 23 comprobaciones. La base local conserva las otras 27 colecciones y todos los demás costos; el único registro retirado figura en el informe con hashes.

Reproducción: `npm test`, `npm run build`, `node scripts/verify-aria-browser.mjs tests/maquila-costs.browser.js chromium` (también Firefox y WebKit). El ensayo de rendimiento es `node scripts/benchmark-costs.mjs` después de compilar. [Informes y capturas](tests/evidence/costs), [reglas y recuperación](COSTOS-MAQUILA.md).

### Alineación de tablas agrupadas · 22 de octubre de 2026

Se reprodujo la desalineación de los historiales en Chromium antes de corregir
los estilos. Las tablas internas ahora distribuyen sus columnas con ancho fijo,
reservan la columna de acciones desde el encabezado y no llevan fondo gris ni
borde superior. La cabecera principal conserva su estilo. El mínimo exterior
incluye la sangría del historial: el foco en una acción no desplaza únicamente
su panel en móvil; el scroll horizontal pertenece al conjunto.

La prueba `tests/maquila-costs-layout.browser.js` mide las posiciones y anchos
de todos los encabezados y sus celdas entre productos a 375/768/1024/1440/1680
px, con historiales distintos y fechas de fin vacías o informadas. Comprueba
hover, foco, cierre/reapertura, ausencia del banner, contención horizontal y
que favoritos mantenga su lista y despliegue. No modifica registros.
Pasaron las 49 comprobaciones de navegador, las 180 pruebas unitarias y la
compilación de producción.

[Reporte de alineación](tests/evidence/costs/chromium-maquila-costs-layout.browser.json)
y capturas `aligned-groups-375.png`, `aligned-groups-1024.png` y
`aligned-groups-1440.png` en `tests/evidence/costs/`.

Reproducción:

    npm run build
    node scripts/verify-aria-browser.mjs tests/maquila-costs-layout.browser.js chromium

### Sublistas de favoritos y costos · 22 de octubre de 2026

Se unificaron los encabezados blancos, tipografía, padding y altura de las filas
internas. Favoritos muestra Proveedor y NIT-DV sin acciones individuales, incluso
al hacer hover; conserva la edición por tipo y el despliegue accesible. En móvil,
las acciones de costos permanecen en una sola fila y el scroll sigue siendo
compartido por todos los grupos.

Pasaron **203 comprobaciones de navegador en Chromium**: 87 de presentación
compartida a 375/768/1024/1440/1680 px, 45 de despliegue y 71 del editor de
favoritos. Incluyen alineación entre grupos, igualdad de estilos y altura con
costos, ausencia de acciones por proveedor, teclado, foco, movimiento reducido,
búsqueda, cancelación y guardado. Las pruebas usan archivos temporales, sin
modificar los registros reales. La compilación de producción también pasó.

Reportes: [presentación compartida](tests/evidence/costs/chromium-maquila-costs-layout.browser.json),
[despliegue](tests/evidence/favorites/chromium-favorites-disclosure.browser.json) y
[editor](tests/evidence/favorites/chromium-favorites.browser.json).

Reproducción:

    npm run build
    node scripts/verify-aria-browser.mjs tests/maquila-costs-layout.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/favorites-disclosure.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/favorites.browser.js chromium

## OCM desde materiales pendientes · 26 de octubre de 2026

Primera iteración sobre **1.25 estable (`2011bb9`)**, sin commit de respaldo ni
migración. **213 pruebas automatizadas correctas**, incluidas 14 nuevas del
dominio y la tabla; compilación TypeScript/Vite correcta. [Registro de pruebas](tests/evidence/ocm/unit-tests.txt).

El recorrido completo supera **74 comprobaciones en cada motor**: Chromium,
Firefox y WebKit, **222 en total**, sin errores ni advertencias de React/React
Aria. Incluye 375/768/1024/1440 px, rango y fechas, cobertura parcial, límite de
siete identidades con homónimos, múltiples orígenes, búsqueda y paginación sin
perder selección, teclado, foco, descarte, cambio de proveedor, cantidad y
porcentaje, revisión, guardado y conflicto de cantidad concurrente.
Los homónimos se distinguen por MAIA también en el resumen y sus acciones;
quitar un material retira todos sus orígenes y libera un espacio. Se verifican
el descarte confirmado al cambiar de rango y el reintento tras un error temporal.

El servicio se prueba con transacciones temporales: dos solicitudes simultáneas
crean una compra; un fallo en el último material revierte cabecera, primeros
renglones, vínculos y consecutivo. Se conserva el vínculo de una compra anulada
al emitir su reemplazo. La cantidad manual y el precio persisten; base y porcentaje
no agregan atributos al modelo.

Las capturas permitieron corregir el día mostrado de la entrega sin convertir
la fecha calendario a medianoche UTC, el estilo del buscador y la visibilidad
del resumen adherido al viewport. Las comprobaciones de WebKit esperan la
devolución de foco del menú antes de editar una fecha. Firefox usa la copia
temporal y el manifiesto SideBySide ya descritos en este documento.

Reportes: [Chromium](tests/evidence/ocm/chromium-material-demand.browser.json),
[Firefox](tests/evidence/ocm/firefox-material-demand.browser.json) y
[WebKit](tests/evidence/ocm/webkit-material-demand.browser.json).
Capturas: [tabla de escritorio](tests/evidence/ocm/chromium-pendientes-1440.png),
[tabla de 375 px](tests/evidence/ocm/chromium-tabla-375.png) y
[diálogo de 375 px](tests/evidence/ocm/chromium-dialogo-375.png).

La comparación de producción aprueba **39/39 presupuestos**; las nuevas
interacciones tienen un P95 máximo de 112,8 ms con 6.000 lotes y 19.455 necesidades,
y de 149,2 ms con 60.000 lotes y 194.365 necesidades. [Mediciones y límites](RENDIMIENTO.md#ocm-desde-materiales-pendientes--26-de-octubre-de-2026).
El hash SHA-256 del archivo real se conserva:
`FC2D3AB09D47F2AE760FE27371203D85D8722BD2CCF11459C34244F203AC2F8D`.

Reproducción:

    npm test
    npm run test:ocm
    npm run benchmark:ocm

Reglas y contrato: [ABASTECIMIENTO-OCM.md](ABASTECIMIENTO-OCM.md).

## Entrega solicitada y elaboración al crear — 26 de octubre de 2026

Compilación correcta, **222 pruebas unitarias aprobadas** y **27 comprobaciones
de Chromium aprobadas**. Las nueve pruebas nuevas de servicio cubren los tres
tipos, días iguales y posteriores, diferencias entre UTC/Bogotá, medianoche,
elaboración enviada por el cliente, conservación del archivo y consecutivos,
y edición de órdenes históricas. Los escenarios históricos de dominio y
precisión fijan su reloj para mantener sus fechas de prueba reproducibles.

El navegador comprueba el HTTP 422 y los errores del campo en los tres tipos;
en 375/1440 px comprueba elaboración de solo lectura, banner con foco, marcado
del campo, conservación del error entre fechas pasadas, corrección al mismo
día y un rechazo real del servicio después de la revisión. Se conserva el
borrador y se vuelve a la etapa de captura. Sin errores ni advertencias de
React/React Aria. Capturas revisadas visualmente.

[Reporte de navegador](tests/evidence/aria/chromium-order-creation-date.browser.json).
Reproducción:

    npm test
    npm run build
    node scripts/verify-aria-browser.mjs tests/order-creation-date.browser.js chromium

## Elegibilidad de proveedores favoritos — 26 de octubre de 2026

Compilación correcta, **226 pruebas unitarias** y **100 comprobaciones de
Chromium** aprobadas: 29 del recorrido nuevo y 71 de la regresión de favoritos.
Se comprueban `false`/`null`, proveedores mixtos e inactivos, cambios de rol
entre apertura y guardado, reintentos idénticos con relaciones heredadas y
conservación del archivo ante rechazos. La interfaz a 375/1440 px filtra
tabla, conteos, búsqueda, opciones, selección final e historial de materiales.
Guardar un tipo con relaciones heredadas no elegibles retira solo esas
relaciones; los conflictos y el resto del recorrido se conservan.

Sin errores ni advertencias de React/React Aria; capturas revisadas visualmente.
[Reporte de elegibilidad](tests/evidence/favorites/chromium-favorites-eligibility.browser.json)
y [regresión de favoritos](tests/evidence/favorites/chromium-favorites.browser.json).
Reproducción:

    npm test
    npm run build
    node scripts/verify-aria-browser.mjs tests/favorites-eligibility.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/favorites.browser.js chromium

### Menús de filtros personalizados · 26 de octubre de 2026

`CustomFilterSelect` comparte presentación y selección exclusiva con o sin
subcategorías. Se aplica a OC, OCM, tipo de orden, costos de maquila, materiales
por producto y clase de documento. Las reglas visuales están en el master;
los selectores de formulario y condiciones de columna no cambian.

Pasaron 215 comprobaciones en Chromium a 375/868/1440 px: superficie, densidad,
selección, encabezados, ausencia de iconos decorativos, límites y scroll,
navegación por teclado, Escape, clic fuera, URL, recarga y retirada del filtro.
El recorrido no modifica registros. También pasaron las 66 comprobaciones del
editor de costos, las 226 pruebas unitarias y la compilación de producción.
Las capturas de listas agrupadas y simples se revisaron visualmente.

Reportes: [menús compartidos](tests/evidence/aria/chromium-custom-filter-menus.browser.json)
y [regresión de costos](tests/evidence/costs/chromium-maquila-costs.browser.json).

La regresión ampliada `scripts/verify-order-filters.ts` se detiene en una
expectativa previa del texto de ayuda: busca «No cuentan otros renglones de esa
OCM.», ausente en la definición actual. Esa descripción y esa expectativa no
se modificaron en este ajuste; no se considera superada la regresión completa.

Reproducción:

    npm run build
    npm test
    node scripts/verify-aria-browser.mjs tests/custom-filter-menus.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/maquila-costs.browser.js chromium
## Entrega de OCM anterior a sus OC asociadas — 26 de octubre de 2026

Compilación correcta, **231 pruebas unitarias** y **26 comprobaciones de
Chromium** aprobadas. Las cinco pruebas unitarias nuevas cubren una o varias
OC, mínimo por día de Bogotá, igualdad, fecha posterior, OC no seleccionadas,
compras sin asociación y fuentes actualizadas/manipuladas. Los rechazos
conservan archivo, cabeceras, renglones, vínculos y consecutivos.

El navegador selecciona los orígenes en orden inverso de entrega y verifica
el mínimo correcto, banner con foco, campo inválido, persistencia del error
al cambiar a otra fecha inválida y corrección a una anterior. También fuerza
un rechazo real de API después de la revisión y comprueba HTTP 422,
`fields.fecha_solicitada_entrega` y conservación del borrador a 375/1440 px.
Sin avisos ni errores de React/React Aria; capturas revisadas visualmente.

[Reporte](tests/evidence/ocm/chromium-material-demand-delivery.browser.json).
Reproducción:

    npm test
    npm run build
    node scripts/verify-aria-browser.mjs tests/material-demand-delivery.browser.js chromium


## Vinculación manual OC–OCM — 27 de octubre de 2026

Compilación y **242 pruebas automatizadas** aprobadas, incluidas 11 pruebas nuevas de consulta acotada por OC, identidad, elegibilidad, cobertura, sustitución de anuladas, persistencia, conflictos, concurrencia con creación consolidada, reintentos y fechas. La integridad conserva duplicados históricos y bloquea nuevas coberturas duplicadas, incluso al reactivar o sustituir un material. No cambia el esquema ni los precios de órdenes.

**Chromium, Firefox y WebKit:** 74 comprobaciones de creación consolidada y 36 de vinculación por motor, a 375, 768, 1024 y 1440 px. Incluyen búsqueda, teclado, cancelación, error del servicio, conflicto, borrador, compartir OCM, entrega tardía y validación estricta al editar después. Se comprueba foco y scroll, incluido el cierre concurrente del producto que elimina la sección de abastecimiento. Sin avisos de React/React Aria.

El recorrido general de Chromium aprueba **598 comprobaciones**. Su reloj de fixture y los selectores de menús/diálogos se adaptaron a los controles actuales, manteniendo las aserciones. La comprobación de reinicio recupera íntegramente las 28 colecciones. Los hashes de la base real y de `Planeacion/db.md` permanecen iguales a los respaldos.

[Informe y hashes](tests/evidence/manual-supply/report.json), [recorrido general](tests/evidence/manual-supply/general-browser.json), [reinicio](tests/evidence/manual-supply/restart.json), [captura de escritorio](tests/evidence/ocm/chromium-manual-link-1440.png), [captura móvil](tests/evidence/ocm/chromium-manual-link-375.png). Recuperación y comandos en [VINCULACION-OCM.md](VINCULACION-OCM.md).

## Autorización múltiple — 27 de octubre de 2026

Disponible en No autorizadas de Productos y Materiales, incluidos Otros. Selección por casilla o fila, contador, cancelación y diálogo compartido con autorización individual. La sesión se desmonta al cambiar búsqueda, filtros, ordenación, página, vista, grupo o ruta, o al cancelar/finalizar; no se persiste ni conserva una caché de selección. No se fuerza la recolección de basura.

**254 pruebas automatizadas aprobadas**, incluidas 11 nuevas de autorización: OC/OCM/Otros, firmas obligatorias, listas inválidas o repetidas, fecha común, persistencia íntegra, órdenes inexistentes/anuladas/autorizadas, rechazo atómico, concurrencia y regresión individual. Compilación de producción aprobada.

**Chromium y WebKit: 44 comprobaciones por motor (88 en total)**, con 54 órdenes creadas en una base temporal para cubrir también virtualización y paginación. Se verifican casillas, fila, teclado, enlaces, todos los cambios de contexto, regreso sin selección, foco del buscador, firmas, cierre y reapertura, listas OCM/Otros, presentación a 375 y 1440 px, conflicto real del servicio, recarga/descarte de las afectadas, revisión obligatoria, bloqueo durante envío y ausencia de cambios parciales. Sin errores ni advertencias de React/React Aria. Capturas revisadas visualmente. Firefox no pudo iniciar su ejecutable (`browserType.launch: spawn UNKNOWN`) en dos intentos; no se afirma cobertura de ese motor.

[Chromium](tests/evidence/authorization/chromium-order-authorization.browser.json), [WebKit](tests/evidence/authorization/webkit-order-authorization.browser.json), [escritorio](tests/evidence/authorization/chromium-1440.png), [móvil](tests/evidence/authorization/chromium-375.png).

Reproducción:

    npm test
    npm run build
    node scripts/verify-aria-browser.mjs tests/order-authorization.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/order-authorization.browser.js webkit

API: `POST /api/commands` con `name: "authorizeOrders"` y `payload: { ids: string[], confirm: true }`. Éxito: `{ result: {} }`; entrada inválida: `VALIDATION`; selección desactualizada: `AUTHORIZATION_CHANGED`, con `details.orders` que identifica todas las afectadas. La transacción comprueba el conjunto antes de modificar datos y aplica una misma fecha. El contrato individual permanece `{ id, confirm: true }`.

## Cotización de materiales — 30 de octubre de 2026

Implementada selección superior a siete materiales con bloqueo exclusivo de Elaborar OCM, cotización por material/proveedor, un destinatario por proveedor compartido entre sus materiales, selección de proveedores adicionales, correo manual, reglas por cargo y plantilla global de asunto/cuerpo con ajustes por lote. La revisión utiliza datos del servidor y una revisión esperada; los cambios obligan a actualizar y revisar de nuevo. Transporte exclusivamente simulado y registro transaccional sin compras ni vínculos nuevos.

Compilación de producción aprobada y **308 pruebas automatizadas aprobadas** en la suite observada, incluidas **15 pruebas nuevas de cotización y migración**. Se cubren más de siete materiales, homónimos, suma/adicional exactos, contactos ambiguos, destinatarios inválidos o repetidos, proveedores sin rol, fuentes manipuladas, plantilla global y conflictos, persistencia, migración con respaldo y rollback ante fallo del simulador. Los fixtures históricos de reglas de orden usan un reloj fijo para no caducar por sus fechas de entrega.

**Chromium y WebKit: 40 comprobaciones por motor (80 en total)**. Se verifican Configuración, persistencia y variables de la plantilla, ocho materiales seleccionados, bloqueo de OCM y desbloqueo al volver a siete, proveedores fuera de favoritos, teclado, un contacto o correo manual compartido, cantidades, revisión, foco, conflicto real por cambio de contacto, conservación de ajustes, bloqueo de cierre/doble envío y registro de ocho mensajes simulados. Capturas de 375 y 1440 px revisadas visualmente; todos los botones del pie de revisión permanecen dentro de la ventana. Sin errores ni advertencias de React o React Aria.

**Regresión de OCM en Chromium: 76 comprobaciones aprobadas**, incluidas creación y persistencia, límite de siete al elaborar, selección ampliada para cotización, conflictos, búsqueda/filtros/paginación y 375/768/1024/1440 px. No se ejecutó el empaquetado portable ni el recorrido general completo como parte de esta validación.

La migración del archivo local generó un respaldo exacto del estado previo. La comparación confirma que las 28 colecciones anteriores conservan íntegramente sus registros y que solo se añadió la colección de plantilla. El SHA256 del DBML de referencia permanece igual. [Informe de migración](tests/evidence/quotations/migration-report.json).

[Chromium](tests/evidence/quotations/chromium-material-quotation.browser.json), [WebKit](tests/evidence/quotations/webkit-material-quotation.browser.json), [regresión OCM](tests/evidence/ocm/chromium-material-demand.browser.json), [captura móvil](tests/evidence/quotations/chromium-capture-375.png), [revisión móvil](tests/evidence/quotations/chromium-review-375.png), [revisión de escritorio](tests/evidence/quotations/chromium-review-1440.png). Contrato, reproducción y extensión provisional en [COTIZACIONES-MATERIALES.md](COTIZACIONES-MATERIALES.md).

## Hoja alternativa de OC de productos — 30 de octubre de 2026

Implementación en `codex/hoja-oc-productos`, creada desde `master` en `931b0fb`, conservando los cambios locales previos. Activación independiente y desactivada por defecto en Configuración → Apariencia. Materiales/OCM mantiene su tabla actual. Contrato: [HOJA-OC-PRODUCTOS.md](HOJA-OC-PRODUCTOS.md); estándar visual actualizado en [design-system/MASTER.md](design-system/MASTER.md).

`npm run build` aprobado, incluido TypeScript. Vite informa que el chunk principal supera 500 kB; el módulo de esta hoja y sus estilos se cargan de forma diferida. `npm test`: **311 pruebas aprobadas, 0 fallos**. La suite específica contiene 14 pruebas de identidad, saldos, propagación, Bogotá, protección antes de interpretar, contradicciones, referencias, campos relacionados, matrices TSV con comillas/saltos/filas vacías, 17 variantes de filtros, originales y rollback de operaciones mixtas y nuevos lotes.

Pruebas de navegador sobre bases temporales independientes:

| Suite | Chromium | WebKit |
| --- | ---: | ---: |
| Preferencia, tres hojas, edición y tabla OCM clásica | 10 | 10 |
| Rangos, portapapeles, recuperación, conflictos y herramientas | 33 | — |
| Las 17 variantes de filtros y controles | 43 | 43 |
| Estados desde la hoja, tolerancias y confirmación/cancelación | 22 | 22 |
| Virtualización y guardado de 5.000 lotes | 18 | — |
| Ciclo global desde detalle y formulario clásico de lote | 23 | — |
| Regresión de creación alternativa y clásica | 56 | — |
| Regresión del detalle de OC/OCM | 65 | — |
| Regresión de abastecimiento y elaboración de OCM | 76 | — |

**421 comprobaciones de navegador aprobadas** en estas ejecuciones. Reportes sin errores de página ni advertencias React/React Aria. El portapapeles del recorrido completo se valida en Chromium; no se afirma la misma cobertura para WebKit.

Se comprueban nueve/24 columnas, selección por identidades, autorización de la OC completa con renglones ocultos, propagación por propietario, filas estables durante edición, reaplicación explícita de consultas, columnas persistentes por hoja, prioridad del calendario/autocompletado y factura mediante el selector existente. La recuperación sustituye el borrador actual, permanece sin guardar y conserva el conflicto contra cambios concurrentes. Guardar y continuar utiliza los originales actualizados antes de actuar sobre estados; descartar antes de crear lotes conserva los datos persistidos. Se prueban impresión/documento para varias filas de una misma OC, bloqueo con varias OC, regreso desde impresión, triángulo de sobreentrega accesible y recuperación de la barra oculta.

La prueba de volumen genera **más de 5.000 lotes**, recorre 0/25/50/75/100 % sin crecimiento acumulativo del DOM y mantiene menos de 50 filas montadas. Navega con teclado a filas previamente desmontadas, comprueba los índices accesibles globales y encabezados visibles, y verifica desplazamiento horizontal interno a 375 px sin columnas fijas. Un bloque de más de 1 MB guarda **5.000 ubicaciones en una única operación atómica**. Capturas de 1440 × 900 y 375 × 812 revisadas visualmente.

Las transiciones conservan lotes, IDs y datos al anular/reabrir. Se confirma el conjunto que anula el último lote, la reapertura de todos los lotes de un producto anulado, la reapertura selectiva y el cierre manual con tolerancia, sin cierre automático de sus lotes. Cancelar conserva la base y el rango. La semilla conserva los lotes anulados; las pruebas no reinician la base local de trabajo. El motor y las comprobaciones de concurrencia son comunes a ambas vistas: [CICLO-LOTES.md](CICLO-LOTES.md).

La regresión del detalle detectó un fixture antiguo que intentaba reabrir una OCM con cobertura histórica duplicada. Se conserva la regla comercial: ahora la prueba distingue una reapertura válida y el rechazo HTTP 422 `SUPPLY_CHANGED`, comprueba el aviso visible y confirma que el rechazo no escribe datos. No fue necesario modificar la restricción de abastecimiento.

Reproducción, después de compilar:

```powershell
npm test
npm run build
node scripts/verify-aria-browser.mjs tests/product-order-sheet.browser.js chromium
node scripts/verify-aria-browser.mjs tests/product-order-sheet.browser.js webkit
node scripts/verify-aria-browser.mjs tests/product-order-sheet-interaction.browser.js chromium
node scripts/verify-aria-browser.mjs tests/product-order-sheet-filters.browser.js chromium
node scripts/verify-aria-browser.mjs tests/product-order-sheet-filters.browser.js webkit
node scripts/verify-aria-browser.mjs tests/product-order-sheet-states.browser.js chromium
node scripts/verify-aria-browser.mjs tests/product-order-sheet-states.browser.js webkit
node --import tsx scripts/verify-product-sheet-large.ts
node scripts/verify-aria-browser.mjs tests/product-lot-lifecycle.browser.js chromium
node scripts/verify-aria-browser.mjs tests/order-entry-sheet.browser.js chromium
node scripts/verify-aria-browser.mjs tests/order-detail.browser.js chromium
node scripts/verify-aria-browser.mjs tests/material-demand.browser.js chromium
```

Evidencias: [interacciones](tests/evidence/aria/chromium-product-order-sheet-interaction.browser.json), [filtros Chromium](tests/evidence/aria/chromium-product-order-sheet-filters.browser.json), [filtros WebKit](tests/evidence/aria/webkit-product-order-sheet-filters.browser.json), [estados Chromium](tests/evidence/aria/chromium-product-order-sheet-states.browser.json), [estados WebKit](tests/evidence/aria/webkit-product-order-sheet-states.browser.json), [volumen](tests/evidence/aria/chromium-product-order-sheet-virtual.browser.json), [ciclo clásico](tests/evidence/aria/chromium-product-lot-lifecycle.browser.json), [detalle](tests/evidence/aria/chromium-order-detail.browser.json), [escritorio](tests/evidence/aria/product-sheet-1440.png), [móvil](tests/evidence/aria/product-sheet-375.png), [captura de interacción](tests/evidence/aria/product-sheet-interaction-desktop.png) y [rechazo de reapertura OCM](tests/evidence/order-detail/material-reopen-conflict.png).

Esta validación no incluye empaquetado portable, Firefox ni el recorrido general completo de `browser-journey.js`.

## Congelamiento y rendimiento de la hoja — 30 de octubre de 2026

**Commit de recuperación: `d4273e5`**, en `codex/hoja-oc-productos`, anterior a cualquier corrección de esta incidencia. Conserva el estado completo del proyecto, incluidos los cambios locales de la implementación previa.

Se reprodujo el fallo con la aplicación real servida por Vite y React de desarrollo con StrictMode. Tras aplicar un filtro personalizado se produjo `TypeError: Cannot read properties of undefined (reading 'key')` en `sheetValue`, llamado por el getter del `Proxy` de celdas desde `react-dom` → `addObjectDiffToProperties` → `logComponentRender`. React inspeccionaba una propiedad que no era una columna; el `Proxy` asumía lo contrario. Las pruebas previas ejecutaban `dist`, cuyo React de producción no utiliza ese inspector. La escritura del servicio podía haber terminado aunque se bloqueara la actualización de la interfaz. [Captura previa](tests/evidence/product-sheet-performance/development-before.png).

Se eliminó el `Proxy`: las columnas conocidas tienen lectores de prototipo finitos, caché privada y no enumerable, e inspección de propiedades ajenas segura. La regresión unitaria comprueba lecturas de `then`, `toJSON`, propiedades de depuración y símbolos, serialización y estabilidad de la caché. Se verifica además que una superposición vacía conserva la base y que las columnas conservan su identidad.

Optimizaciones verificadas:

- Los filtros leen únicamente columnas activas; sin condiciones devuelven el mismo array y no consultan celdas. Una prueba con lectores que fallan si se acceden columnas inactivas protege esta propiedad.
- La proyección y la visualización comparten el modelo cuando corresponde; cambiar una consulta no reconstruye la base ni los modelos de todas las filas. Columnas y opciones de menú conservan referencias estables.
- Los marcadores de edición/error consultan índices `Set`, evitando recorrer todo el borrador o todos los errores por cada celda visible.
- El scroll actualiza la ventana al cruzar una fila, no por cada píxel. El adaptador conserva el renderizador mientras no cambia la identidad de su primera fila y no reescribe atributos accesibles que ya son correctos.
- Los menús montan hasta 50 valores y el resumen hasta 50 enlaces de error. Su navegación conserva selecciones, la búsqueda cubre todos los valores y los enlaces localizan celdas fuera de la ventana. Las filas de datos siguen virtualizadas y sin paginación.
- El aviso de error se conserva entre renders que no cambian sus errores, evitando repetir foco y scroll.

Medición local, Node v24.17.0, mediana de cinco muestras sobre modelos nuevos en cada operación:

| Lotes generados | Operación | Antes (ms) | Después (ms) |
| --- | --- | ---: | ---: |
| 5.000 | Construir y filtrar sin condiciones | 114,20 | 0,61 |
| 5.000 | Construir y aplicar un filtro | 121,70 | 7,90 |
| 5.000 | Construir, filtrar y ordenar | 115,34 | 6,00 |
| 20.000 | Construir y filtrar sin condiciones | 480,59 | 2,15 |
| 20.000 | Construir y aplicar un filtro | 492,21 | 27,15 |
| 20.000 | Construir, filtrar y ordenar | 477,72 | 21,72 |

Estas cifras corresponden al procesamiento del modelo, no al tiempo completo de interacción. [Resultados originales antes](tests/evidence/product-sheet-performance/model-before.json) y [después](tests/evidence/product-sheet-performance/model-after.json). El benchmark no escribe datos de compras; genera registros en memoria.

Compilación y TypeScript aprobados. **314 pruebas automatizadas aprobadas**, cero fallos. Vite conserva su aviso del chunk principal superior a 500 kB.

Pruebas de navegador de esta corrección, con bases temporales independientes:

| Recorrido | Entorno y motor | Comprobaciones |
| --- | --- | ---: |
| Las 17 variantes de filtros y controles | Desarrollo, Chromium | 43 |
| Las 17 variantes de filtros y controles | Desarrollo, WebKit | 43 |
| Rangos, recuperación, conflictos, guardado, autorización y documentos | Desarrollo, Chromium | 33 |
| Estados, cierre manual, tolerancia, confirmación y cancelación | Desarrollo, Chromium | 22 |
| 27 acciones consecutivas con más de 5.000 lotes | Desarrollo, Chromium | 92 |
| El mismo recorrido de 27 acciones | Producción, Chromium | 92 |
| Virtualización, índices globales, móvil y guardado atómico de 5.000 lotes | Producción, Chromium | 18 |
| Creación clásica/alternativa, revisión, edición e impresión | Producción, Chromium | 56 |
| Abastecimiento y tabla clásica OCM | Producción, Chromium | 76 |

**475 comprobaciones de navegador aprobadas** en estas ejecuciones; sin errores de página, advertencias React/React Aria ni overlays de error de Vite. Los recorridos consecutivos no recargan la página entre acciones. Comprueban filtros personalizados, condición y selección de valores de columna, quitar filtros, las tres hojas, búsqueda, orden y quitar orden, columnas, rangos y teclado, edición/confirmación, guardado y respuesta posterior, pegado válido, descarte, 5.000 rechazos protegidos, localización/corrección de errores, preparación y descarte de 5.000 ediciones válidas, diálogos de nuevos lotes/nueva OC y ocultar/recuperar herramientas. Únicamente Guardar envía un comando de datos en ese recorrido.

Cada acción mantiene menos de 50 filas montadas y se verifica contra un presupuesto de 4 segundos, incluyendo automatización y espera de dos frames. El máximo medido del recorrido fue **1.525 ms en desarrollo y 1.060 ms en producción**; guardar y continuar usando la interfaz tomó 664/397 ms, y preparar 5.000 cambios válidos, 1.198/1.060 ms. Son muestras locales individuales de interacción, no percentiles ni garantías de hardware. Las capturas del filtro extenso y del resumen de errores se revisaron visualmente.

Reproducción principal, desde PowerShell:

```powershell
npm test
npm run build
node --import tsx scripts/benchmark-product-sheet.ts after
$env:PROTOTIPO_BROWSER_MODE='development'
node scripts/verify-aria-browser.mjs tests/product-order-sheet-filters.browser.js chromium
node scripts/verify-aria-browser.mjs tests/product-order-sheet-filters.browser.js webkit
node scripts/verify-aria-browser.mjs tests/product-order-sheet-interaction.browser.js chromium
node scripts/verify-aria-browser.mjs tests/product-order-sheet-states.browser.js chromium
node --import tsx scripts/verify-product-sheet-large.ts tests/product-order-sheet-performance.browser.js
$env:PROTOTIPO_BROWSER_MODE='production'
node --import tsx scripts/verify-product-sheet-large.ts tests/product-order-sheet-performance.browser.js
node --import tsx scripts/verify-product-sheet-large.ts
node scripts/verify-aria-browser.mjs tests/order-entry-sheet.browser.js chromium
node scripts/verify-aria-browser.mjs tests/material-demand.browser.js chromium
```

El runner de desarrollo usa Vite, StrictMode y un proxy al servicio de prueba; el de producción usa `dist`. Los reportes incluyen su modo y utilizan nombres separados. Evidencias: [filtros Chromium desarrollo](tests/evidence/aria/chromium-development-product-order-sheet-filters.browser.json), [WebKit desarrollo](tests/evidence/aria/webkit-development-product-order-sheet-filters.browser.json), [interacciones](tests/evidence/aria/chromium-development-product-order-sheet-interaction.browser.json), [estados](tests/evidence/aria/chromium-development-product-order-sheet-states.browser.json), [recorrido y tiempos desarrollo](tests/evidence/aria/chromium-development-product-order-sheet-performance.browser.json), [producción](tests/evidence/aria/chromium-product-order-sheet-performance.browser.json), [filtro extenso](tests/evidence/product-sheet-performance/production-5000-values.png) y [errores masivos](tests/evidence/product-sheet-performance/production-5000-errors.png).

## Selección por arrastre y borrado — 3 de noviembre de 2026

La hoja utiliza cursor de cruz en las celdas. El mouse selecciona rectángulos; al arrastrar hacia los bordes, la hoja desplaza las filas y columnas, incluidas las virtualizadas. Delete, Del y Supr vacían la celda activa o todo el rango; se utiliza la validación y el borrador del pegado. Los campos protegidos y valores obligatorios inválidos se conservan y señalan; los valores válidos del mismo rango se preparan sin guardar automáticamente. En un campo abierto para edición se conserva el borrado normal de texto.

Compilación y **314 pruebas automatizadas aprobadas**. Dos fechas de pruebas de documentos y códigos se actualizaron a fechas futuras porque habían quedado antes de la fecha actual y bloqueaban esas pruebas. El recorrido de interacción pasó en Chromium de desarrollo y WebKit de producción: selección de dos dimensiones, variantes de tecla, una celda, rango, celdas protegidas, campos obligatorios, aplicación parcial y edición de texto. El recorrido con más de 5.000 lotes comprueba desplazamiento horizontal y vertical durante el arrastre, ventana de filas acotada y navegación posterior. También pasó la regresión de interacción de la hoja en Chromium. Las pruebas de navegador usan bases temporales.

Evidencias: [Chromium desarrollo](tests/evidence/aria/chromium-development-product-sheet-drag-delete.browser.json), [WebKit](tests/evidence/aria/webkit-product-sheet-drag-delete.browser.json) y [virtualización](tests/evidence/aria/chromium-product-order-sheet-virtual.browser.json).

## Boceto en edición de órdenes — 3 de noviembre de 2026

La preferencia de apariencia existente se aplica al abrir el formulario de creación o edición. El paso 1 usa la hoja con siete posiciones para productos, materiales y otros; el paso 2 conserva su revisión. En órdenes de productos autorizadas el proveedor y los productos permanecen bloqueados, no se pueden vaciar sus renglones ni añadir productos en posiciones vacías, y sí se pueden ajustar cantidades y precios. El código mostrado corresponde al código histórico de cada renglón; al sustituir un producto antes de autorización se presenta el código asignado al nuevo producto. Confirmar un cambio de proveedor prepara las siete posiciones y volver al proveedor original recupera el borrador.

Compilación y 314 pruebas automatizadas aprobadas. La prueba de navegador usa una base temporal y comprueba creación, edición de los tres tipos, preferencia desactivada, bloqueo de filas autorizadas, código histórico y sustitución, revisión/retorno, guardado y reemplazo de proveedor. Pasó en Chromium de producción y en Chromium y WebKit de desarrollo. En WebKit de producción las comprobaciones funcionales terminaron, pero el runner detectó advertencias del navegador sobre un recurso precargado y no registró esa ejecución como aprobada.

Evidencias: [Chromium](tests/evidence/aria/chromium-order-entry-sheet.browser.json), [Chromium desarrollo](tests/evidence/aria/chromium-development-order-entry-sheet.browser.json) y [WebKit desarrollo](tests/evidence/aria/webkit-development-order-entry-sheet.browser.json).

## Diagnóstico de navegación rápida — 3 de noviembre de 2026

Se reprodujo el retraso de flechas en Chromium, con una base temporal de más de 5.000 lotes, 24 columnas y ventana de 1440 × 900. Se enviaron eventos reales a 8, 30 y 60 teclas/s desde un emisor independiente de la respuesta de la página. Se midieron producción y desarrollo, navegación horizontal/vertical, límites, extensión con Shift, posición final, commits React, frames, CPU, heap y nodos/listeners antes y después de GC. Todas las posiciones finales coincidieron con los movimientos enviados. La compilación pasó; esta intervención añade diagnóstico y pruebas, sin modificar la implementación de la tabla.

El control de producción sin perfilador ni hook añadido dejó **7.510 ms de cola** tras 144 flechas horizontales a 60/s con 744 celdas montadas; la misma base filtrada a una sola fila dejó **9 ms**. El control vertical dejó 9.095 ms. Las trazas completas atribuyen el coste dominante a reconstrucciones de React/React Aria: unas dos por flecha; incluso 120 flechas contra el borde inmóvil causaron 240 commits. El heap de producción alcanzó 215,6 MiB, pero las tandas sucesivas regresaron a 30,49/30,51/30,53 MiB tras GC, con nodos y listeners estables. No se observó fuga acumulativa en estos recorridos. El desarrollo amplifica el coste; sus tiempos se registran por separado.

Los recorridos completos suman 1.008/613 flechas en producción/desarrollo y los controles 468/368. Los retrasos son un **hallazgo de rendimiento pendiente de corrección**, aunque las comprobaciones de integridad del diagnóstico pasen. No se consideran una aceptación de fluidez. El informe detalla las causas, límites de la medición, prioridades de corrección y comandos reproducibles.

Evidencias: [informe completo](DIAGNOSTICO-NAVEGACION-OC.md), [análisis consolidado](tests/evidence/product-sheet-keyboard/analysis.json), [control de producción](tests/evidence/aria/chromium-product-sheet-keyboard-control.browser.json), [control de desarrollo](tests/evidence/aria/chromium-development-product-sheet-keyboard-control.browser.json), [perfil CPU de producción](tests/evidence/product-sheet-keyboard/production-fast-vertical.cpuprofile) y [perfil de desarrollo](tests/evidence/product-sheet-keyboard/development-fast-vertical.cpuprofile).

## Optimización de navegación de OC — 3 de noviembre de 2026

Commit de recuperación `ef493cb` sobre `d25f20f`, en `codex/hoja-oc-productos`. Se probó A con selección separada y colección dinámica estable de React Aria. Las tres repeticiones de producción dejaron un p95 vertical de 139,6 ms y activaron el paso a **B**. La implementación final utiliza una tabla HTML con semántica de grid, filas/celdas memoizadas y virtualización en ambos ejes; conserva React Aria para controles, filtros, fechas y ayudas. Se mantiene una sola implementación activa. El `DataTable` común, los comandos, las dependencias y los datos de compras no se modificaron.

El controlador procesa todas las teclas inmediatamente y agrupa su representación por frame. Cursor y rango no invalidan los contenidos; las herramientas solo reaccionan al resumen relevante de la selección. Las acciones capturan IDs estables antes de resolver un borrador. Cambio de hoja, consulta, columnas y guardado cancelan la selección pendiente. Los editores y encabezados con filtro abierto permanecen montados sin dibujar posiciones intermedias. Se conserva el foco del menú al deshabilitar «Seleccionar todas», y el editor se revela al pulsar F2 después de una ráfaga, también en WebKit.

### Presupuestos y memoria

Sobre más de 5.000 lotes, 24 columnas, 1440 × 900 y el mismo equipo del diagnóstico, se ejecutaron tres repeticiones por entorno, con eventos confiables a 8/30/60 teclas/s desde un emisor independiente. Seis escenarios por repetición: navegación pausada, horizontal/vertical rápida, borde inmóvil, movimiento sostenido con cambio de dirección y extensión con Shift. **Todos cumplen p95, cola mediana y cola máxima**, con destinos exactos y sin comandos de datos. Producción: p95 horizontal/vertical 7,8/5,7 ms; cola mediana 4,4/1,8 ms, frente a los 7.510/9.095 ms originales. Desarrollo con StrictMode: p95 27,0/12,6 ms y cola mediana 11,1/2,0 ms. La vertical nueva de desarrollo usa 180 teclas; el control antiguo usó 80 y se identifica como carga distinta.

Diez recorridos por entorno (2.160 flechas, más saltos al inicio/final de la base) mantienen nodos y listeners estables. En ventanas finales equivalentes: producción 1.027 nodos/255 listeners y 23 filas/230 celdas; desarrollo 1.033/258 y el mismo montaje. Los tres últimos heaps tras GC difieren menos de 10 MiB: 9,41/9,42/9,42 MiB y 28,51/27,83/27,78 MiB. Las esperas devuelven booleanos para que Playwright no retenga celdas desmontadas mediante `JSHandle`s; se repitió la prueba tras detectar esa retención del arnés.

El perfil de CPU se ejecutó separadamente de los controles de aceptación. El pico de heap JS muestreado en el recorrido comparable pasó de 215,6 a 21,8 MiB en producción, y de 387,3 a 57,6 MiB en desarrollo. Script vertical de producción: 13.433 a 142 ms. No se atribuyen estas cifras a la memoria total del proceso. Las evidencias originales del diagnóstico se conservaron íntegramente.

### Funciones y regresión

Compilación aprobada y **319 pruebas automatizadas aprobadas**, incluidas las invariantes de procesamiento por frame, límites sin publicaciones, direcciones estables, cancelación de frames y liberación de suscripciones. La fixture de renderizado pasó en Chromium y WebKit con StrictMode: copiar/pegar/borrar/editar antes del frame lee el destino actualizado; navegar dentro de la ventana y repetir contra un borde no ejecuta nuevamente `renderCell`.

Los recorridos de navegador pasaron en Chromium de producción y WebKit de desarrollo: rangos, arrastre, borrado, calendario/autocompletado, 17 filtros, errores, guardado mixto, recuperación, conflictos, autorización con renglones ocultos, documentos, impresión, nuevos lotes y estados. Las pruebas con más de 5.000 lotes verifican editor/foco fuera de pantalla, F2 inmediato, Escape sin desplazamiento, filtro abierto al desplazar columnas, cambio de hoja y guardado con un movimiento pendiente, índices accesibles, móvil y guardado atómico de 5.000 registros. Las regresiones de creación/edición de los tres tipos, preferencia desactivada, detalle, impresión y Abastecimiento/OCM pasaron en Chromium. Se revisaron las capturas de escritorio y móvil.

El recorrido funcional completo de interacción terminó también en WebKit de producción, pero el runner lo rechazó por una advertencia del navegador sobre la precarga de `dates-*.js`; no se presenta esa ejecución como aprobada. La misma interacción pasó en WebKit de desarrollo. La comprobación de copia captura el evento nativo y su matriz, sin solicitar permisos de portapapeles incompatibles con WebKit.

Resultados y comandos: [informe de optimización](OPTIMIZACION-NAVEGACION-OC.md), [mediciones y hashes](tests/evidence/product-sheet-navigation/analysis.json), [producción](tests/evidence/product-sheet-navigation/production-acceptance.json), [desarrollo](tests/evidence/product-sheet-navigation/development-acceptance.json), [memoria de producción](tests/evidence/product-sheet-navigation/production-memory.json), [memoria de desarrollo](tests/evidence/product-sheet-navigation/development-memory.json), [invariantes Chromium](tests/evidence/aria/chromium-development-product-sheet-grid-render.browser.json), [WebKit](tests/evidence/aria/webkit-development-product-sheet-grid-render.browser.json), [interacción](tests/evidence/aria/chromium-product-order-sheet-interaction.browser.json), [interacción WebKit](tests/evidence/aria/webkit-development-product-order-sheet-interaction.browser.json), [virtualización y móvil](tests/evidence/aria/chromium-product-order-sheet-virtual.browser.json) y [foco y carreras WebKit](tests/evidence/aria/webkit-development-product-sheet-navigation-behavior.browser.json).


## Estado del producto derivado de sus lotes — 5 de noviembre de 2026

Implementado en `codex/hoja-oc-productos`, preservando los cambios locales anteriores. El estado guardado de cada renglón se sincroniza en la transacción de lotes: alguno abierto → seguimiento; ninguno abierto y alguno cerrado → cerrado; todos anulados o ninguno → anulado. Crear/reabrir un lote reactiva el producto sin modificar hermanos. No se añade cálculo al arranque, consultas, renderizado ni navegación. Se eliminan el cierre/reapertura directa, el menú Productos de la hoja y Seguimiento por cerrar; permanece Anular producto en el detalle y las acciones de lotes. La tolerancia queda informativa.

**Compilación aprobada y 327 pruebas automatizadas aprobadas.** Cubren combinaciones de estados, un cerrado y tres anulados, cero lotes, creación individual/múltiple sobre cerrados/anulados, cierre automático fuera de tolerancia, eliminación, propietarios independientes, confirmaciones, conflictos concurrentes, snapshots obsoletos, datos preservados y transacciones sin escrituras parciales. `git diff --check` sin errores. Revisión de React: sin nuevas suscripciones ni cálculos de estado por celda; se retiran los cálculos de disponibilidad del filtro obsoleto de ambos modelos de lectura.

Recorridos actuales aprobados en **Chromium de producción**, con bases temporales:

| Recorrido | Comprobaciones | Evidencia |
|---|---:|---|
| Detalle y formulario clásico: anular, cancelar, crear sobre anulado, borrar, reabrir lotes y recargar | 25 | [Ciclo clásico](tests/evidence/aria/chromium-product-lot-lifecycle.browser.json) |
| Hoja: cierre automático, tolerancia informativa, resultado de anulación, nuevo lote y filtros retirados | 22 | [Estados de la hoja](tests/evidence/aria/chromium-product-order-sheet-states.browser.json) |
| Todas las 16 variantes vigentes de filtros | 41 | [Filtros](tests/evidence/aria/chromium-product-order-sheet-filters.browser.json) |
| Rangos, edición, controles, guardado/descartado y conflictos de la hoja | 34 | [Interacción](tests/evidence/aria/chromium-product-order-sheet-interaction.browser.json) |
| Detalle a 375/799/1440 px; regresión de estados y recepciones OCM; despliegue de 280 lotes | 65 | [Detalle y OCM](tests/evidence/aria/chromium-order-detail.browser.json) |
| Creación/revisión/regreso/edición/impresión, tipos de orden y preferencias | 70 | [Creación](tests/evidence/aria/chromium-order-entry-sheet.browser.json) |
| Abastecimiento, vínculos y OCM | 76 | [Abastecimiento](tests/evidence/ocm/chromium-material-demand.browser.json) |
| Navegación/virtualización con más de 5.000 lotes, DOM acotado y móvil | 20 | [Virtualización](tests/evidence/aria/chromium-product-order-sheet-virtual.browser.json) |

**WebKit:** 22 comprobaciones de estados de la hoja aprobadas en producción y 25 del ciclo clásico aprobadas en desarrollo, sin errores ni advertencias de consola en esas ejecuciones. [Hoja](tests/evidence/aria/webkit-product-order-sheet-states.browser.json), [ciclo clásico](tests/evidence/aria/webkit-development-product-lot-lifecycle.browser.json). Se revisó visualmente la captura de detalle con Anular y Agregar lote, sin Cerrar/Reabrir producto.

Limitaciones de recorridos adicionales: el ciclo clásico de WebKit en producción completa las acciones pero su runner rechaza la advertencia preexistente de precarga no utilizada de `dates-*.js`; no se declara aprobado ese recorrido en producción. El recorrido histórico `order-authorization.browser.js` se detiene buscando «Continuar autorización», botón ausente también en el HEAD anterior a este cambio; no se modifica la aplicación para satisfacer esa expectativa. La autorización y los bloqueos del servicio quedan cubiertos por la suite unitaria y la interacción actual de la hoja.

La base local se ajustó una sola vez con `npx tsx scripts/sync-demo-product-states.ts --apply`, con el servicio detenido: **dos estados de producto actualizados** y todos los demás datos conservados. El respaldo exacto y sus hashes se verificaron antes de reemplazar el archivo. [Respaldo, hashes y diferencias](tests/evidence/lifecycle/demo-product-states.json). No se reinició la demo ni se incorporó una migración al arranque.

Reproducción: `npm test`; `npm run build`; `node scripts/verify-aria-browser.mjs tests/product-lot-lifecycle.browser.js chromium`; `node scripts/verify-aria-browser.mjs tests/product-order-sheet-states.browser.js chromium`; `npx tsx scripts/verify-product-sheet-large.ts`.
