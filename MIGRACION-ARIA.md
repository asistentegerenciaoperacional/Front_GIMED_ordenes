# Migración integral a React Aria

Estado: **migración completada y verificada**. La compilación final, los recorridos y el portable pasan. La comparación de producción aprueba **39 de 39 límites** en el equipo actual. El ensayo de CPU 4× se informa por separado, conforme a la confirmación del usuario.

## Recuperación y referencia

Antes de instalar dependencias o modificar la implementación se creó y comprobó el commit **`bd37e32c943477dd36c6936c8453160c0abf34b9`** (`chore: snapshot before React Aria migration`). Incluye los cambios pendientes y archivos nuevos no ignorados. Se respetaron las exclusiones de datos locales, dependencias y archivos generados.

La referencia actualizada tenía **130 pruebas automatizadas correctas**. Las 126 del plan correspondían a una revisión anterior. Compilación inicial: JavaScript 515,23 kB / 146,81 kB gzip; CSS 37,44 kB / 8,40 kB gzip. La compilación de referencia se conservó separada en `tests/.tmp/aria-baseline/dist`.

Dos recorridos ya fallaban antes de migrar: el general intentaba `selectOption` sobre el buscador de productos con datalist; el de filtros esperaba un ejemplo de ayuda que ya no formaba parte de la pantalla. Sus comprobaciones se adaptan al control visible y a las reglas vigentes, manteniendo la cobertura funcional.

SHA-256 inicial de `data/database.json`: `C3635D684F628F204BF2EA0F28A6410B9CAEC8E807E0AE3532FFA887B025786C`. Las pruebas usan bases temporales o fixtures en memoria; ninguna necesita guardar sobre los datos del usuario.

Dependencias fijadas: `react-aria-components` **1.22.1**, `@internationalized/date` **3.12.4** y optimizador de idiomas **2.1.0**, con archivo de bloqueo. La interfaz conserva español y los campos numéricos mantienen la captura decimal existente.

## Inventario de migración

Se consultó CodeGraph y se revisó estáticamente toda la interfaz. La fachada `src/ui.tsx` conserva los puntos de importación de los procesos actuales.

