# Verificación del prototipo

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
