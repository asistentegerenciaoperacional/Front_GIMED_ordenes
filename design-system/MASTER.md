# Interfaz del prototipo GIMED

Registro de las decisiones visuales implementadas y verificadas. Se aplica a una herramienta de operación con tablas, formularios y seguimiento.

Actualizado el 27 de octubre de 2026. Complementa la [cobertura](../COBERTURA.md) y las [evidencias de verificación](../VERIFICACION.md).

## Bases

### Componentes obligatorios

Toda interfaz interactiva debe usar la capa compartida basada en **React Aria Components 1.22.1**. `src/ui.tsx` conserva la fachada pública; `src/components` contiene controles, tablas, fechas y superposiciones. No se deben introducir controles HTML interactivos ni bibliotecas alternativas directamente en las pantallas. La prueba `tests/aria-boundary.test.ts` aplica esta regla. El HTML estructural, los documentos placeholder generados y los diálogos de impresión y salida del navegador son excepciones.

- Acciones: `Button`/`CancelButton` y enlaces React Aria. Conservar navegación interna, enlaces modificados con Ctrl/clic, bloqueo y nombres accesibles de iconos.
- Captura: `Form`, `TextField`, `SearchField`, `Label`, `Input`, `TextArea` y `FieldError`. Mantener Zod, resumen de errores, mensajes del servicio y validación en vivo. Los importes conservan cadenas decimales exactas; las cantidades y porcentajes usan `NumberField` con `commitBehavior="validate"`, sin corregir silenciosamente valores inválidos.
- Selección: `Select` para opciones cerradas y `ComboBox` para buscar relaciones existentes. La selección persiste el identificador estable, nunca el texto buscado. Los nombres repetidos muestran contexto para distinguir los registros; una búsqueda sin coincidencias indica «Sin coincidencias». El texto libre solo se admite donde el proceso ya lo permitía.
- Fechas: campo continuo `dd/mm/aaaa` con separadores automáticos, edición y pegado, más `Popover` y `Calendar`. Conservar fechas parciales hasta que puedan validarse y señalar las inexistentes.
- Diálogos y navegación flotante: `ModalOverlay`, `Modal` y `Dialog`. React Aria controla foco, cierre, apilamiento y bloqueo del fondo. Las confirmaciones de eliminación, navegación y descarte usan el diálogo compartido. Un diálogo anidado no debe enviar el formulario exterior.
- Casillas, filtros, ayudas, pestañas y desplegados: `CheckboxGroup`, `Checkbox`, `Popover`, `Tooltip`, `Tabs` y `Disclosure`. Los filtros de columna son no modales y cierran al salir con Tab; los menús de filtros personalizados usan `MenuTrigger`, `Menu`, `MenuSection` y `MenuItem` con selección exclusiva. Los formularios modales retienen el foco. La selección de recepciones debe mantener el desplazamiento.
- Tablas: todas las tablas operativas, históricas, de lotes e impresión se componen con `Table`, `TableHeader`, `Column`, `TableBody`, `Row` y `Cell`, mediante `DataTable`. Mantener columnas, ordenamiento, filtros, paginación, acciones agrupadas y formato de impresión. Las flechas recorren filas y celdas según React Aria; Tab permite entrar y salir de la tabla.

Los menús de opciones de formularios y autocompletados son compactos: superficie blanca, borde sencillo, separación reducida, selección azul y texto blanco. Los filtros personalizados siguen el estándar específico siguiente. Comparten tipografía, tamaños y tokens existentes, sin un tema visual distinto por pantalla. Deben mostrarse foco visible, selección, errores, bloqueo y carga. Teclado, cierre y posicionamiento pertenecen a React Aria; no duplicar esos mecanismos con listeners o mediciones propios.

### Menús de filtros personalizados

Todos los filtros predefinidos de consulta reutilizan `CustomFilterSelect` en la capa compartida. Se aplica al filtro personalizado de OC y OCM, tipo de orden, costos de maquila, materiales por producto y clase de documento. No duplicar el menú ni sus estilos en cada pantalla; conservar valores, reglas de filtrado, búsqueda, URL y ayuda existentes. Los formularios y los menús de condiciones de columna conservan sus componentes actuales.

- Superficie blanca, borde de 1 px `#E2E8F0`, radio de 12 px y sombra `0 8px 24px #18253B1F`; padding exterior de 6 px y separación de 6 px respecto al disparador. Sin iconos decorativos ni flechas en las categorías.
- Tipografía Segoe UI de 12 px y altura de línea 1,5. Opciones con padding de 8 × 10 px, separación vertical de 2 px, radio de 7 px y altura mínima de 34 px; en móvil o puntero táctil, mínimo 40 px.
- Selección única indicada por un círculo de 14 px, texto `#1D4ED8` de peso 600 y fondo `#EFF5FF`. La opción neutra se selecciona igual que las demás; no borrar silenciosamente la selección activa. Hover gris `#F8FAFC`; foco de teclado mediante contorno azul de 2 px. Estados deshabilitados no son seleccionables.
- Con subcategorías: títulos blancos sin banner, peso 650 y color principal; divisores de 1 px y separación de 8 px entre grupos, con opciones sangradas 12 px. Los grupos permanecen visibles, sin controles de expansión anidados dentro del menú. Sin subcategorías: la misma lista y estados, sin divisores ni títulos vacíos.
- Ancho mínimo visual de 240 px para listas simples y 360 px para agrupadas, nunca menor que el disparador ni mayor que el espacio de la ventana (margen total de 40 px). Texto largo ajustable y scroll interno con alto máximo de 420 px o 60 % de la ventana; React Aria puede reducirlo según el espacio disponible.
- React Aria administra apertura, flechas, Inicio/Fin, búsqueda por texto, Enter, Escape, clic fuera y retorno del foco. Elegir una opción cierra el menú y aplica el filtro; Escape permite abandonarlo sin cambiarlo. No introducir animaciones de color ni gestión manual de foco o scroll.

Los botones, enlaces de navegación y tarjetas cambian sus estados de hover sin transiciones de color o sombra: evita retener nodos desmontados en el seguimiento de transiciones de React Aria 3.53.1. Mantener las animaciones de desplegado y del drawer, respetando movimiento reducido.

Las ayudas de cálculo aparecen al pasar o enfocar el icono (?) y desaparecen al alejar el puntero del tooltip y su margen de 8 px. Conservar los textos: «Cantidad solicitada ÷ capacidad + 5 adicionales», «Cantidad solicitada x 2 + % adicional» y «Cantidad solicitada ÷ 4000». Los campos con y sin ayuda deben permanecer alineados.

La migración, su punto de recuperación y su verificación se registran en [MIGRACION-ARIA.md](../MIGRACION-ARIA.md). Cada cambio de componentes debe superar las pruebas funcionales y comparar rendimiento en producción con los límites allí definidos.

- Fondo: `#F6F8FC`; superficies: blanco; bordes: `#E2E8F0`.
- Acción principal: `#2563EB`; interacción: `#1D4ED8`.
- Texto principal: `#18253B`; texto secundario: `#526179`.
- Tipografía del sistema: Segoe UI, system-ui, sans-serif. Identificadores técnicos usan monospace; cantidades usan cifras tabulares.
- Separación habitual: 8, 12, 16, 20 y 24 px. Paneles con radio de 12 px.
- Iconos Lucide en SVG, decorativos con `aria-hidden`; controles de solo icono tienen nombre accesible. Todas las acciones de tabla usan `table-action` en `Button` o `LinkButton` para obtener el tooltip compartido `ActionTooltip`, al pasar el cursor o enfocar. El texto procede de `title`, `aria-label` o el texto del botón, en ese orden; se evita el tooltip nativo duplicado y la implementación por pantalla.

Todas las pestañas de nivel 1 y 2 (`[role="tab"]`) y los encabezados de columna (`.data-table th`) muestran `cursor: pointer` al hacer hover.

### Hoja alternativa de creación de órdenes

Configuración → Apariencia permite activar **Vista alternativa de creación de órdenes**, desactivada por defecto. La elección se guarda en este navegador con la clave `gimed:ui:alternative-order-entry`; no pertenece a la base de compras ni al parámetro de listado `vista`. Cada formulario toma la preferencia al abrirse y mantiene su presentación durante todo el borrador. Si falla el almacenamiento, la elección funciona durante la sesión y Configuración informa que no persistirá.

