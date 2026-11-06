# Estados de productos y lotes

## Anulación y reapertura conservan los datos

Anular un producto de una OC autorizada cambia su renglón a `anulada` y todos sus lotes a `anulado`. Se conservan los identificadores, el orden de los lotes, factura, cantidades, fechas, Batch record, inspección, ubicación y vínculos de abastecimiento.

El estado de cada renglón de producto se guarda en `orden_producto.estado`, pero lo determinan sus lotes: alguno en seguimiento → `en_seguimiento`; ninguno en seguimiento y alguno cerrado → `cerrada`; todos anulados o ningún lote → `anulada`. Un cerrado y tres anulados forman un producto cerrado. El motor actualiza únicamente los propietarios afectados dentro de la transacción que cambia sus lotes; ni el arranque ni las lecturas ni la navegación recalculan estados.

Reabrir un lote existente o agregar uno nuevo en seguimiento reactiva su producto, conservando el estado y los datos de sus hermanos. Agregar lotes está permitido en productos cerrados o anulados de OC autorizadas. Cerrar el último lote abierto cierra el producto automáticamente. La desviación sigue usando únicamente cantidades de lotes cerrados y la tolerancia queda informativa, sin confirmación de cierre.

El detalle elimina Cerrar/Reabrir producto y conserva Anular como atajo confirmado para anular todos sus lotes. La hoja elimina íntegramente el menú Productos, conserva el menú Lotes y permite Nuevo lote sobre productos cerrados/anulados. Se elimina el filtro Seguimiento por cerrar; sus valores antiguos vuelven a Sin filtro personalizado.

Toda anulación de lote o producto solicita confirmación en un diálogo compartido entre ambas vistas. Para un producto muestra «Se anulará el producto y todos sus lotes. La información de los lotes se conservará. ¿Está seguro?». Para un lote muestra «Se anulará el lote seleccionado. La información de los lotes se conservará. ¿Está seguro?». Si es el último lote no anulado, agrega «Esta acción anulará el último lote y también el producto.» antes de la frase sobre conservación y enumera en una lista cada producto afectado con su OC. Las selecciones múltiples usan el plural e identifican únicamente los productos que quedarán anulados. Anular el último lote no anulado de un renglón también anula ese producto. El formulario clásico de lote y la hoja alternativa utilizan el mismo motor del servidor. Los lotes anulados deben reabrirse antes de cerrarlos. Si anular el último abierto deja hermanos cerrados, el producto queda cerrado y el aviso lo explica; no se anuncia una anulación de producto en ese caso.

Eliminar físicamente un lote sigue siendo una acción distinta, destructiva y confirmada. El producto adopta el estado de los lotes restantes con la misma regla: cerrado si conserva cerrados sin abiertos; anulado si no quedan lotes o todos quedan anulados. La eliminación no borra las facturas ni sus documentos.

## Comandos y concurrencia

`setProductLotStates` acepta `{ ids, estado, expected?, confirm? }`. `ids` debe contener identificadores de lote distintos; `estado` admite `en_seguimiento`, `cerrado` o `anulado`. El servidor comprueba autorización, identidad, datos del lote y el conjunto afectado en una única transacción. Cualquier rechazo conserva archivo y memoria completos.

El helper compartido `productLotLifecycleSnapshot(db, lineIds)` genera `expected`: una lista de productos `{ id, estado, cantidad_solicitada, margen_tolerancia, lotes: [{ id, estado, cantidad_recibida }] }`, ordenada por ID. Incluye todos los lotes de cada renglón afectado, aunque algunos no estén seleccionados. Si se envía un snapshot distinto del actual, se devuelve `LOT_STATE_CHANGED` sin guardar. Así una confirmación no se puede reutilizar después de que se agregue/elimine un lote, cambie un estado involucrado, se modifique una cantidad que afecte la desviación o cambie el margen de cierre.

Si la anulación alcanza el último lote no anulado de uno o varios productos, el servidor devuelve `CONFIRMATION` con `details.expected` y `details.products` (`id`, `posicion`, `no_orden`, `producto`). La interfaz confirma antes de enviar la operación con `confirm: true` y el snapshot mostrado. Cancelar no envía el comando. Ante un conflicto se revisa la selección actualizada y se solicita una nueva confirmación.

`setLineState` conserva su contrato y acepta `expected` opcional para los productos. `saveLot` conserva `{ row }` y añade `expected` y `confirm` opcionales para aplicar esta misma protección a las transiciones del formulario clásico. La compatibilidad con llamadas anteriores no elimina las comprobaciones de autorización, pertenencia ni validación de campos.

`setProductLineStates` conserva el contrato `{ ids, estado, expected, confirm? }`, pero únicamente admite `estado: "anulada"`. Valida todos los propietarios, el snapshot completo y la confirmación antes de anular sus lotes y sincronizar estados. `setLineState` aplica la misma regla a `orden_producto`; cerrar/reabrir directamente devuelve `VALIDATION`, incluso con confirmación. Materiales y otros mantienen sus acciones actuales. `deleteLot` acepta también el snapshot `expected` del diálogo y revalida antes de borrar y sincronizar. La hoja usa `deleteLots` con IDs únicos, confirmación y snapshot obligatorio para validar y eliminar la selección completa en una transacción.

## Datos de prueba y verificación

La semilla representa productos anulados con lotes anulados conservados. No se ejecuta una migración destructiva ni se reinicia automáticamente ninguna base existente. Los reinicios solicitados para pruebas deben limitarse a bases temporales o de demostración identificadas expresamente.

Reproducción con bases temporales:

    node --import tsx --test tests/product-lot-lifecycle.test.ts tests/order-lifecycle.test.ts tests/product-lots.test.ts
    node --import tsx --test tests/order-filters.test.ts tests/material-supply.test.ts
    node scripts/verify-aria-browser.mjs tests/product-lot-lifecycle.browser.js chromium

Se comprueban conservación íntegra salvo los estados esperados, autorización, tipos inválidos, confirmación/cancelación, último lote de varios productos, selección masiva, reapertura selectiva, snapshots obsoletos, dos confirmaciones concurrentes, atomicidad y persistencia tras reiniciar el almacén. Los fixtures de creación de las suites de lotes/ciclo usan fechas futuras relativas al día de ejecución.

La prueba de navegador usa el detalle clásico y los formularios reales sobre una base temporal: anular producto conserva sus lotes y datos; agregar un lote reactiva el producto conservando los anteriores anulados; reabrir cada lote mantiene su identidad; cancelar la confirmación del último lote tampoco guarda los otros campos pendientes del formulario; confirmar aplica la anulación conjunta, y reabrir únicamente un lote reactiva el producto sin alterar sus hermanos. El runner requiere una compilación existente en `dist`; no compila ni usa la base local de trabajo. Genera el reporte `tests/evidence/aria/chromium-product-lot-lifecycle.browser.json` y capturas `chromium-lifecycle-*.png`.

Ajuste puntual de la demo (servicio detenido): `npx tsx scripts/sync-demo-product-states.ts --apply`. Crea y verifica un respaldo exacto, cambia exclusivamente los estados de producto y registra hashes y diferencias en `tests/evidence/lifecycle/demo-product-states.json`. No se incorpora al arranque ni reemplaza la base por la semilla.