| Punto | Controles migrados y sustituto compartido |
|---|---|
| `src/App.tsx` | Acciones, enlaces, navegación interna y confirmación de salida mediante `Action`, `ControlLink`, `confirmAction`. Conserva retorno desde impresión y restauración del scroll. |
| `src/navigation-drawer.tsx` | Navegación flotante con `ModalOverlay`, `Modal`, `Dialog`; acciones de fijar/desfijar con `ToggleButton`. El modo fijado conserva estructura `aside`. |
| `src/ui.tsx` | Fachada de botones, enlaces, cancelación protegida, campos y errores; pestañas `Tabs`, `TabList`, `Tab`, `TabPanel`; `ProductPicker` con `ComboBox` e identificadores. |
| `src/forms.tsx` — órdenes | Creación/edición de productos, materiales y otros; revisión, cantidades, importes exactos, fechas, corrugado, sticker y cinta; selectores, formularios, diálogo y ayudas compartidos. |
| `src/forms.tsx` — catálogos | Formularios generados para todas las entidades; productos mediante `ProductPicker`; relaciones y enumeraciones con `Select`; campos obligatorios y errores conservados. |
| `src/forms.tsx` — recepciones/facturas | Lotes, recepciones, selección con `CheckboxGroup`, factura anidada y búsquedas; mantiene identificadores y scroll de la lista. |
| `src/document-controls.tsx` y `src/forms.tsx` — correo | Agregar/reemplazar documentos anidados, confirmación de borrado, destinatarios con sugerencias y texto libre permitido, editor de correo simulado. |
| `src/orders.tsx` | Listados, filtros, autorización, detalle, lotes, recepción, cierre, anulación, reapertura, documentos y tabla de impresión mediante controles compartidos y `DataTable`. |
| `src/order-line-card.tsx` | Desplegados locales mediante `Disclosure` y `DisclosurePanel`, conservando contenido y acciones. |
| `src/column-filter.tsx` | `Popover` no modal, `Select`, búsqueda, condiciones, `CheckboxGroup`, selección total e intermedia, ordenamiento y validación. |
| `src/catalogs.tsx` | Pestañas principales/secundarias, catálogos, proveedores, todas sus tablas, edición y borrado confirmado. |
| `src/flows.tsx` — abastecimiento | Vínculos y lotes, consolidación, selección, filtros, búsquedas, tablas y formularios. |
| `src/flows.tsx` — facturas | Listado, detalle, asociación de recepciones, documentos, edición y navegación. |
| `src/flows.tsx` — códigos | GS1, asignación de producto por identificador, proveedor bloqueado, estados, historial y tablas. |
| `src/flows.tsx` — documentos/correos | Listados, filtros, acciones, vistas y diálogos; documentos placeholder generados quedan fuera del cambio de HTML. |
| `src/flows.tsx` — configuración | Pestañas verticales, campos, acciones, parámetros y tablas auxiliares. |
| `src/components/controls.tsx` | `Button`, `ToggleButton`, `Link`, `Form`, `Label`, `TextField`, `SearchField`, `Input`, `TextArea`, `FieldError`, `Select`, `ComboBox`, `NumberField`, `CheckboxGroup`, `Checkbox`. |
| `src/components/data-table.tsx` | Adaptador declarativo a `Table`, `TableHeader`, `Column`, `TableBody`, `Row` y `Cell`; mantiene columnas y acciones. Páginas de 50 órdenes usan `Virtualizer`/`TableLayout` de React Aria contra el viewport, conservando las 50 posiciones y todas las columnas accesibles. |
| `src/components/date-control.tsx` | Máscara de texto continua y calendario React Aria, fechas parciales/inválidas, min/max, teclado y pegado. |
| `src/components/overlays.tsx` | Diálogos, confirmaciones asíncronas, protección de cambios, ayuda `Tooltip` y apilamiento. |
| `src/components/aria.css` | Presentación compacta común, tokens actuales, estados, foco, adaptación y reglas de impresión. |
| `src/components/calendar-content.tsx` | Calendario por demanda; las pantallas secundarias se distribuyen en módulos locales. Formularios principales y captura de fecha se cargan inicialmente para evitar una pausa de Suspense en la primera apertura. |
| `src/order-read-cache.ts` | Caché débil por snapshot inmutable, reutilización de índices y celdas y liberación al refrescar datos. No conserva bases anteriores mediante referencias fuertes. |
| `src/snapshot-memory.ts` | Comparte cadenas iguales de cada snapshot recién recibido y libera su pool temporal antes de entregarlo a React. Conserva exactamente identificadores, fechas, decimales, Unicode, JSON y objetos de registro; no modifica archivos guardados. |

No se modifica la API, el modelo persistido, Zod ni las reglas de negocio. Las opciones `<option>`/`<optgroup>` que quedan en JSX son datos declarativos del adaptador `Select`, no controles nativos montados por las pantallas. `SuggestionList` registra sugerencias para los campos que admiten texto libre y no crea un datalist en el DOM.

La prueba `tests/aria-boundary.test.ts` impide introducir controles interactivos HTML y gestión manual de diálogos o confirmaciones fuera de la capa compartida. Las pruebas de navegador interactúan con opciones visibles y roles accesibles; `tests/aria-playwright.mjs` conserva el contrato de los recorridos anteriores mientras los dirige a los componentes nuevos. El [inventario detallado](tests/evidence/aria/inventory.json) registra **486 puntos de uso**, con archivo, línea, componente y sustituto. Se regenera con `npm run inventory:aria`.

## Verificación y rendimiento

Resultados funcionales confirmados: **133 pruebas automatizadas**, **598 comprobaciones del recorrido completo de Chromium**, **43 de validación**, **52 de filtros**, **60 de detalle** y **56 de componentes en cada uno de Chromium, Firefox y WebKit**. Incluyen selección de fecha con flechas y Enter, además de cerrar el calendario con Escape sin cerrar el formulario. La selección de recepciones conserva el scroll en 32 clics (0 px de cambio) y admite Tab, Espacio y rueda. El reinicio conserva íntegramente las 28 colecciones temporales. El portable superó 18 comprobaciones, incluida la carga local de formulario y calendario.