`OrderEntrySheet` es una presentación del paso 1 del `OrderForm` existente para productos, materiales y otros, incluida la creación desde Abastecimiento. Reutiliza los campos, autocompletados, calendario, reglas, cálculos y comandos actuales. El listado, la edición de órdenes existentes, el paso 2, el detalle y la impresión conservan sus componentes y estilos.

La hoja constituye una excepción visual acotada a `.order-entry-sheet`: fondo blanco, texto negro, bordes negros de 1 px, Calibri/Arial de 15 px y etiquetas azules `#004890`. El título usa 24 px y peso 700 en `#003366`: **ORDEN DE PRODUCCIÓN No.** para productos y **ORDEN DE COMPRA No.** para materiales/otros. La cabecera reserva vacío el espacio del logo y mide al menos 96 px; las filas de fecha/entrega, proveedor y NIT miden 42 px. Fecha de elaboración y consecutivo son automáticos; NIT y códigos son de solo lectura.

La cuadrícula muestra exactamente siete posiciones y cinco columnas: CÓDIGO, PRODUCTO, CANTIDAD, PRECIO UNIDAD y TOTAL, con proporciones 15/37/14/16/18 %. No incluye factura ni revisó. Encabezados y renglones tienen 44 px de altura; GRAN TOTAL tiene 38 px. Las cifras usan alineación derecha y dígitos tabulares. Los campos conservan nombres accesibles aunque sus etiquetas individuales se oculten visualmente dentro de la cuadrícula. El foco usa contorno azul interior; los errores conservan el resumen del diálogo y borde rojo interior en el campo/celda, sin mensajes inferiores duplicados.

El selector de tipo, **Vaciar fila**, el indicador de fila activa y los avisos se sitúan fuera del documento. Desde Abastecimiento, los materiales y las posiciones adicionales permanecen bloqueados; bases, OC de origen y porcentajes adicionales se muestran en un panel auxiliar. En móvil la hoja conserva un ancho mínimo de 880 px con desplazamiento horizontal interno. El diálogo conserva su scroll vertical y sus acciones de revisión/cancelación.

Se puede empezar a escribir en cualquiera de las siete filas. Vaciar fila limpia únicamente la posición activa, sin mover las demás. Revisar orden elimina exclusivamente las filas completamente vacías y compacta las restantes en su orden original antes de validarlas; los errores corresponden a esas nuevas posiciones. Cero explícito, número inválido, texto de búsqueda pendiente o cualquier fila parcial se conservan. Volver desde revisión restaura las siete posiciones y los ajustes de empaque.

Dentro de la cuadrícula, las flechas recorren las celdas y Enter confirma la edición y baja una fila, sin enviar el formulario. En los límites no se avanza fuera de la hoja. Los menús de autocompletado abiertos conservan prioridad para seleccionar con flechas/Enter; una selección no produce además un salto de fila. Calendarios, Tab y Escape mantienen su comportamiento compartido. La navegación específica de la hoja se acota a esta tabla y no altera las otras tablas de React Aria.

### Historial de producto

El historial de Catálogos → Productos reutiliza el diálogo React Aria con la clase `product-history-dialog` y el componente `ProductHistory`. La cabecera conserva el nombre del producto, el subtítulo y el cierre. El cuerpo agrupa primero seis datos en una única superficie suave con borde: tipo de maquila, costo vigente, unidades por lote, categoría, maquila/IVA y código asignado. El código procede de `assignedBarcode` y el costo de `currentCost`.

El resumen usa seis columnas en escritorio, tres hasta 850 px y dos hasta 560 px. Sus etiquetas usan 12 px, los valores 13 px y peso 550, y la nota de IVA 11 px; el padding vertical del resumen y el horizontal de sus celdas es de 13 px. Se mantiene la fuente Segoe UI/system-ui en todo el diálogo, también en los códigos, con cifras tabulares para cantidades e identificadores. Los títulos de sección usan 14 px; el título del diálogo, 18 px. Los separadores de 1 px en `--border` se colocan únicamente entre secciones consecutivas, después del contenido anterior y antes del siguiente título, con 16 px de padding superior en la sección siguiente. Cada título permanece unido a su contenido y las tablas omiten el borde de la última fila para evitar separadores duplicados. El color secundario procede de `--muted` y la superficie del resumen de `--soft`.

Materiales asociados, historial de códigos e historial de costos son secciones con 16 px de separación exterior y 8 px entre título y contenido. Los materiales se distribuyen en etiquetas ajustables de 12 px, con 6 px entre ellas. Las tablas compartidas `DataTable` usan encabezados de 12 px con padding de 7 × 12 px y celdas y enlaces de 13 px con padding de celda de 4 × 12 px. Los enlaces de consulta conservan al menos 24 px de altura; los badges de estado usan 11 px, los colores existentes y padding de 3 × 7 px. En pantallas estrechas, las tablas tienen desplazamiento horizontal interno y el resumen se apila sin desbordar el diálogo.

Los estados sin materiales, códigos o costos se indican explícitamente. Si el contenido supera el alto disponible, el diálogo compartido admite scroll vertical y mantiene visible su cabecera; las secciones conservan sus tamaños y separación. Cerrar, Escape, foco y navegación a las órdenes siguen a cargo de los componentes compartidos. Las reglas visuales de esta vista quedan acotadas a `product-history` y `product-history-dialog`.

## Organización

Órdenes es la pantalla inicial. La navegación lateral agrupa los procesos y reserva Configuración al final. Se presenta como un drawer cerrado inicialmente en todos los tamaños de pantalla; el botón de menú lo abre sobre el contenido, con un fondo atenuado. Su icono de fijación cambia entre panel flotante y navegación permanente. El contenido usa título, acción principal, filtros y tabla. El detalle mantiene la información de la orden de compra, sus productos, materiales o conceptos y los documentos vinculados. Los diálogos separan captura y revisión antes del guardado.

Catálogos separa la navegación con pestañas principales **Productos**, **Materiales** y **Productos & materiales**, siguiendo el estilo de grupos de Órdenes. Debajo, los botones secundarios conservan el diseño actual: Productos contiene Lista de productos, Categorías y Costos de maquila; Materiales, Lista de materiales, Tipos de material y Proveedores favoritos por tipo. Productos & materiales muestra directamente la lista agrupada por producto, sin pestañas secundarias ni Agregar global.

### Relaciones agrupadas y selección múltiple

Usar `GroupedRelationsTable` cuando varias relaciones compartan una entidad principal: una fila por entidad, conteo, expansión accesible (`aria-expanded`/`aria-controls`) y detalle a todo el ancho. Incluir entidades sin relaciones; bloquear solo su despliegue y mantener el lápiz de edición habilitado. Buscar por principal o relacionados; abrir los grupos coincidentes y permitir cerrarlos. Si todas las entidades ya están representadas, no añadir Agregar global.

Las tablas internas de los grupos usan `table-layout: fixed`: encabezados y celdas conservan las mismas posiciones entre grupos, independientemente de sus textos, fechas vacías o número de filas. Sus encabezados son transparentes sobre blanco, sin borde superior ni banner gris; solo la cabecera de la tabla principal conserva su fondo. Costos y proveedores favoritos comparten tipografía, padding de 8 × 10 px y altura mínima de fila de 51 px, que pasa a 57 px hasta 600 px de ancho. En costos, reservar desde el encabezado 96 px para acciones, o 108 px en móvil para evitar que sus botones se apilen. Mantener el mínimo interno de 520 px en costos y 360 px en favoritos, más la sangría y los márgenes en la tabla agrupada exterior: en móvil hay un único scroll horizontal compartido, sin desplazar un panel por separado al enfocar sus botones.

En favoritos, las filas de tipos de material conservan las medidas comunes de las tablas con **2 px adicionales de altura total**, repartidos en 1 px arriba y 1 px abajo. El padding superior e inferior es de 18 px; desde 1600 px de ancho de ventana, de 21 px. El padding horizontal es de 18 px y pasa a 14 px hasta 1190 px de ancho. La altura sigue adaptándose al contenido y a los controles; la compactación del detalle de proveedores se aplica por separado.

