# Productos y materiales: configuración conjunta

Vigente desde el 23 de octubre de 2026. Catálogos → Productos & materiales muestra una sola lista por producto. Sustituye las dos vistas de relaciones; mantiene `materiales_asociados` y `producto_corrugado`, sin nuevas columnas ni migración de datos. Los enlaces antiguos a ambas vistas abren la lista unificada.

## Consulta y diseño

Todos los productos aparecen alfabéticamente, identificados por ID. Los homónimos muestran maquilador e identificador abreviado. Cada grupo tiene nombre, conteo, despliegue y lápiz siempre disponible; no existe Agregar global ni acciones por material. Un grupo vacío conserva el lápiz y deshabilita el despliegue.

Se reutiliza `GroupedRelationsTable`, incluyendo densidad, sangría, animación y movimiento reducido de favoritos. El detalle tiene tres columnas alineadas entre grupos: Tipo de material, Material y Código MAIA. Corrugado aparece primero y su capacidad debajo del nombre, sin columna adicional. Si falta en un producto con otros materiales, muestra Sin asignar. El conteo incluye solo relaciones reales: materiales asociados y, si existe, un corrugado.

La búsqueda por producto, maquilador, material, tipo o MAIA abre los grupos coincidentes con su detalle completo. El filtro React Aria aplica una condición por vez: Todos los productos, Con materiales, Sin materiales, Maquila full, Maquila parcial, Con cinta, Con sticker o Sin corrugado asignado. Se combina con la búsqueda. Con materiales incluye productos con al menos una relación, incluido el corrugado; Sin materiales muestra únicamente productos con conteo cero. FULL sigue significando ausencia de `materiales_asociados`; el corrugado por sí solo no cambia esa clasificación.

## Editor

El lápiz abre el diálogo compartido con Producto bloqueado. Primero se configuran corrugado y adhesivo; debajo se reutiliza `MultiRelationPicker` con Materiales disponibles y Materiales seleccionados. La lista general excluye Corrugado, Cinta y Sticker. Buscar conserva la selección final, permite quitar elementos y muestra altas/bajas antes de guardar. Los identificadores persisten separados de sus etiquetas.

Corrugado es opcional y se selecciona por búsqueda. Si está asignado, Unidades por corrugado exige un entero seguro mayor que cero. Quitar corrugado limpia su referencia y capacidad en el borrador.

El editor usa 16 px entre bloques y 8 px entre los títulos de empaque y sus campos. Corrugado reserva una columna fija para la papelera de 38 px, alineada al borde inferior del campo, con tooltip Quitar corrugado; sin referencia permanece deshabilitada para evitar desplazamientos. En móvil, la referencia ocupa una fila completa y la capacidad comparte la siguiente con la papelera de 40 px. Buscar conserva la configuración hasta elegir una opción y restaura la etiqueta al abandonar una búsqueda sin selección. Las casillas de adhesivo usan texto de 12 px y descripción de 11 px, con la misma alineación de las listas inferiores. Se elimina el margen adicional antes de Materiales disponibles, sin cambiar su selector ni el guardado.

Las dos casillas Sticker y Cinta asignan el ID del único material de su rol. Marcar una desmarca la otra; ambas vacías significa ninguno. Si no existe un material del rol, su casilla se bloquea y explica que debe configurarse en Materiales. No se crea ni escoge arbitrariamente ningún material.

Guardar aplica la configuración completa; marcar casillas no escribe en la base. Cancelar/Escape confirma descarte cuando hay cambios. Los errores conservan el borrador. Durante envío se bloquean controles, cierre y solicitudes duplicadas. Se restaura foco al lápiz y desplazamiento de página/tabla; si el grupo deja de coincidir con la consulta, se enfoca la búsqueda. En móvil se apilan campos y listas, con un único desplazamiento horizontal compartido para la tabla agrupada.

## Contrato e integridad

`setProductMaterials` recibe `id_producto`, `id_materiales`, `corrugado` y `expected`. Los IDs incluyen materiales generales y como máximo un adhesivo; excluyen Corrugado. `corrugado` es nulo o `{ id_material, unidades_por_corrugado }`. `expected` contiene los IDs y el corrugado originales. Devuelve `{ config }` con la configuración guardada.

El comando valida referencias, tipos y capacidad antes de reemplazar únicamente las relaciones del producto, en la transacción del store. `PRODUCT_MATERIALS_CHANGED` incluye la configuración actual; el cliente refresca el snapshot y conserva el borrador. Revisar configuración actual requiere confirmar su reemplazo antes de volver a guardar.

Existe como máximo un material Cinta y uno Sticker en todo el catálogo. R13 mantiene además la exclusión por producto. La validación compartida se aplica a formulario, servicio e integridad; impide duplicados concurrentes y cambios de significado en tipos con materiales o materiales especiales utilizados. Se admiten cambios cosméticos normalizados. Se conserva el reconocimiento existente de adhesivos por nombre normalizado; nombres que indiquen ambos roles se rechazan como ambiguos. Los cambios ordinarios de tipo que no alteran un rol especial conservan sus reglas actuales.

Las recomendaciones usan estos mismos roles. Guardar la configuración no recalcula cantidades ni precios ya almacenados en órdenes. Las bases incompatibles se rechazan conservando su archivo original; no se fusionan ni borran materiales automáticamente. La base local comprobada tenía un material por rol, cuatro corrugados válidos para seis productos y ninguna relación que requiriera corrección.

## Recuperación y verificación

Commit previo: `9f685bfb2c0ea30d50de79f0ab7d49d2a36a670f`. Los respaldos ignorados por Git y sus hashes están en [recovery.json](tests/evidence/product-materials/recovery.json). La implementación conserva la base local byte por byte.

Ejecutar `npm test`, `npm run build` y `node scripts/verify-aria-browser.mjs tests/product-materials.browser.js chromium` (repetir con firefox y webkit). Las pruebas usan bases temporales; cubren unicidad, referencias, capacidades, conflictos, concurrencia, rollback, historial, filtros, selección, cancelación, foco y scroll. Los recorridos verifican 375/768/1024/1440 px y un contexto táctil.

El ajuste compacto del empaque se verifica además con `node scripts/verify-aria-browser.mjs tests/product-materials-layout.browser.js chromium`: 67 comprobaciones a 375/600/768/1104/1440 px, con y sin corrugado. Mide estabilidad de posiciones, tamaño de la papelera, tooltip, tipografía, contención y búsqueda sin perder la configuración. Esta prueba no modifica registros. Pasaron también las 63 comprobaciones del recorrido del editor, las 199 pruebas unitarias y la compilación. Reporte: [presentación del empaque](tests/evidence/product-materials/chromium-product-materials-layout.browser.json).

Los informes de [tests/evidence/product-materials](tests/evidence/product-materials) conservan referencias de producción y capturas. El rendimiento compara el mismo navegador/equipo y fixtures deterministas de 6.000/60.000 lotes, con los límites acordados. El ensayo CPU 4× permanece separado.

Reproducir rendimiento con `npm run build` y `node scripts/benchmark-product-materials.mjs`. Las capturas locales se generan con `node node_modules/tsx/dist/cli.mjs scripts/capture-product-materials.ts` sobre el servidor de desarrollo, verificando ausencia de escrituras. El [informe de entrega](tests/evidence/product-materials/delivery-report.json) reúne pruebas, respaldos, hashes, rendimiento y capturas.
