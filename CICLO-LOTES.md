# Estados de productos y lotes

## Anulación y reapertura conservan los datos

Anular un producto de una OC autorizada cambia su renglón a `anulada` y todos sus lotes a `anulado`. Se conservan los identificadores, el orden de los lotes, factura, cantidades, fechas, Batch record, inspección, ubicación y vínculos de abastecimiento.

Reabrir un producto anulado pone todos sus lotes en `en_seguimiento`, incluidos los que estaban cerrados o anulados antes de la anulación conjunta. No se crea ni reemplaza ningún lote. Reabrir solo un lote o una selección de lotes reactiva también sus renglones, conservando el estado de los demás lotes. El cierre del seguimiento del producto sigue siendo manual y mantiene la advertencia por tolerancia; cerrar todos sus lotes no lo cierra automáticamente.

Anular el último lote no anulado de un renglón también anula ese producto. Antes de aplicar la operación se presenta una confirmación con los productos afectados. El formulario clásico de lote y la hoja alternativa utilizan el mismo motor del servidor. Los lotes o productos anulados deben reabrirse antes de cerrar un lote.

Eliminar físicamente un lote sigue siendo una acción distinta, destructiva y confirmada. Si no quedan lotes, o los restantes están todos anulados, su renglón queda anulado. La eliminación no borra las facturas ni sus documentos.

## Comandos y concurrencia

`setProductLotStates` acepta `{ ids, estado, expected?, confirm? }`. `ids` debe contener identificadores de lote distintos; `estado` admite `en_seguimiento`, `cerrado` o `anulado`. El servidor comprueba autorización, identidad, datos del lote y el conjunto afectado en una única transacción. Cualquier rechazo conserva archivo y memoria completos.

El helper compartido `productLotLifecycleSnapshot(db, lineIds)` genera `expected`: una lista de productos `{ id, estado, cantidad_solicitada, margen_tolerancia, lotes: [{ id, estado, cantidad_recibida }] }`, ordenada por ID. Incluye todos los lotes de cada renglón afectado, aunque algunos no estén seleccionados. Si se envía un snapshot distinto del actual, se devuelve `LOT_STATE_CHANGED` sin guardar. Así una confirmación no se puede reutilizar después de que se agregue/elimine un lote, cambie un estado involucrado, se modifique una cantidad que afecte la desviación o cambie el margen de cierre.

Si la anulación alcanza el último lote no anulado de uno o varios productos, el servidor devuelve `CONFIRMATION` con `details.expected` y `details.products` (`id`, `posicion`, `no_orden`, `producto`). Para confirmar el comando masivo se reenvían ambos `confirm: true` y ese snapshot. Cancelar no envía otro comando. Ante un conflicto se revisa la selección actualizada y se solicita una nueva confirmación.

`setLineState` conserva su contrato y acepta `expected` opcional para los productos. `saveLot` conserva `{ row }` y añade `expected` y `confirm` opcionales para aplicar esta misma protección a las transiciones del formulario clásico. La compatibilidad con llamadas anteriores no elimina las comprobaciones de autorización, pertenencia ni validación de campos.

`setProductLineStates` realiza la acción sobre varios renglones en una única transacción: `{ ids, estado, expected, confirm? }`, con estados `en_seguimiento`, `cerrada` o `anulada`. El snapshot completo es obligatorio. Antes de modificar registros valida todos los productos y agrega las confirmaciones: `CONFIRMATION` para anulación, con `details.products`, y `TOLERANCE` para cierre fuera del margen, con `details.deviations`. Ambos incluyen `details.expected`. Comparte el motor de aplicación con `setLineState`; no realiza escrituras ni solicitudes HTTP por separado para cada renglón.

## Datos de prueba y verificación

La semilla representa productos anulados con lotes anulados conservados. No se ejecuta una migración destructiva ni se reinicia automáticamente ninguna base existente. Los reinicios solicitados para pruebas deben limitarse a bases temporales o de demostración identificadas expresamente.

Reproducción con bases temporales:

    node --import tsx --test tests/product-lot-lifecycle.test.ts tests/order-lifecycle.test.ts tests/product-lots.test.ts
    node --import tsx --test tests/order-filters.test.ts tests/material-supply.test.ts
    node scripts/verify-aria-browser.mjs tests/product-lot-lifecycle.browser.js chromium

Se comprueban conservación íntegra salvo los estados esperados, autorización, tipos inválidos, confirmación/cancelación, último lote de varios productos, selección masiva, reapertura selectiva, snapshots obsoletos, dos confirmaciones concurrentes, atomicidad y persistencia tras reiniciar el almacén. Los fixtures de creación de las suites de lotes/ciclo usan fechas futuras relativas al día de ejecución.

La prueba de navegador usa el detalle clásico y los formularios reales sobre una base temporal: anular producto conserva sus lotes y datos; reabrirlos abre todos; cancelar la confirmación del último lote tampoco guarda los otros campos pendientes del formulario; confirmar aplica la anulación conjunta, y reabrir únicamente un lote reactiva el producto sin alterar sus hermanos. El runner requiere una compilación existente en `dist`; no compila ni usa la base local de trabajo. Genera el reporte `tests/evidence/aria/chromium-product-lot-lifecycle.browser.json` y capturas `chromium-lifecycle-*.png`.