El tipo conserva el énfasis y sus proveedores se presentan en una subtabla con columnas Proveedor y NIT. Los encabezados usan 11 px y los datos 12 px, ambos con peso 400. El texto queda a 34 px del nombre del tipo: 24 px de sangría del detalle y 10 px de padding de celda. El NIT incluye el DV separado por guión cuando está registrado. Las filas de proveedor no tienen acciones de editar o eliminar, tampoco al hacer hover; se conserva el lápiz del grupo. El detalle no añade padding a la celda ni arriba de la tabla y deja 4 px abajo, sin tarjeta de fondo. El botón de desplegar/ocultar conserva la variante ghost y presenta un borde gris de 1 px `#CBD5E1`, visible también sin hover, con radio de 7 px. Mide 34 × 34 px y pasa a 40 × 40 px hasta 600 px de ancho de ventana; mantiene foco visible y nombre accesible.

Desplegar/ocultar anima altura mediante CSS Grid en 180 ms y opacidad en 140 ms, con giro de chevrón en 180 ms. Se retira el detalle después del cierre; durante él queda `inert` y `aria-hidden`. Movimiento reducido elimina la transición. Los temporizadores se cancelan ante cambios rápidos o desmontaje, y el foco permanece en el botón.

Mantener memorizados los grupos, callbacks y contenido vacío: abrir o cerrar el editor no debe reconstruir la colección de la tabla. Regenerarla cuando cambien los datos, la búsqueda o los grupos desplegados.

Usar `MultiRelationPicker` dentro del diálogo compartido para modificar un conjunto: búsqueda con casillas React Aria y una selección final visible independiente del filtro, con acciones para quitar, conteo y altas/bajas antes de guardar. Mantener IDs estables, distinguir homónimos con contexto y no guardar al marcar cada casilla. Cancelar/Escape descarta con confirmación; errores conservan el borrador; un conflicto exige revisar la selección actual. Bloquear envíos duplicados, conservar scroll y devolver foco al disparador mediante React Aria. En móvil apilar listas; conservar los tokens y el lápiz cuadrado secundario existentes.

Los títulos de proveedores disponibles y seleccionados comparten una fila, fuera del panel gris. Este panel se alinea arriba y abajo con el conjunto de búsqueda y lista disponible. Ambas listas usan la misma tipografía de 12 px y altura de línea 1,6; en móvil cada título precede a su panel apilado.

Favoritos aplica estos patrones a tipos de material y proveedores. Los materiales heredan los favoritos del tipo. Los selectores de órdenes presentan secciones compactas Favoritos/Otros proveedores sin restringir opciones elegibles ni modificar una selección existente. Especificación, recuperación y pruebas en [PROVEEDORES-FAVORITOS.md](../PROVEEDORES-FAVORITOS.md).

La elegibilidad de favoritos exige `Es_materiales === true`. Tabla, conteos,
búsquedas, opciones, selección final e historial de materiales excluyen
proveedores con la bandera en falso o sin informar. Se admiten proveedores
mixtos y no se añade un requisito sobre Activo. El servicio valida también
las solicitudes directas y los reintentos; el error se asocia a la selección
de proveedores. Si el rol cambia, sus relaciones dejan de mostrarse y guardar
el tipo retira las que ya no son elegibles, conservando los demás tipos.

Los campos para elegir un producto existente usan el `ComboBox` compartido de React Aria: al escribir aparecen coincidencias y la elección guarda el identificador del producto. En órdenes, las sugerencias se limitan a productos activos del proveedor seleccionado y al producto histórico del renglón cuando aplica. En formularios de catálogo y asignación GS1 se muestran las opciones disponibles. Al asignar un código GS1, el proveedor del producto aparece debajo como campo de solo lectura.

Proveedores y materiales de los diálogos reutilizan el mismo autocompletado y estado de selección de productos mediante `ReferencePicker`, `ProviderPicker` y `MaterialPicker`. Se aplica en las referencias del catálogo, el proveedor de factura, el proveedor de orden, los materiales de OCM y la referencia de corrugado de OC. Materiales admite búsqueda por código MAIA y nombre; corrugados sin código siguen disponibles. El proveedor de orden conserva los grupos Favoritos/Otros proveedores y la distinción de homónimos por NIT. Buscar un proveedor no modifica sus renglones: si se abandona sin elegir, se restaura la etiqueta seleccionada; elegir otro proveedor mantiene la confirmación de reemplazo, y cancelarla conserva etiqueta y borrador. Los campos bloqueados siguen deshabilitados. Los selectores múltiples de relaciones conservan su editor específico con búsqueda.

El drawer fijado ocupa una columna propia y permanece visible al navegar y desplazar la página. Al desfijarlo, la columna se libera y el panel permanece abierto de forma flotante, con todo el ancho disponible para el contenido. Al cambiar entre fijado y flotante se cancelan las animaciones del panel para evitar repetir su entrada; la apertura habitual conserva su animación. El cambio de ancho utiliza una transición de 180 ms, desactivada con movimiento reducido. La fijación está disponible desde 1024 px de ancho de ventana. Por debajo, el botón desaparece y el panel fijado pasa automáticamente a flotante, liberando su columna y enfocando el cierre. Ampliar la ventana conserva el modo flotante hasta una nueva fijación.

La cabecera conserva el botón de fijar/desfijar en los anchos permitidos; el cierre aparece en el modo flotante. Los destinos tienen desplazamiento interno y las tablas tienen desplazamiento horizontal propio cuando no caben. Las columnas de formularios se reducen a una por debajo de 600 px.

## Materiales agrupados por producto

Reutilizar `GroupedRelationsTable` y el lápiz del grupo para configurar todos los productos, incluidos los vacíos. Conservar sangría, medidas, animación, encabezados transparentes y columnas internas alineadas de favoritos. El detalle tiene Tipo de material, Material y Código MAIA; Corrugado aparece primero con su capacidad en una segunda línea del material. No agregar una columna de capacidad ni acciones por fila. Un corrugado ausente se muestra como Sin asignar cuando hay otros materiales; no cuenta como relación.

El filtro personalizado usa el Select compartido con Todos los productos, Con materiales, Sin materiales, Maquila full, Maquila parcial, Con cinta, Con sticker y Sin corrugado asignado; una condición por vez combinada con la búsqueda. Con materiales muestra grupos con conteo mayor que cero, incluido el corrugado; Sin materiales muestra grupos con conteo cero. La búsqueda abre grupos coincidentes completos. Mantener el lápiz habilitado en los grupos vacíos y distinguir productos homónimos mediante maquilador e ID.

El diálogo empieza con Producto bloqueado, referencia/capacidad de corrugado y casillas excluyentes Sticker/Cinta. Ambas vacías significa ninguno; cada casilla resuelve el material único de su rol. La capacidad exige un entero positivo seguro cuando hay referencia. Debajo usar `MultiRelationPicker`: materiales generales disponibles y selección final persistente, con búsqueda por nombre/tipo/MAIA y altas/bajas antes de guardar. Excluir de esas listas los tres roles especiales. Conservar errores y borrador, confirmación de descarte, bloqueo durante envío, retorno de foco y scroll. Apilar campos/listas en móvil y mantener un único scroll horizontal de la tabla. Ver [PRODUCTOS-MATERIALES.md](../PRODUCTOS-MATERIALES.md).

En este editor, separar bloques por 16 px y títulos de empaque de sus campos por 8 px. Mantener títulos de sección de 15 px, casillas de 12 px y descripciones de 11 px. La papelera Quitar corrugado usa el botón secundario de solo icono con tooltip y hover destructivo, alineado abajo con los campos, en una columna siempre reservada de 38 px. Sin referencia permanece deshabilitada; seleccionarla o quitarla no altera la grilla. Hasta 600 px, colocar referencia arriba y capacidad con papelera de 40 px debajo. No sumar el margen superior propio del selector múltiple al espaciado entre bloques. La búsqueda de corrugado confirma solo al seleccionar y restaura la referencia anterior al salir sin elegir.