La comparación de producción se reproduce con `npx tsx scripts/measure-aria.ts baseline` y `npx tsx scripts/measure-aria.ts after`, conservando la compilación inicial. Usa el mismo navegador Chrome, equipo y fixtures deterministas de 6.000 y 60.000 lotes. Los tiempos de interacción empiezan en el evento real del navegador y terminan después de mostrar el resultado; excluyen el tiempo de envío del comando de Playwright. Los límites se aplican al equipo actual, sin limitar la CPU, también a 375 px. Por confirmación expresa del usuario, el ensayo adicional de CPU 4× se informa aparte y no determina la aceptación. Se reproduce con `--scenario=stress`.

Presupuestos obligatorios: incremento del P95 de interacción ≤ el mayor entre 15 % y 20 ms; P95 de carga ≤ el mayor entre 15 % y 100 ms; memoria estable tras GC ≤ el mayor entre 15 % y 5 MB (5.000.000 bytes). Se registran JavaScript descargado, ciclos repetidos y memoria recuperada. Las mediciones se ejecutan sin otros recorridos de navegador simultáneos. `npm run benchmark:aria` prepara una compilación aislada del commit inicial si falta y genera la comparación con verificación automática de presupuestos.

Se completaron Chromium completo, comprobaciones principales en Firefox/WebKit, resoluciones 375/768/1024/1440 px, persistencia y portable de compilación nueva. Los [resultados de rendimiento](RENDIMIENTO.md#comparación-de-la-migración-a-react-aria) incluyen los 39 límites aprobados, el aumento del JavaScript inicial y las demoras del ensayo de estrés. La comprobación adicional de 600 ciclos terminó con 17,58 MB y 0 contenedores desmontados retenidos; su ventana final varió 0,13 %. Las evidencias se guardan en `tests/evidence/aria` y se enlazan desde `VERIFICACION.md` y `RENDIMIENTO.md`. El [portable comprobado](tests/.tmp/aria-portable.zip) se conserva como archivo temporal separado del paquete del usuario.

## Capturas

Se inspeccionaron el listado de órdenes, la revisión de cantidades y los controles compactos. El recorrido completo conserva capturas de cada proceso:

| Vista | Evidencia |
|---|---|
| Órdenes y acciones agrupadas | [Escritorio](tests/evidence/01-ordenes-desktop.png), [375 px](tests/evidence/ordenes-375.png), [768 px](tests/evidence/ordenes-768.png), [1024 px](tests/evidence/ordenes-1024.png) |
| Revisión de cantidades | [Formulario](tests/evidence/02-revision-orden.png), [móvil](tests/evidence/19-revision-productos-movil.png) |
| Controles, selección y fecha | [375 px](tests/evidence/aria/controls-375.png), [768 px](tests/evidence/aria/controls-768.png), [1024 px](tests/evidence/aria/controls-1024.png), [1440 px](tests/evidence/aria/controls-1440.png) |
| Menús abiertos y calendario | [ComboBox](tests/evidence/aria/combobox-1440.png), [ComboBox móvil](tests/evidence/aria/combobox-375.png), [Select](tests/evidence/aria/select-1440.png), [Calendar](tests/evidence/aria/calendar-1440.png) |
| Filtros y ayudas | [Escritorio](tests/evidence/40-filtros-personalizados-escritorio.png), [móvil](tests/evidence/43-filtros-personalizados-movil.png), [tooltip](tests/evidence/21-tooltip-corrugado.png) |
| Facturas y documentos | [Listado](tests/evidence/48-facturas-listado.png), [asociación](tests/evidence/41-factura-asociacion.png), [adjunto](tests/evidence/52-factura-adjunto-placeholder.png) |
| Catálogos y códigos | [Catálogos](tests/evidence/15-catalogos.png), [GS1](tests/evidence/14-codigos.png) |
| Abastecimiento, correo e impresión | [Abastecimiento](tests/evidence/51-abastecimiento-columnas-1440.png), [correo](tests/evidence/05-correo-simulado.png), [impresión](tests/evidence/13-impresion.png) |
