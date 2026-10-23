# Prototipo local de órdenes de compra · GIMED

Aplicación interactiva en español basada en `Planeacion/requisitos.md`, las 28 tablas de `Planeacion/db.md` y las restricciones R01–R13. Permite recorrer los procesos con datos ficticios y conservar los cambios en este equipo. Los archivos son placeholders y los correos se simulan.

Documentación actualizada el **14 de octubre de 2026**. Los cambios acordados están incorporados en los [requisitos vigentes](../Planeacion/requisitos.md) y en los apartados de esta guía. La [cobertura](COBERTURA.md) los relaciona con las pantallas actuales.

## Arranque

Probado con Node.js 24 y npm. Desde la carpeta `prototipo`, instala las dependencias una vez:

```powershell
npm ci --cache .npm-cache
```

Inicia interfaz y servicio con un solo comando:

```powershell
npm run dev
```

Abre [el prototipo](http://127.0.0.1:5173). La pantalla inicial es **Órdenes de compra**. El servicio usa el puerto 3001. `Ctrl+C` detiene el arranque conjunto.

Para ejecutar la versión compilada:

```powershell
npm run build
npm start
```

En este caso la interfaz y la API se sirven juntas en [el puerto 3001](http://127.0.0.1:3001).

## Uso del prototipo

La navegación se abre como un **drawer** mediante el botón de menú de la esquina superior izquierda, tanto en escritorio como en móvil. Desde **1024 px** de ancho, su icono **Fijar navegación** lo mantiene visible y reserva su espacio en el diseño, ajustando el ancho del contenido. Por debajo, la opción desaparece; reducir una ventana con el panel fijado lo convierte en flotante y libera su columna. Volver a ampliar permite fijarlo otra vez, conservándolo desfijado hasta hacerlo. El estado fijado se conserva al cambiar de sección en los anchos permitidos; el panel tiene desplazamiento interno cuando los destinos no caben.

**Desfijar navegación** mantiene el drawer abierto como panel flotante y devuelve al contenido todo el ancho disponible. En este estado se superpone al contenido sin desplazarlo, y se cierra al seleccionar una sección, pulsar su botón de cierre, presionar Escape o hacer clic en el fondo. La transición de ancho respeta la preferencia de movimiento reducido.

La entrada `/ordenes` abre **Productos** en `/ordenes/productos`; la pestaña **Materiales** usa `/ordenes/materiales` y reúne materiales y otros, con un filtro para separarlos. Cada pestaña muestra el último consecutivo y la próxima OC u OCM de su grupo. Las nuevas órdenes muestran el número bloqueado y lo asignan automáticamente; materiales y otros comparten la numeración. Si otra operación actualizó el consecutivo mientras el formulario estaba abierto, el servicio rechaza el guardado y actualiza el número para revisarlo de nuevo.

El **número de orden es siempre de solo lectura**, también al editar antes o después de autorizar. El servicio rechaza cualquier modificación y cualquier número manual al crear. El **proveedor queda bloqueado después de autorizar** para producto, material y otros, tanto en la interfaz como mediante solicitudes directas.

Las órdenes de producto se identifican como **OC** y las de materiales y otros como **OCM**. El prefijo se aplica en listados, consecutivos, revisión de órdenes, vínculos, catálogos, facturas, documentos y selección de órdenes para correo.

**Catálogos** organiza sus secciones en tres grupos principales, con el estilo de pestañas de Órdenes: **Productos** (Lista de productos, Categorías, Costos de maquila), **Materiales** (Lista de materiales, Tipos de material, Proveedores favoritos por tipo) y **Productos & materiales** (Materiales por producto, Corrugado por producto). Los botones de las secciones secundarias conservan su estilo actual. Los favoritos se configuran una vez por tipo, con filas desplegables y selección múltiple en un diálogo; se priorizan en las órdenes sin restringir otros proveedores. La migración conserva los datos anteriores con respaldo automático: [funcionamiento y recuperación](PROVEEDORES-FAVORITOS.md).

Los formularios que asignan un producto existente permiten escribir su nombre y muestran coincidencias con el `ComboBox` compartido de React Aria, con selección por identificador. En órdenes solo aparecen productos activos del proveedor de la orden, además del producto histórico que ya tenga ese renglón. Los formularios de relaciones del catálogo y la asignación GS1 consultan los productos disponibles; al asignar un código GS1, debajo del producto se muestra el proveedor asociado en un campo bloqueado.

## Requisito de filtros por columna

Cada tabla de datos indicada aquí debe ofrecer un botón de filtro en las cabeceras de sus columnas de datos. El menú compartido combina ordenamiento, selección de varios valores y condiciones adecuadas al tipo de columna; la búsqueda general se conserva y se combina con los filtros. Las columnas compuestas únicamente por acciones no llevan filtro.

| Pantalla y tabla                             | Columnas con filtro y tipo                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Órdenes de compra → Productos                | Orden/tipo (entero), proveedor (texto), productos (texto), fecha de elaboración (fecha), entrega solicitada (fecha), estado (enumeración) y total (importe).              |
| Órdenes de compra → Materiales y Otros       | Orden/tipo (entero), proveedor (texto), materiales o conceptos (texto), fecha de elaboración (fecha), entrega solicitada (fecha), estado (enumeración) y total (importe). |
| Facturas                                     | Número de factura y proveedor (texto), registro (fecha), recepciones (entero) y documentos (únicamente Con documento / Sin documento).                                    |
| Abastecimiento → Vínculos entre órdenes      | Orden de producto y orden de material (entero), producto/maquilador y material/proveedor (texto), estado del material (enumeración).                                      |
| Catálogos → Productos → Lista de productos   | Producto, maquilador, categoría, maquila/IVA y código asignado (texto); unidades por lote (entero); activo (enumeración Sí/No).                                             |
| Catálogos → Materiales → Lista de materiales | Código MAIA, material y tipo de material (texto). El código conserva sus ceros iniciales.                                                                                 |
| Proveedores → Proveedores                    | Nombre completo, nombre resumido y NIT (texto); proveedor de maquila, proveedor de materiales y activo (enumeraciones Sí/No).                                             |
| Proveedores → Direcciones de proveedor       | Proveedor, nombre de bodega, ciudad, dirección y complemento (texto).                                                                                                     |
| Proveedores → Contactos de proveedor         | Proveedor, nombre, cargo o área, correo y celular (texto).                                                                                                                |
| Códigos de barras                            | Código y producto (texto), estado GS1/sistema (enumeración), creación (fecha). La explicación de los cinco estados se abre desde el botón **(?)** junto a la búsqueda.   |

La búsqueda y los filtros se pueden limpiar por separado. Al filtrar, se mantienen las cabeceras y controles para ajustar los criterios aunque la tabla no tenga coincidencias.

En **Abastecimiento → Vínculos entre órdenes**, la barra busca por número de OC de producto u OCM de material, con o sin prefijo y espacio, sin distinguir mayúsculas. El prefijo distingue los grupos. Las cinco cabeceras reúnen filtro y ordenamiento: órdenes numéricas, producto/maquilador y material/proveedor como texto, y estado enumerado. Búsqueda y filtros se combinan sobre cada vínculo y se conservan en la URL junto con el ordenamiento. **Limpiar búsqueda** conserva filtros y ordenamiento; **Limpiar filtros** conserva búsqueda y ordenamiento. La tabla mantiene la barra y las cabeceras sin coincidencias, con contador en el pie.

En **Facturas**, la barra busca por número de factura, proveedor y orden, lote o producto asociado, con la normalización de la factura. Se combina con los menús de columna y conserva la consulta en la URL. **Limpiar búsqueda** conserva filtros y ordenamiento; **Limpiar filtros** conserva búsqueda y ordenamiento. Ambos controles siguen disponibles en los estados sin coincidencias.

El listado incluye **Fecha de elaboración**. Cada columna de datos tiene un botón que abre un único menú para ordenar, seleccionar varios valores o aplicar condiciones de texto, números, importes o fechas. El filtro de estados se encuentra en la columna **Estado**; la búsqueda general conserva su funcionamiento. Los filtros se combinan y se conservan al recargar, junto con el ordenamiento. Las cabeceras siguen disponibles cuando no hay resultados.

A la derecha de la búsqueda, **Filtro personalizado** ofrece los [13 filtros](../filtros.md), con una sola selección activa y sus variantes con/sin y 7/15/30 días. Se combina con búsqueda, vista y columnas. **(?)** abre las descripciones y ejemplos; Escape cierra la ayuda y devuelve el foco al botón. Productos incluye los filtros de batch record, inspección, confirmación, cierre y OCM pendientes; Materiales y Otros conservan los comunes.

**Sin filtro personalizado** retira solo esa selección. **Limpiar filtros** retira personalizados y columnas, conservando búsqueda, vista y ordenamiento. Se muestran **50 órdenes por página**, con contador y Anterior/Siguiente. Cambiar la consulta vuelve a la primera página. Las opciones de columna incluyen todos los resultados correspondientes y los indicadores conservan sus totales generales. La URL guarda la selección en `filtro` y la página en `pagina`; volver del detalle o impresión recupera ambos y el desplazamiento. La búsqueda exacta avisa si una orden existe pero está excluida por los filtros.

Recepción física significa cantidad positiva o fecha real; una cantidad registrada incluye cero. Se excluyen renglones y lotes anulados de los pendientes y se evalúan las condiciones conjuntas sobre el mismo lote. Las fechas se comparan con el día de Bogotá, actualizado a medianoche y al recuperar foco o visibilidad. Los ejemplos y las reglas completas están en [filtros.md](../filtros.md).

La columna de acciones reúne, en una misma fila, **Imprimir orden**, **Ver o agregar orden firmada** y **Abrir el detalle**. Imprimir desde el listado o el detalle abre la vista de impresión en la misma pestaña del navegador.

**Volver a órdenes**, desde el detalle de una orden de cualquier tipo o desde la impresión de un listado, recupera el listado de origen con su pestaña, vista, búsqueda, filtros, ordenamiento y desplazamiento vertical y horizontal. **Volver a la orden**, desde impresión, recupera el detalle y su desplazamiento. La posición se toma al abrir el detalle o pulsar **Imprimir**. Si desde una orden se navega a otra pestaña o vista de la aplicación, se descarta el origen guardado: al regresar a Órdenes por la navegación se abre la vista por defecto, sin filtros y con el scroll desde el inicio.

El botón de orden firmada aparece **azul** cuando hay un adjunto y permite previsualizarlo. Si falta, el botón abre el mismo diálogo **Agregar placeholder** disponible en el detalle, con **Orden escaneada** precargada y el campo **Nombre del archivo**. Guardar asocia el documento a la orden de esa fila y habilita su consulta mediante el botón azul.

Los menús ocupan como máximo 400 px de altura y el 60 % de la ventana. El contenido adicional tiene desplazamiento interno, con el título y los botones de aplicar y cancelar siempre visibles. Escape cierra el menú y devuelve el foco al botón de la columna.

En la lista de valores, pulsar el texto o cualquier espacio dentro de su fila marca o desmarca la casilla sin cerrar el menú. También funciona en la fila **Seleccionar todos**; las selecciones se aplican únicamente al confirmar con **Aplicar**.

Todos los campos de fecha permiten digitar los números y agregan automáticamente los separadores de `dd/mm/aaaa`, o elegir desde el calendario. La fecha estimada de batch record se guarda y se muestra exclusivamente en cada lote de producto. Los renglones de material y otros conservan su propia entrega estimada, precargada desde la cabecera al crearlos y editable en su recepción.

Guardar un renglón de producto nuevo crea conjuntamente su **lote inicial**, con la fecha estimada de batch record tomada de la entrega solicitada de la cabecera y los estados por defecto. El número, la cantidad recibida, la factura, las fechas reales y la ubicación permanecen vacíos. El detalle muestra **Sin número de lote**. Después de autorizar, **Completar lote** modifica ese mismo registro y **Agregar lote** crea uno adicional; cada lote conserva su estimación independiente.

La cabecera de cada renglón usa fondo y ribete según su estado, conforme a [MASTER.md](design-system/MASTER.md): azul en seguimiento, gris verdoso al cerrar y gris rosado al anular. El código de barras y el código MAIA conservan monospace de 16 px. En una OC, el código comparte la cabecera con **Cantidad solicitada | Precio unitario | Recibido en lotes cerrados | Desviación / margen**, con valores de 14 px y peso 600. La franja secundaria muestra **Ref. corrugado | Cantidad de corrugado | Sticker o Cinta**, con valores de 13 px y peso 550; la referencia procede de la selección guardada en la orden.

Cada producto ofrece **Ocultar/Desplegar lotes** y cada material con lote asociado **Ocultar/Desplegar documentos**. Todos abren desplegados. Al ocultar, se conservan la cabecera, datos, resumen de lotes y **Agregar lote**, o el resumen de recepción y **Registrar / editar** en OCM. Los documentos y sus acciones se ocultan juntos. Sin lote de material asociado, el botón de documentos está deshabilitado. El estado es independiente por renglón; el contenido oculto queda fuera del teclado. La transición dura 180 ms y respeta movimiento reducido. [Rendimiento y compatibilidad](RENDIMIENTO.md#despliegue-de-lotes-y-documentos).

El lote muestra **Fecha de recepción**, batch record **Estimado** y **Recibido**, **Fecha de inspección** y **Confirmación** en `dd/mm/aaaa`, con el día de Bogotá y **Sin registrar** para fechas vacías. Usa tabla cuando su contenedor dispone de al menos 720 px y tarjetas por debajo, con 16 px de padding, 16 px entre secciones y tarjetas y 12 px entre columnas. La distribución responde también al ancho restante con navegación fijada. En las tarjetas móviles, las fechas **Estimado** y **Recibido** de batch record aparecen lado a lado; en un contenedor de hasta 260 px conservan la adaptación a una columna. En escritorio los botones de edición y eliminación comparten una columna ajustada a su ancho, con fechas compactas para reducir la altura de las filas.

Cada OC u OCM admite **una orden escaneada** y cada factura **un documento**. Una vez adjunto, **Reemplazar** actualiza el mismo registro, conservando identidad, propietario y clase; **Agregar** se ofrece para clases disponibles. Los certificados mantienen uno de cada clase por lote de material y la plantilla es única. El número de factura dentro del lote o recepción abre su documento asociado en otra pestaña cuando existe; sin documento aparece como texto.

Antes de autorizar se pueden agregar, sustituir o quitar productos. Quitar un renglón elimina su lote inicial y sus vínculos de abastecimiento; las órdenes y los renglones de materiales vinculados se conservan para revisarlos por separado. Cambiar la entrega solicitada de la orden no autorizada propaga la nueva fecha a sus lotes iniciales.

**Cambiar el proveedor de una OC de producto no autorizada** abre inmediatamente una advertencia: guardar reemplazará todos los datos anteriores de cabecera, productos, lotes, documentos propios y vínculos de abastecimiento. Las OCM anteriores se conservarán. Cancelar mantiene proveedor y borrador; aceptar prepara un borrador nuevo con elaboración del día, entrega vacía y obligatoria, productos activos del nuevo maquilador y sus recomendaciones. Cantidades, precios y empaque se inicializan con las reglas de creación. Volver al proveedor original recupera el borrador anterior al primer cambio.

La revisión muestra **Reemplazo pendiente** y **Guardar reemplazo**. Hasta guardarlo, la orden almacenada conserva íntegramente sus datos. El guardado mantiene identidad, número y tipo; reemplaza la cabecera editable, deja la orden no autorizada y crea renglones con identificadores nuevos y un lote inicial por producto. El servicio exige confirmación y vuelve a comprobar la autorización. Todo se guarda en una única transacción: cualquier fallo conserva los registros, el archivo y los consecutivos anteriores. Las OCM previas conservan sus cabeceras, renglones, recepciones, documentos y vínculos con otras OC.

Después de autorizar, **Editar orden** bloquea los selectores de producto y los botones para agregar o eliminar renglones. El servicio también rechaza esos cambios. Cantidades, precios y materiales de empaque siguen editables. Cambiar entonces la entrega solicitada conserva las estimaciones de los lotes existentes; estas se ajustan desde el seguimiento del lote. Las entregas estimadas de material y otros existentes se conservan al editar la cabecera.

La autorización es necesaria para modificar lotes o agregar otros. Se puede guardar únicamente una estimación o anular una entrega prevista sin número de lote. El número se vuelve obligatorio al asociar factura, registrar cantidad recibida —incluido cero—, fechas reales o ubicación, avanzar batch record o inspección, o cerrar el lote.

Con la orden autorizada, **Eliminar lote** permite borrar cualquier lote con confirmación, incluidos recibidos, facturados, cerrados, anulados y sin número. Las facturas y sus documentos se conservan. Si quedan otros lotes, el producto mantiene su estado; si es el último, el diálogo advierte que el producto quedará anulado. Las cantidades y desviaciones se recalculan desde los lotes restantes.

**Anular producto** pide confirmación y elimina todos sus lotes, conservando el renglón comercial y el abastecimiento. **Reabrir** un producto anulado crea un único lote inicial nuevo con la entrega actual y estados pendientes. Si conserva lotes de una versión anterior, pide confirmación antes de reemplazarlos. Repetir la reapertura no duplica lotes; reabrir un producto cerrado conserva sus lotes. Los productos anulados tienen **Agregar lote** bloqueado. El servicio también rechaza agregarlos hasta reabrir.

**Reabrir** también aparece en materiales y conceptos cerrados o anulados de OCM autorizadas. Reutiliza la operación de cambio de estado y devuelve el renglón a seguimiento, conservando cantidades, fechas, ubicación, factura, lote, documentos y vínculos.

La **entrega solicitada es obligatoria** en las órdenes de producto, material y otros. El formulario muestra el error junto al campo y detiene la revisión si está vacío; el servicio rechaza fechas vacías o inválidas, también al editar.

Los errores aparecen junto al campo y en un resumen con enlaces a los controles. Al corregir un valor, desaparece su error si ya es válido; el foco permanece en el campo y los errores pendientes siguen visibles. Un valor parcial, duplicado o incompatible no se considera corregido solo por haber cambiado.

Solo los **productos activos** aparecen como opciones para agregar a una orden. El servicio vuelve a comprobar su estado al guardar, incluso si se desactivaron durante la revisión. Los productos que ya pertenecen a una orden conservan su información histórica; si se desactivan, su opción actual se muestra bloqueada al editar.

Cada producto muestra su total según cantidad solicitada × precio unitario. En la revisión se muestran la cantidad solicitada, la capacidad del corrugado asignado y el cálculo recomendado. El adicional de sticker se ajusta individualmente por producto entre 1 % y 10 %, inicialmente 10 %; su cantidad final sigue siendo editable. El porcentaje se usa para calcular la sugerencia y no se persiste; se conserva la cantidad final en la extensión provisional del prototipo.

La cantidad de sticker y su porcentaje comparten fila, con el porcentaje más estrecho. Las fórmulas de corrugado, sticker y cinta se consultan en tooltips al pasar el cursor, enfocar o tocar su icono de ayuda. Escape cierra la ayuda y conserva el foco y el formulario.

## Entrega portable para Windows

El [ZIP portable](../GIMED-Prototipo-Windows-x64.zip) se reconstruyó y verificó el **19 de octubre de 2026** con el código actual del prototipo. Pasaron **21 comprobaciones** de arranque, navegador, instancia única, guardado, recuperación después de reiniciar y migración de proveedores favoritos con respaldo. Incluye Node.js v24.17.0 y 72 paquetes de ejecución. La [suma SHA-256](../GIMED-Prototipo-Windows-x64.sha256.txt) corresponde a esta entrega; el [reporte](tests/evidence/portable-report.json) registra los resultados obtenidos.

Desde `prototipo`, ejecuta `npm run package:portable`. Compila la interfaz y genera `GIMED-Prototipo-Windows-x64.zip` y su archivo SHA-256 en la raíz del proyecto. El paquete incluye el ejecutable de Node.js utilizado al prepararlo, verificado contra su distribución oficial, y las dependencias de ejecución con sus licencias. La primera preparación descarga la licencia y las sumas oficiales de Node; después utiliza la caché local.

La persona receptora extrae todo el ZIP a una carpeta con permiso de escritura y hace doble clic en **Iniciar.cmd**. El lanzador abre el navegador cuando el servicio está listo, elige un puerto local disponible y conserva una sola instancia por carpeta. **Enter** en la ventana del servicio lo detiene. El paquete funciona sin instalar Node ni npm y sin conexión a Internet en Windows 10/11 x64.

La entrega contiene la semilla ficticia. El primer arranque crea `data/database.json` dentro de la carpeta extraída; los siguientes arranques recuperan los cambios. Para respaldarlos o trasladarlos, detén el servicio y conserva la carpeta `data`.

`npm run test:portable` comprueba el ZIP extraído como una carpeta hermana del proyecto, con espacios y acentos en su ruta y un PATH sin Node ni npm. Incluye arranque mediante Iniciar.cmd, carga en navegador, instancia única, guardado, recuperación después de reiniciar y conservación del archivo de datos del proyecto. El reporte se guarda en `tests/evidence/portable-report.json`.

## Datos y modelos

El servicio crea `data/database.json` únicamente si no existe. La semilla incluye catálogos, códigos actuales y antiguos, órdenes con diferentes estados, lotes, facturas, certificados ficticios y configuración inicial. Los formularios conservan los cambios al detener y volver a iniciar la aplicación.

El modelo permite que `lote_producto.numero_lote` sea nulo mientras solo se planifica la entrega. La semilla incluye lotes iniciales para los productos sin recepción y ejemplos de varios lotes con estimaciones diferentes. La creación automática del lote inicial se guarda en la misma operación que su renglón.

La semilla actual representa los productos anulados sin lotes. Esta implementación conserva el archivo de datos existente: no aplica migraciones ni reinicios y solo elimina registros al ejecutar una operación confirmada. Los catálogos y los lotes compartidos de material conservan sus datos.

En una etapa anterior del **7 de octubre de 2026** se reinició el archivo de demostración `data/database.json` con el servicio detenido: 28 colecciones, siete renglones de producto y ocho lotes en esa versión de la semilla. Ese reinicio no forma parte de la implementación de reemplazo y borrado de lotes. El servicio conserva su comportamiento de crear datos solo cuando el archivo no existe. [Registro histórico del reinicio](tests/evidence/demo-reset-report.json).

- `shared/models.ts`: interfaces de las 28 tablas, atributos originales y claves compuestas.
- `shared/entities.json`: tipos, obligatoriedad, valores permitidos, referencias y unicidades extraídos del DBML.
- `shared/schema.ts`: validadores Zod compartidos y cálculos de negocio.
- `server/integrity.ts`: relaciones y restricciones R01–R13.
- `server/domain.ts`: operaciones de emisión, autorización, recepción, facturación y correo.
- `server/store.ts`: cola de operaciones y guardado mediante archivo temporal y reemplazo.
- `src/column-filter.tsx` y `src/order-table.ts`: menú y operaciones de filtro y ordenamiento compartidos por Órdenes, Facturas, Abastecimiento, Catálogos, Proveedores y Códigos de barras.
- `src/catalogs.tsx`: columnas filtrables de las listas de productos, materiales, proveedores, direcciones y contactos.
- `src/flows.tsx`: filtros de columnas y diálogo modal de ayuda de estados para la tabla de códigos de barras.
- `src/invoice-table.ts`: columnas de factura, proveedor, registro, cantidad de recepciones y presencia del documento propio.
- `src/supply-table.ts`: vínculos de abastecimiento y columnas de órdenes, producto/maquilador, material/proveedor y estado.

Los importes `decimal(14,2)` se guardan como cadenas con dos decimales y se calculan en centavos enteros. Las fechas se serializan en ISO UTC; los booleanos mantienen su tipo y los campos vacíos opcionales son `null`. El código de material conserva el tipo entero del DBML y se captura y muestra con tres dígitos, incluidos ceros iniciales. Solo el tipo **Corrugado** permite omitir el código MAIA al crear o editar: el campo es opcional y se guarda como `null`, sin convertirlo en cero. Los demás tipos requieren código; cualquier código informado mantiene las restricciones de formato, rango y unicidad.

`cantidad_sticker` y `cantidad_cinta` son extensiones **provisionales del prototipo** en `orden_producto`. Se conserva la exclusión entre ambos. Estas extensiones no se incorporan al DBML de referencia. `npm run models` regenera las interfaces y los metadatos desde ese archivo, incorporando estas dos extensiones.

## Recorridos principales

1. **Orden de producto:** crea una orden, edita cantidades y precio, revisa corrugado y sticker/cinta. Se guardan conjuntamente la orden, sus renglones y un lote inicial por producto. Antes de autorizar, editar la entrega actualiza las estimaciones iniciales y quitar un producto elimina su lote y vínculos, conservando las órdenes de materiales.
2. **Seguimiento:** consulta el lote inicial y confirma las firmas para autorizar la orden de compra. Solo después se pueden modificar o borrar lotes, agregar otros o registrar recepciones, cerrar o anular el seguimiento. El bloqueo se aplica en la interfaz y en el servicio a los tres tipos de orden; la creación automática inicial está permitida antes de autorizar. Borrar el último lote o anular el producto lo deja sin lotes; reabrirlo crea uno inicial nuevo. Registra batch record, inspección, ubicación y factura. Recibir toda la cantidad conserva el producto abierto; el cierre es manual y solicita confirmación si excede la tolerancia vigente.
3. **Materiales y otros:** registra una recepción por material o concepto de la orden de compra. Los materiales pueden compartir una identidad de lote y sus certificados; los otros conceptos se escriben sin crear un catálogo adicional.
4. **Facturas y documentos:** busca por factura, proveedor y datos de sus asociaciones; filtra y ordena desde las cabeceras de número de factura y proveedor (texto), Registro (fecha) y Recepciones (enteros; cero consulta las facturas sin recepciones). Documentos solo ofrece **Con documento** y **Sin documento**. Los menús comparten la selección de valores y el desplazamiento interno de Órdenes; búsqueda y filtros se combinan y la URL conserva la consulta y el ordenamiento. Los formularios permiten buscar y asignar recepciones del mismo proveedor. Los placeholders permiten previsualizar, descargar, imprimir y reemplazar el archivo vigente.
5. **Correos:** prepara el mensaje desde la orden o lote, revisa sugerencias y documentos faltantes y confirma la simulación. El historial guarda mensaje y destinatarios, sin cuerpo ni versiones de adjuntos.

Al abrir la asignación de una factura existente, sus lotes y recepciones asociados aparecen marcados. Buscar conserva esa selección; abrir y cerrar sin modificarla no activa el aviso de cambios pendientes. Guardar asocia los marcados y retira la factura de los desmarcados, incluso cuando la búsqueda los oculte; conserva la factura, sus documentos y los demás datos de las recepciones.

**Adjuntar documento**, al crear una factura, abre el mismo formulario de placeholder con clase Factura física y nombre de archivo. El adjunto queda preparado en el borrador y permite reemplazarlo o quitarlo. Se guarda junto con la factura y sus asociaciones; cerrar sin guardar descarta el borrador.

La [correspondencia de requisitos y pantallas](COBERTURA.md) permite revisar el alcance completo.

## Comprobaciones

```powershell
npm test
npm run test:browser
npm run test:filters
npm run benchmark:filters
```

El segundo comando necesita Google Chrome instalado. Usa **Playwright CLI**, compila la aplicación y abre un servicio de prueba en el puerto 3002 con un archivo nuevo dentro de `tests/.tmp`. Después inicia otro servicio en el puerto 3003 para comprobar la recuperación del archivo guardado. Cierra únicamente la sesión de navegador creada para la prueba; no modifica `data/database.json`.

Los resultados quedan en `tests/evidence/browser-report.json` y `tests/evidence/restart-report.json`, junto con las capturas y el PDF de impresión. El [registro de verificación](VERIFICACION.md) describe las comprobaciones realizadas. `npm run qa` abre una sesión interactiva separada; pulsa Enter en su terminal para cerrarla.

La verificación del **13 de octubre** pasó **126 pruebas automatizadas**, **598 comprobaciones del recorrido general** y la recuperación completa de las **28 colecciones**. Las revisiones anteriores conservan sus **52 comprobaciones de filtros personalizados** y **43 comprobaciones de formularios aislados**. El recorrido incluye reemplazo por proveedor, borrado, anulación, reapertura, búsquedas combinadas con filtros de Facturas y Abastecimiento, selección precargada y desasignación de lotes, adjunto preparado al crear la factura y adaptación del drawer al límite de 1024 px.

`test:filters` compila la interfaz y usa Chrome con un servicio de datos sintéticos en memoria para comprobar las 17 variantes, paginación, navegación, ayuda, cambio de día y actualización visual. No abre el almacén del usuario. Su reporte queda en [order-filters-browser-report.json](tests/evidence/order-filters-browser-report.json). `benchmark:filters` mide el modelo real y compara resultados contra una referencia independiente, sin navegador ni archivos de datos del usuario.

El [informe de rendimiento](RENDIMIENTO.md) registra costos, metodología y límites para 6.000 y 60.000 lotes, además de las recomendaciones para una aplicación multiusuario. La lectura indexada se prepara una vez por actualización del snapshot; cambiar filtros reutiliza sus indicadores y evita otra descarga. Las opciones de columna se calculan al abrir su menú.

## Alcance técnico de esta entrega

React, TypeScript, Vite, Express, Zod y JSON corresponden a este prototipo. El archivo JSON admite un único proceso de servicio como escritor; la cola serializa las solicitudes de ese proceso. No se sustituye todo el estado desde la interfaz: cada modificación pasa por una operación de negocio validada en el servicio.

Los documentos se generan como contenido HTML ficticio a partir de metadatos válidos. No se cargan documentos reales ni se generan certificados de negocio. La cuenta remitente y la confirmación de transporte son de demostración; no hay conexión con Gmail, MAIA ni GS1. El avance de códigos se confirma manualmente.

La arquitectura y el stack de producción continúan pendientes. También permanece pendiente la integración futura del certificado de análisis para Colompack, señalada en Configuración.

## Documentación relacionada

| Documento                                                  | Contenido                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| [Requisitos](../Planeacion/requisitos.md)                  | Funciones, reglas y alcance acordados.                      |
| [Restricciones](../Planeacion/restricciones-fuera-dbml.md) | R01–R13 y reglas de servicio.                               |
| [Vocabulario](../CONTEXT.md)                               | Órdenes, OC/OCM, renglones y recepciones.                   |
| [Filtros](../filtros.md)                                   | Definiciones y ejemplos de los 13 filtros personalizados.   |
| [Rendimiento](RENDIMIENTO.md)                              | Mediciones, costos de consulta y evolución de arquitectura. |
| [Cobertura](COBERTURA.md)                                  | Correspondencia entre requisitos y pantallas.               |
| [Verificación](VERIFICACION.md)                            | Resultados, fechas, reportes y capturas.                    |
| [Interfaz](design-system/MASTER.md)                        | Navegación, formularios, filtros y accesibilidad.           |

## Migración a React Aria

La directriz obligatoria de componentes está en [MASTER.md](design-system/MASTER.md). El inventario, el commit de recuperación y el estado de las pruebas se mantienen en [MIGRACION-ARIA.md](MIGRACION-ARIA.md). Las cifras de las verificaciones anteriores son referencias históricas, no el resultado de la migración.


Los códigos de barras distinguen Activo (alternativa vigente) y Asignado (único código usado al emitir). Asociar uno nuevo asigna y deja el anterior activo; los cambios no alteran las órdenes históricas. La tabla muestra una fila por código, con filtros y acciones. Se reutilizan cinco badges de colores distintos. Flujo, recuperación y pruebas: [CODIGOS-BARRAS.md](CODIGOS-BARRAS.md).

Los **costos de maquila** se consultan agrupados por producto, con filtro Con costos/Todos los productos, alta contextual y acciones de edición/eliminación al hacer hover o enfocar la fila. Importe positivo e inicio son obligatorios; los periodos no se solapan y solo se permite uno abierto por producto. Se valida también en el servicio y no se recalculan precios históricos. [Reglas, recuperación y verificación](COSTOS-MAQUILA.md).

**Productos & materiales** utiliza una única lista agrupada y un editor conjunto con corrugado, capacidad, casillas Cinta/Sticker y selección múltiple de materiales. Se guardan todas sus relaciones en una transacción, con control de conflictos; Cinta y Sticker son materiales únicos en el catálogo. [Funcionamiento y verificación](PRODUCTOS-MATERIALES.md).