## Costos de maquila agrupados por producto

Usar exclusivamente los componentes compartidos React Aria y `GroupedRelationsTable`, con una acción de grupo configurable: + en costos y lápiz en favoritos. No duplicar la implementación del despliegue ni modificar el comportamiento de favoritos. Los productos muestran nombre y conteo; el historial conserva peso normal, sangría, densidad, animación y movimiento reducido existentes. Distinguir homónimos por maquilador e ID.

El selector **Filtro personalizado de costos** se coloca inmediatamente antes de **Agregar**, con **Con costos** por defecto y **Todos los productos** como alternativa. Mantenerlos en la misma fila y adaptar el conjunto a móvil. Los productos sin costos mantienen el + y deshabilitan el despliegue. Buscar por producto, importe o fecha abre el grupo con su historial completo.

El lápiz y la papelera de cada costo aparecen solo con hover de fila o `focus-within`; reservar su ancho para no mover columnas. En `hover: none` o `pointer: coarse` permanecen visibles. Conservar nombres accesibles, foco visible, tooltip compartido y hover destructivo existente. El + del producto permanece visible.

El alta desde + bloquea el producto; el alta general permite seleccionarlo. Importe e inicio son obligatorios y el costo es entero positivo. Mostrar errores de periodo junto a las fechas, identificando el costo incompatible; conservar el borrador y no cerrar fechas automáticamente. Guardar mantiene abierto el producto y cerrar recupera foco/scroll; si desaparece el grupo, enfocar Agregar. Usar la confirmación compartida para descarte y eliminación, y bloquear cierre/envíos durante el guardado. Reglas, recuperación y pruebas: [COSTOS-MAQUILA.md](../COSTOS-MAQUILA.md).

## Materiales pendientes y OCM consolidadas

Abastecimiento muestra las pestañas Vínculos entre órdenes, Materiales pendientes
y Lotes y certificados, con los controles compartidos existentes. La nueva vista
es una tabla plana de parejas producto solicitado–material, con selección,
material/MAIA, OC, producto/maquilador, cantidad y entrega solicitada. Reutiliza
`DataTable`, filtros de columna, búsqueda y páginas de 50 filas; los parámetros
propios usan el prefijo `pendientes_`.

Desde y Hasta son campos de fecha compartidos, inicialmente vacíos, con botón
Consultar. Sin un rango aplicado, la tabla muestra todos los vínculos pendientes;
ambos campos vacíos conservan ese resultado y un rango válido lo limita. La fecha
de cada fila se muestra como día de Bogotá en `dd/mm/aaaa`.
La tabla mantiene un mínimo interno de 1010 px y desplaza horizontalmente dentro
de su contenedor, sin ensanchar la página. El panel permite que el resumen inferior
permanezca adherido al viewport; solo el contenedor de la tabla recorta su scroll.

El resumen conserva materiales seleccionados aunque la búsqueda, filtros o página
los oculten. Muestra materiales distintos, cantidad de vínculos y OC;
cada material tiene una acción para quitar sus orígenes. Se pueden seleccionar
más de siete materiales para Cotizar materiales; sobre siete se deshabilita solo
Elaborar OCM y se explica cómo reducir la selección. En
móvil los elementos del resumen se ajustan en varias filas y su lista tiene altura
limitada; Elaborar OCM sigue visible y el foco conserva margen para no quedar tapado.

Elaborar OCM abre el diálogo compartido con tipo Material y materiales bloqueados.
La base y el conteo de orígenes preceden a los campos. Cantidad y adicional de 5–10 %,
inicialmente 10 %, comparten una fila; porcentaje ocupa 104 px. Cambiar proveedor
conserva los datos. La revisión presenta cantidad final, precio, subtotal y OC de
origen. Conflictos usan `ErrorNotice`, bloqueo del envío y Revisar selección;
cancelación, foco y guardado pertenecen a la capa compartida. Base y porcentaje
son temporales. [Reglas y contrato](../ABASTECIMIENTO-OCM.md).

**Cotizar materiales** abre un diálogo ancho con envío simulado explícito. Cada material muestra identidad, base, adicional 5–10 %, cantidad final editable, entrega más próxima y proveedores elegidos. Los favoritos del tipo se precargan y el autocompletado permite otros proveedores de materiales. Quitar o agregar no modifica los favoritos guardados. La sección común de destinatarios mantiene un contacto o correo manual por proveedor, compartido entre sus materiales. Cada material requiere al menos un proveedor destinatario y cada proveedor incluido una dirección válida; las faltas se muestran en el banner y en sus campos.

Una sola plantilla de asunto y cuerpo se edita para el lote, con ayuda de variables y sin cambiar la global de Configuración. Revisar consulta al servidor y muestra un mensaje por material/proveedor con dirección, asunto y cuerpo bajo un disclosure React Aria. El encabezado recibe el foco al pasar a revisión. La confirmación simula todos los mensajes; durante el envío se bloquean cierre y doble envío. Conflictos ofrecen Actualizar datos y requieren revisar de nuevo, preservando ajustes compatibles. Cancelar y éxito conservan la selección de la tabla. El diálogo se carga bajo demanda y sus borradores se liberan al cerrar. Diseño adaptable a 375/1440 px, con controles y pies de la capa de diálogo existente. [Contrato y plantilla global](../COTIZACIONES-MATERIALES.md).

La OCM preparada desde pendientes exige entrega solicitada anterior al día
más próximo de entrega de sus OC de origen; la igualdad es inválida. El límite
se calcula con las OC seleccionadas y días de Bogotá, conservando la entrega
mínima del día de creación. La revisión muestra el error en el banner y marca
Entrega solicitada; el servicio vuelve a validar antes de guardar con HTTP 422,
`VALIDATION` y `fields.fecha_solicitada_entrega`. Un error conserva el borrador
y devuelve a captura; se retira al corregir una fecha compatible con ambos
límites. No se añade este límite superior a compras sin asociación.

### Vincular una OCM existente

En el detalle de cada renglón de producto, Abastecimiento reúne los vínculos históricos,
el conteo de materiales pendientes y la acción **Vincular OCM existente**. Se habilita
solo si hay una necesidad vigente; Materiales pendientes conserva la creación de OCM.
El diálogo compartido bloquea OC y producto y utiliza `ReferencePicker` para elegir
un material pendiente y un renglón compatible de OCM. Distinguir opciones por número,
posición y proveedor, con cantidad, entrega y autorización disponibles. La identidad
siempre es el ID del renglón y del material, nunca su nombre.
Acotar la colección renderizada a 50 coincidencias, buscando sobre todas las OCM
compatibles. Si hay más, indicar el total y cómo acotar por número o proveedor.
Conservar el ID seleccionado al cambiar la búsqueda; no crear otro menú ni duplicar
la gestión de teclado, foco o filtrado accesible de React Aria.

Mostrar únicamente renglones de OCM de material en seguimiento, autorizadas o no;
permitir compartirlos entre OC sin asignar cantidades. Una entrega igual o posterior
a la OC produce un aviso no bloqueante **solo al vincular**. Toda edición posterior
de esa OCM exige una entrega anterior a todas sus OC asociadas, incluso si conserva
la fecha. No extender la excepción a la creación consolidada.

Errores usan `ErrorNotice`; conservar la selección ante fallos y conflictos. Ante
`SUPPLY_CHANGED`, bloquear el envío hasta **Revisar opciones actualizadas**, sin
elegir otro material o compra automáticamente. Cancelar descarta únicamente el
borrador y usa la confirmación compartida si hubo cambios. Impedir envíos duplicados.
Tras cerrar, devolver foco al disparador conservando scroll; si quedó deshabilitado,
enfocar el encabezado Abastecimiento. Ajustar las acciones en varias filas en móvil.

## Estados e interacción

Autorizada y en seguimiento usan azul; pendientes, ámbar; cerrada/aprobada/validada, verde; anulada/rechazada/inactiva, rojo. Cada estado incluye texto.

Los botones de papelera para eliminar registros y lotes, **Inactivar** y las confirmaciones de **Eliminar**, **Descartar cambios**, **Anular producto** y **Anular** un renglón comparten un hover rojo: texto `#A13939`, borde `#F4D5D5` y fondo `#FFF2F2`, en la familia de la badge Inactivo. Se aplica únicamente a botones habilitados, sin transición de color o sombra. Reutilizar `delete-action` para las papeleras y `destructive-confirm` para las confirmaciones destructivas del diálogo compartido. Las confirmaciones de guardado y reapertura conservan sus estilos propios.

Los errores se muestran visualmente solo en el aviso superior `ErrorNotice`, con foco tras un envío fallido y enlaces a los controles. No repetir textos visibles debajo de los campos. `ControlError` conserva una descripción exclusiva para lectores de pantalla mediante `visually-hidden`; cada control inválido mantiene su asociación accesible y el borde rojo `#DC2626`. `ControlForm` comparte los errores del servicio mediante `fieldErrors` y recoge restricciones del navegador, incluidas las fechas inexistentes o fuera de rango, sin globos nativos. `Field` y los controles reutilizan ese estado en todos los catálogos, órdenes, recepciones, facturas, documentos, correos y configuración. Los formularios anidados en diálogos distintos mantienen ámbitos independientes. Al corregir un dato se retira su error si ya es válido, se conservan los pendientes y el foco permanece en el control; editar un valor sin resolver su formato, duplicado o relación mantiene el aviso. Validar una fecha al salir del campo puede actualizar el aviso sin mover el foco. Los filtros de columna colocan también su aviso encima de los controles.

Los diálogos React Aria retienen el foco; las pestañas admiten flechas, Inicio y Fin. El drawer flotante bloquea la interacción y el desplazamiento del fondo. Tab y Shift+Tab recorren sus controles; Escape, el botón de cierre y el clic en el fondo lo cierran y devuelven el foco al botón de apertura. Seleccionar una sección cierra el drawer flotante y enfoca el contenido. En el modo fijado se puede pasar con Tab hacia el contenido, interactuar con la página y cambiar de sección conservando el panel. Cambiar de modo conserva el foco en el botón de fijación. Los cambios pendientes avisan al salir o cerrar el diálogo.

El foco visible usa un contorno azul. Las transiciones breves respetan movimiento reducido. La impresión oculta controles y conserva siete posiciones, total y firmas en A4 horizontal.

Las cantidades recomendadas son editables. Los textos de demostración distinguen documentos ficticios y correos simulados de las operaciones guardadas.

En Agregar/Editar material, Código MAIA es opcional únicamente cuando el tipo seleccionado es **Corrugado**; la etiqueta no lleva asterisco y la ayuda explica la excepción. Para los demás tipos se muestra como obligatorio. El cambio de tipo actualiza la obligación y la validación del código sin borrar el valor escrito. Un código vacío se conserva como `null`, incluso si el usuario nunca tocó el campo; cualquier código informado debe tener tres dígitos y ser único.

Los renglones de OC y OCM distinguen su cabecera con borde `#E2E8F0` y ribete lateral de 3 px. En seguimiento se conservan fondo `#F6F8FC` y ribete `#2563EB`; cerrado usa gris verdoso `#F1F5F3` / `#749486`, y anulado gris rosado `#F7F2F2` / `#AD8585`, en la familia cromática de su etiqueta. Se conservan texto `#18253B` y secundario `#526179`, con contraste mínimo de 4,5:1 sobre los tres fondos. El código de barras y MAIA usan monospace de 16 px y peso 600.

En OC, la cabecera reúne código de barras y resumen comercial: cantidad solicitada, precio unitario, recibido en lotes cerrados y desviación/margen. Las etiquetas usan 12 px y los valores 14 px / peso 600. Debajo, la franja de empaque muestra referencia de corrugado guardada, cantidad de corrugado y sticker o cinta, con etiquetas de 10 px y valores de 13 px / peso 550. Las cantidades usan cifras tabulares. El resumen de cabecera se adapta a dos columnas hasta 650 px de contenedor y a una hasta 300 px; la franja secundaria conserva la adaptación móvil del detalle. OCM mantiene su resumen de recepción.

El botón de **Ocultar/Desplegar lotes** (OC) o **Ocultar/Desplegar documentos** (material OCM) comparte el grupo de acciones de estado. Por defecto está desplegado; ocultar conserva nombre, estado, acciones, datos y el resumen de lotes con Agregar lote, o la recepción con Registrar / editar. Documentos y acciones de envío se ocultan juntos. Sin lote de material, su botón está deshabilitado. `aria-expanded` y `aria-controls` describen el estado; el panel oculto usa `inert`, `aria-hidden` y visibilidad diferida, sin perder sus datos. El foco permanece en el botón, que admite Enter y Espacio.

La transición de cada panel usa la altura facilitada por React Aria (`--disclosure-panel-height`) durante 180 ms y opacidad de 140 ms; el chevrón gira en 180 ms. React Aria mide al abrir o cerrar, sin un bucle propio por fotograma. Movimiento reducido desactiva las transiciones. El estado local del renglón evita actualizar sus hermanos y el contenido permanece montado para conservar controles y documentos.

El componente de lotes usa una tabla a partir de 720 px de ancho disponible en su contenedor y tarjetas por debajo de ese ancho, también con navegación fijada. Cada tarjeta tiene 16 px de padding, 16 px entre secciones y tarjetas, y 12 px entre columnas; en contenedores de hasta 260 px pasa a una columna. Identificación, factura y ubicación preceden a recepción, batch record, inspección y confirmación, con un único indicador de cada estado. En tarjetas, la estimación y la recepción de batch record comparten una fila de dos columnas; cuando el contenedor no supera 260 px, conservan la adaptación a una columna. En escritorio la columna de acciones se ajusta al ancho de sus botones, que permanecen juntos, y las fechas combinan etiqueta y valor cuando caben para compactar la altura de las filas. Las cinco fechas permanecen visibles en `dd/mm/aaaa`, según el día de Bogotá; una fecha ausente se muestra como «Sin registrar». Se conservan el radio de 12 px, los iconos, los botones y los estados existentes.

Cada OC u OCM admite una orden escaneada, cada factura un documento y cada lote de material un certificado de cada clase. «Agregar» aparece únicamente para clases disponibles; «Reemplazar» corrige el mismo registro vigente. El número de factura enlaza su documento cuando está disponible, con subrayado, foco visible y apertura en otra pestaña; sin documento permanece como texto.

Órdenes separa Productos y Materiales en pestañas con rutas propias. `/ordenes` abre `/ordenes/productos`; Materiales usa `/ordenes/materiales` e incluye Otros con selector de tipo. Los indicadores y listas pertenecen al grupo seleccionado. El último consecutivo y el siguiente número se consultan en esta pantalla. El número siempre es de solo lectura al crear y editar. El proveedor queda deshabilitado después de autorizar para todos los tipos. Las referencias usan OC para producto y OCM para material y otros, conservando el número y los grupos de consecutivos.

En «No autorizadas», **Autorizar** aparece antes del filtro personalizado en ambos grupos. Activa una sesión local con casillas, selección por fila, resaltado azul suave y un resumen con contador, Cancelar y Continuar autorización. Continuar requiere al menos una orden. Los enlaces, documentos e impresión no alternan la selección. El clic funciona tanto en tablas pequeñas como virtualizadas; las casillas admiten teclado y el contador anuncia los cambios. La selección se limita a la página y contexto actuales: cualquier cambio de búsqueda, filtro, ordenación, página, vista o grupo, o abandonar la ruta, desmonta el componente con sus identificadores, diálogo y manejadores. No se guarda en URL, almacenamiento ni caché; la recuperación de memoria corresponde al recolector de basura. El buscador conserva el foco al desmontar el modo.

`OrderAuthorizationDialog` comparte la autorización individual y múltiple. En múltiple lista referencia y proveedor de cada orden, adapta la advertencia irreversible y exige confirmar las firmas de todas. X, Escape y Cancelar conservan la selección al cerrar el diálogo; volver a abrirlo exige confirmar firmas de nuevo. Durante el envío, X, Cancelar, Escape y cierre exterior quedan bloqueados. `authorizeOrder` mantiene `{ id, confirm: true }`; el nuevo comando `authorizeOrders` recibe `{ ids: string[], confirm: true }`. Ambos validan primero elegibilidad y después autorizan en una sola transacción con una fecha común. Un error `AUTHORIZATION_CHANGED` incluye `details.orders: [{ id, reference, reason }]`, aparece en el banner del diálogo, actualiza el snapshot, descarta las afectadas y muestra **Revisar selección** antes de permitir otra confirmación. No hay cambios parciales ni migración de datos.

Los campos de fecha combinan escritura en formato `dd/mm/aaaa`, separadores automáticos tras dos dígitos de día y mes, validación de días existentes y un botón de calendario. La escritura parcial se conserva durante la edición; reemplazar día o mes mantiene los otros segmentos.

La captura muestra el total de cada producto bajo su precio unitario. La revisión muestra la cantidad solicitada, la capacidad del corrugado seleccionado y un porcentaje de sticker independiente por producto, con cantidad final editable. La creación de producto, material y otros exige entrega solicitada. Batch record estimado se muestra exclusivamente dentro del lote de producto. Cada nuevo producto tiene un lote inicial con la entrega de cabecera y estados por defecto, sin número ni datos reales. El detalle usa «Sin número de lote», «Completar lote» para editar el mismo registro y «Agregar lote» para uno adicional. Cambiar la entrega antes de autorizar actualiza los lotes iniciales; después conserva sus fechas. Material y otros precargan su propia entrega estimada al crear el renglón y permiten ajustarla en la recepción. Los consecutivos se muestran junto a las pestañas sin repetir el nombre del grupo ni incluir el texto de ayuda del consecutivo automático en el formulario.

Editar una orden autorizada bloquea los selectores de producto y las acciones de agregar o eliminar renglones. Un aviso explica el motivo y conserva disponibles cantidades, precios y materiales de empaque. Antes de autorizar se puede quitar el renglón junto con su lote inicial; sus órdenes de materiales se conservan para revisión.

Cambiar proveedor en una OC de producto sin autorizar abre un diálogo inmediato con Cancelar enfocado inicialmente y una acción explícita «Cambiar proveedor». Explica la pérdida de cabecera, productos, lotes, documentos propios y vínculos al guardar, y la conservación de las OCM. Aceptar reinicia el borrador con entrega vacía obligatoria; volver al proveedor original restaura el anterior. La revisión mantiene un aviso «Reemplazo pendiente» y la acción «Guardar reemplazo». El borrador conserva los datos almacenados hasta ese guardado.

Cada lote tiene una acción de eliminar con nombre accesible, deshabilitada sin autorización. Su diálogo explica los datos que se borrarán y la conservación de facturas y documentos; borrar el último añade la advertencia de anulación. Esta eliminación física es distinta de anular.

Anular producto confirma que el renglón y todos sus lotes quedarán anulados, conservando identificadores y datos. Anular el último lote no anulado confirma también la anulación del producto y evalúa conjuntamente la selección. Reabrir un producto anulado confirma que todos sus lotes conservados, incluidos los cerrados o anulados, pasarán a seguimiento; no crea ni reemplaza lotes. Reabrir lotes concretos reactiva su renglón sin modificar sus hermanos. El cierre del producto sigue siendo manual, con confirmación de tolerancia. Agregar lote permanece deshabilitado en productos anulados y el estado vacío indica que deben reabrirse. Las confirmaciones reutilizan el diálogo React Aria, cancelan con Escape y mantienen el error visible si falla el guardado. Revalidan las consecuencias y el snapshot antes de persistir. Contrato: [CICLO-LOTES.md](../CICLO-LOTES.md).

Cantidad de sticker y porcentaje comparten fila en escritorio y móvil. El porcentaje ocupa 64 px y ambos campos tienen 8 px de separación. Las fórmulas y límites se muestran en tooltips al pasar el cursor o enfocar el control, con descripciones enlazadas mediante `aria-describedby`. La ayuda se puede leer al mover el cursor sobre ella; Escape la cierra sin cerrar el diálogo. Los errores de validación permanecen visibles junto al campo. El posicionamiento de los tooltips respeta los límites de la ventana y los controles fijos del diálogo.

Solo los productos activos del maquilador seleccionado aparecen como opciones para agregar a la orden. Un producto histórico desactivado mantiene su opción actual bloqueada al editar. Las acciones manuales de seguimiento, incluidos cerrar y anular, aparecen deshabilitadas mientras la cabecera no está autorizada, con una indicación del motivo. Estas comprobaciones visuales acompañan las validaciones del servicio.

### Entrega solicitada al crear órdenes

En la creación de OC, OCM y Otros, la elaboración muestra el día actual de
Bogotá en solo lectura. El servidor registra el instante real de creación y
compara los días de Bogotá: una entrega anterior produce un error HTTP 422
`VALIDATION` con `fields.fecha_solicitada_entrega`; el mismo día es válido.
La revisión utiliza la misma regla y muestra el mensaje en `ErrorNotice`, con
el campo marcado y un enlace desde el banner. Cambiar a otra fecha pasada
conserva el error; corregirlo lo retira. El servicio vuelve a comprobar la
fecha al guardar, sin confiar en la elaboración del cliente. Un rechazo
conserva borrador, datos y consecutivos. La edición histórica conserva sus
reglas anteriores.

## Proveedores: NIT

Agregar y editar proveedores usa un único campo **NIT** con formato `NIT-DV`: números sin puntos, guion y exactamente un dígito de verificación, por ejemplo `900123404-5`. Validar el formato cuando se informe; el campo conserva su carácter opcional. El botón **(?)** junto al título explica el formato al pasar el cursor o enfocarlo. Al guardar, NIT y DV se mantienen separados en el modelo.

La columna NIT, la búsqueda y los filtros usan el formato `NIT-DV`. Los registros históricos sin DV muestran únicamente el NIT, sin añadir un guion vacío ni inventar el dígito.

## Acciones de órdenes e impresión

La columna de acciones del listado reúne los botones de imprimir, consultar o agregar la orden firmada y abrir el detalle, alineados horizontalmente. Los controles de solo icono identifican su acción y la OC u OCM correspondiente mediante su nombre accesible.

Imprimir desde el listado o el detalle abre `/ordenes/{id}/imprimir` en la misma pestaña. **Volver a órdenes**, desde el detalle de una orden de cualquier tipo o la impresión de un listado, recupera el listado de origen; **Volver a la orden**, desde impresión, recupera el detalle. El regreso conserva la ruta y su desplazamiento vertical y, para el listado, pestaña, vista, búsqueda, filtros, ordenamiento y desplazamiento horizontal. La posición se captura al abrir el detalle o pulsar Imprimir y se restituye después de mostrar la vista de origen. Si desde una orden se navega a otra pestaña o vista de la aplicación, se descarta el origen guardado; regresar a Órdenes por la navegación abre la vista por defecto, sin filtros y con scroll en el inicio. Este comportamiento se ejecuta al navegar, sin observar continuamente el scroll.

El botón de orden firmada usa azul cuando hay un adjunto y abre su previsualización. Cuando falta el documento, permanece habilitado y abre el mismo diálogo **Agregar placeholder** utilizado en el detalle de la orden, con **Clase de documento: Orden escaneada** precargada y **Nombre del archivo**. Guardar vincula el documento a la orden de la fila y actualiza el botón a azul para consultarlo.

## Filtros y ordenamiento de órdenes

Las siete columnas de datos son orden/tipo, proveedor, productos o materiales y conceptos, fecha de elaboración, entrega solicitada, estado y total. Cada cabecera tiene un botón de filtro con nombre accesible y estado de apertura. Su menú reúne orden ascendente/descendente, búsqueda y selección múltiple de valores, y condiciones según texto, número, importe o fecha. El filtro de estados está en su columna; se conserva la búsqueda general y el selector Material/Otros.

Los valores seleccionados se combinan como alternativas dentro de una columna y los filtros de distintas columnas se aplican conjuntamente. Productos considera todos los renglones de la orden al filtrar. Importes y fechas se comparan conforme a los valores del listado. Búsqueda, filtros y ordenamiento se recuperan desde la URL.

El menú ocupa como máximo 400 px y el 60 % de la altura disponible, con desplazamiento interno en el contenido central y cabecera/acciones visibles. Toda la fila de un valor, incluidos texto y espacios, alterna su checkbox una sola vez sin cerrar el menú. Aplicar confirma y Cancelar descarta el borrador; Escape cierra y devuelve el foco a la cabecera. Las cabeceras se mantienen cuando no hay coincidencias para poder retirar filtros. La tabla desplaza horizontalmente dentro de su contenedor cuando no cabe.

El selector **Filtro personalizado** y su botón **Ayuda de filtros personalizados** se sitúan a la derecha de la búsqueda, con 8 px de separación. La selección es única; la lista agrupa las variantes con/sin y 7/15/30 días y empieza por **Sin filtro personalizado**. En móvil y con navegación fijada, la barra se distribuye en nuevas filas conforme al ancho disponible, conservando selector y ayuda juntos. Usa los controles, colores, bordes y tipografía existentes.

La ayuda reutiliza el diálogo React Aria con las 13 descripciones del catálogo tipado, identificación de filtros de producto y ejemplos. El contenido central desplaza con título y acción **Entendido** visibles. Tab y Shift+Tab permanecen dentro del diálogo; Escape, Entendido y el cierre devuelven el foco al botón que lo abrió. La consulta sigue disponible al cerrar.

**Limpiar filtros** incluye la selección personalizada y las columnas, conservando búsqueda, vista y ordenamiento. El pie muestra cantidad de resultados, intervalo visible y controles **Anterior**, **Página X de Y** y **Siguiente**, deshabilitados en los extremos. Se presentan 50 órdenes por página después de filtrar y ordenar. El pie se adapta en varias filas al ancho disponible. Las opciones de columna representan todos los resultados de la consulta y los indicadores generales mantienen sus totales. URL y regreso desde detalle o impresión conservan filtro y página.

## Filtros y ordenamiento de facturas

La tabla de Facturas tiene una barra de búsqueda general sobre sus cabeceras y reutiliza el menú de columnas de Órdenes. La barra consulta número normalizado, proveedor y datos de las asociaciones: orden, lote o producto. Número de factura y Proveedor tienen condiciones de texto; Registro usa fechas y Recepciones, números enteros. Ordenamiento, condiciones y selección múltiple comparten el menú de cada una de esas columnas. El número de factura conserva sus ceros y signos al filtrar; el proveedor admite nombres y NIT, y las fechas corresponden al día mostrado en Bogotá. El valor cero de Recepciones consulta las facturas sin asociaciones.

Documentos tiene un menú reducido con dos valores, **Con documento** y **Sin documento**, según el archivo propio de la factura. Los filtros de columnas se combinan, se guardan en la URL junto con el ordenamiento y pueden quitarse desde el menú o mediante **Limpiar filtros** en el pie. Se conservan las cabeceras y sus controles al mostrar un estado vacío.

Los menús mantienen la altura máxima, el desplazamiento interno, las acciones visibles, la selección al pulsar toda la fila y el regreso del foco con Escape definidos para Órdenes. La tabla conserva su propio desplazamiento horizontal en pantallas estrechas. Los formularios de registro y asociación conservan la búsqueda de recepciones existentes.

## Filtros de columnas en abastecimiento

Vínculos entre órdenes incluye una barra de búsqueda por número de OC u OCM, admitiendo prefijos sin espacio y sin distinguir mayúsculas. OC consulta productos; OCM, materiales. Reutiliza los menús de columna de Órdenes y Facturas: condiciones numéricas para Orden de producto y Orden de material; texto para Producto / maquilador y Material / proveedor; valores enumerados para Estado del material. Los valores de las órdenes muestran OC y OCM; cada columna se compara dentro de su propio grupo. Búsqueda, filtros y ordenamiento se combinan y se conservan en la URL. El contador y Limpiar filtros están en el pie.

En ambas tablas, Limpiar búsqueda retira únicamente el texto buscado y Limpiar filtros conserva búsqueda y ordenamiento. La barra usa los controles existentes, una etiqueta accesible y un botón de limpieza que se adapta al ancho disponible. Las opciones de cada columna consideran la búsqueda y los filtros de las otras columnas; las barras y cabeceras permanecen disponibles sin coincidencias.

Los estados vacíos conservan las cabeceras para ajustar o quitar filtros. Los menús mantienen la altura limitada, el desplazamiento interno y la devolución del foco con Escape. Lotes y certificados conserva la búsqueda de su propio catálogo.

## Tablas con filtros de columna

Todas las tablas siguientes muestran un botón de filtro en cada cabecera de datos. Cada botón abre el mismo menú para seleccionar varios valores, aplicar condiciones según el tipo de campo y ordenar. Las cabeceras de acciones no ofrecen filtros. La búsqueda de la tabla conserva su comportamiento y se combina con los filtros.

Los menús de filtro permanecen abiertos al desplazar la página o cualquier contenedor, también fuera del menú. Conservan su desplazamiento interno y el cierre con Escape, clic fuera o salida del foco con Tab.

| Pantalla y tabla                                  | Columnas con menú y tipo                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Órdenes → Productos; Órdenes → Materiales y Otros | Orden/tipo (entero), proveedor (texto), productos/materiales/conceptos (texto), fecha de elaboración (fecha), entrega solicitada (fecha), estado (enumeración) y total (importe).                                                                                                                                                                                      |
| Facturas                                          | Número de factura y proveedor (texto), registro (fecha), recepciones (entero), documentos (selección Con documento / Sin documento).                                                                                                                                                                                                                                   |
| Abastecimiento → Vínculos entre órdenes           | Orden de producto y orden de material (entero), producto/maquilador y material/proveedor (texto), estado del material (enumeración).                                                                                                                                                                                                                                   |
| Catálogos → Productos → Lista de productos        | Producto, maquilador, categoría, maquila/IVA y código asignado (texto); unidades por lote (entero); activo (enumeración Sí/No).                                                                                                                                                                                                                                          |
| Catálogos → Materiales → Lista de materiales      | Código MAIA, material y tipo de material (texto); el código mantiene los ceros iniciales.                                                                                                                                                                                                                                                                              |
| Proveedores → Proveedores                         | Nombre completo, nombre resumido y NIT (texto); proveedor de maquila, proveedor de materiales y activo (enumeraciones Sí/No).                                                                                                                                                                                                                                          |
| Proveedores → Direcciones de proveedor            | Proveedor, nombre de bodega, ciudad, dirección y complemento (texto).                                                                                                                                                                                                                                                                                                  |
| Proveedores → Contactos de proveedor              | Proveedor, nombre, cargo o área, correo y celular (texto).                                                                                                                                                                                                                                                                                                             |
| Documentos | Documento y propietario (texto), clase (enumeración), cargado (fecha). Reutiliza el menú compartido de selección múltiple, condiciones y ordenamiento; Acciones no lleva filtro. El selector de clase refleja el filtro de columna y permite retirarlo con Todas las clases. Limpiar búsqueda conserva filtros y ordenamiento; Limpiar filtros conserva búsqueda y ordenamiento. Las cabeceras permanecen visibles sin coincidencias y la tabla conserva su desplazamiento horizontal en móvil. |
| Códigos de barras                                 | Código y producto (texto), estado GS1/sistema (enumeración), creación (fecha). El botón **(?)** junto a la búsqueda abre un diálogo modal con fondo atenuado y las definiciones de Creado en GS1, Verificado en sistema, Activo, Asignado e Inactivo. Se cierra con **X**, **Entendido**, Escape o clic fuera; mientras está abierto bloquea la interacción con la aplicación. **Avisar códigos nuevos** abre un diálogo de selección que muestra los códigos en estado Creado en GS1, todos seleccionados por defecto. Permite seleccionar o deseleccionar códigos individualmente y ofrece una casilla para seleccionar todos; al continuar, el cuerpo del correo incluye solo los códigos seleccionados. Si no hay códigos por verificar, informa el estado y deshabilita la preparación del aviso. Reutiliza el diálogo compartido, las casillas de selección y los estilos existentes. |

Los pasos **Creado en GS1**, **Verificado en sistema**, **Activo** y **Asignado** son botones que aplican una selección exclusiva al filtro existente de la columna Estado GS1/sistema. Conservan la búsqueda, los filtros de otras columnas y el ordenamiento, sin introducir otro mecanismo de filtrado. Su estado `aria-pressed` y resaltado azul reflejan la selección única de esa columna; quitar o limpiar el filtro desactiva el resaltado. El fondo normal es blanco y el hover es gris `#f8fafc`. Inactivo permanece disponible desde el filtro de columna.

En la asignación de una factura existente, las casillas reflejan las asociaciones iniciales. Desmarcar y guardar retira únicamente esa factura del lote o recepción; buscar conserva las selecciones ocultas. Al crear una factura, **Adjuntar documento** reutiliza el formulario de placeholder: clase Factura física y nombre de archivo. El botón de adjuntar o reemplazar usa 5 px de padding arriba y abajo y altura mínima de 32 px. El documento se prepara en el borrador, con Reemplazar documento y Quitar documento, y se guarda conjuntamente al confirmar la factura.


En Documentos, el número de lote de material de la columna Propietario es un enlace a Abastecimiento → Lotes y certificados. Abre directamente el diálogo existente de información relacionada e historial del lote elegido. La pestaña y el lote se identifican en la URL para permitir enlaces directos y recarga; cerrar el diálogo retira la selección y mantiene la tabla de lotes. Los propietarios de factura y orden conservan sus enlaces y Global permanece como texto.

### Códigos de barras: vigencia y asignación

Directriz obligatoria: reutilizar los badges existentes. Los cinco estados tienen colores distintos: Creado en GS1 usa ámbar (`creado_gs1`), Verificado en sistema azul (`verificado_sistema`: texto `#2455B2`, borde `#D8E5FE`, fondo `#EFF5FF`), Activo verde (variante `validado`), Asignado azul claro / verde azulado (`asignado`: texto `#0F766E`, borde `#BCEFF1`, fondo `#ECFEFF`) e Inactivo rojo (`inactivo`). Conservar texto visible, bordes y densidad; contrastar texto/fondo ≥ 4,5:1. `Badge` aplica la variante verde solo al contexto de códigos mediante su variante visual.

Activo y Asignado son estados distintos del mismo enum y ambos indican vigencia. Solo un Asignado por producto se utiliza en nuevas órdenes. Asociar un código verificado lo convierte automáticamente en Asignado y el anterior en Activo; «Asignar código» permite recuperar cualquiera de los activos del mismo producto. Confirmar mostrando ambos códigos. Desactivar el asignado advierte que el producto quedará sin código para nuevas órdenes; no elegir sustitutos automáticamente. Historial e impresión conservan el código de cada renglón.

En Códigos, mostrar una fila por código, con producto, estado, fecha y acciones agrupadas horizontalmente como botones compactos de solo icono (`icon-btn`), con nombre accesible y tooltip compartido. Mantener búsqueda por código o producto, filtros de columna y ordenamiento. En móvil, permitir desplazamiento horizontal interno, nunca de la página.

Cada acción habilitada aplica al hacer hover el texto, borde y fondo de su badge de referencia:

| Acción / tooltip | Icono Lucide | Color de hover |
| --- | --- | --- |
| Confirmar verificación en el sistema | `BadgeCheck` | Azul de Verificado en sistema |
| Asignar a producto | `PackagePlus` | Verde de Activo |
| Asignar código activo | `Barcode` | Verde azulado de Asignado |
| Inactivar | `Ban` | Rojo de Inactivo |
| Ver órdenes | `History` | Estilo secundario habitual |

La confirmación de **Marcar código inactivo** usa la variante destructiva y el botón **Inactivar código**, sin icono, igual que las confirmaciones de eliminación, anulación y descarte; al hacer hover aplica el mismo rojo de Inactivo.

En **Avisar códigos nuevos**, la casilla **Seleccionar todos** se sitúa debajo de **Códigos por verificar** y encima de la lista, con fuente de 12 px y color secundario `#526179`. Los códigos de la lista usan monospace de 12 px y peso normal, sin negrita.

Confirmaciones usan el diálogo compartido React Aria, bloqueo durante guardado y foco devuelto al disparador. Errores conservan el diálogo y elección; conflictos actualizan el snapshot y exigen «Revisar datos actualizados» antes de confirmar otra vez. Proveedor del producto continúa bloqueado en GS1. No sustituir identificadores por nombres, incluso si coinciden.

Especificación de datos, recuperación y pruebas: [CODIGOS-BARRAS.md](../CODIGOS-BARRAS.md).

## Hoja alternativa de OC de productos

**Configuración → Apariencia → Vista alternativa de la tabla de OC de productos**, independiente de la preferencia de creación y desactivada por defecto. Exclusiva del listado de Productos; Materiales/OCM conserva su tabla actual.

Usa el ancho disponible, una cinta compacta de dos filas en escritorio y ninguna tarjeta de resumen. Las acciones agrupan creación, lotes, seguimiento del producto, autorización, documentos, impresión, edición, portapapeles, filtros y columnas. Los iconos tienen nombre accesible y tooltip. La cinta se oculta y recupera desde un control siempre disponible. Los filtros conservan el estándar global y los encabezados reutilizan `ColumnHeader`.

El cuerpo constituye una excepción de densidad: texto de 12 px, filas de 32 px, bordes finos y cifras alineadas a la derecha. Los encabezados permanecen visibles verticalmente; todas las columnas se desplazan horizontalmente. Sin paginación: se montan las filas visibles y unas seis de margen por lado, comunicando total y posiciones globales a las ayudas de accesibilidad. En móvil el desplazamiento es interno.

En seguimiento presenta lotes abiertos y cerrados de OC autorizadas; Anuladas presenta sus lotes anulados. Blanco representa seguimiento; verde suave (`#ecfdf3`), cierre; rojo suave (`#fff1f2`), anulación. La selección añade bordes azules y conserva esos colores. El estado también figura en la etiqueta accesible de la fila. No se añaden columnas de estado de cabecera o renglón. No autorizadas presenta un registro por renglón con nueve columnas; las otras hojas tienen las 24 columnas de [HOJA-OC-PRODUCTOS.md](../HOJA-OC-PRODUCTOS.md). La elección de columnas se recuerda por hoja y siempre queda una visible.

Clic selecciona; Shift+clic y Shift+flechas forman rangos. Doble clic, F2 o escritura inicia edición. Enter confirma y baja; Escape cancela la celda. Autocompletados y calendarios conservan prioridad. Tab permite salir cuando no se está editando. Los errores se reúnen en la cabecera y marcan sus celdas en rojo, con acceso para localizarlas. Los cambios pendientes se distinguen con peso y subrayado punteado.

Las ediciones se identifican por entidad e ID. Cabecera se propaga a la OC; renglón, a sus lotes; lote afecta únicamente a sí mismo. La solicitada original se edita en el primer lote y los siguientes muestran su saldo anterior, excluyendo recibidas de anulados. Una sobreentrega se indica con cero y un triángulo ámbar con ayuda por cursor, foco o toque. Las OCM vinculadas muestran solo sus números y explican los materiales en su tooltip.

Solo Guardar persiste. Recuperar sustituye el borrador actual, mantiene edición y conserva la comprobación de conflictos. Filtrar, ordenar y recuperar no guardan. Las filas permanecen estables durante la captura y se recalculan al guardar o reaplicar una consulta. Estados, autorización, nuevos lotes y reemplazo de proveedor resuelven antes el borrador: Guardar y continuar / Descartar y continuar / Cancelar. Autorizar incluye la OC completa, incluso renglones ocultos. Imprimir y documento requieren una única OC distinta.

El ciclo global conserva IDs y datos al anular o reabrir. La confirmación del último lote explica la anulación del producto. Reabrir un producto anulado pone todos sus lotes conservados en seguimiento; reabrir lotes concretos mantiene el estado de sus hermanos. El cierre del producto sigue siendo manual y confirma tolerancia. Eliminar físicamente permanece separado de anular. Contrato y pruebas: [CICLO-LOTES.md](../CICLO-LOTES.md) y [VERIFICACION.md](../VERIFICACION.md).
