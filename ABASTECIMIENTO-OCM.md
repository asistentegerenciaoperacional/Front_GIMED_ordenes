# OCM consolidadas desde materiales pendientes

Vigente desde el 26 de octubre de 2026. Primera iteración sobre **1.25 estable (`2011bb9`)**, sin commit de respaldo ni migración de datos. La vista elegida es una tabla plana dentro de **Abastecimiento → Materiales pendientes**, entre Vínculos entre órdenes y Lotes y certificados.

## Necesidades y consulta

Desde y Hasta comienzan vacíos y la tabla muestra por defecto todos los vínculos pendientes. Deja ambas fechas vacías para conservar esa vista; si indicas un rango, **Consultar** aplica ambos extremos inclusivos a la entrega solicitada de la cabecera de la OC, según el día calendario de Bogotá. No consulta por elaboración ni por fechas de lotes. Un rango incompleto, con fechas inexistentes o invertidas impide la consulta.

Solo participan OC autorizadas y sus renglones de producto en seguimiento. Los materiales específicos proceden de las asociaciones vigentes del catálogo. Corrugado, cinta y sticker corresponden a compras de inventario y se excluyen de este recorrido.

Una necesidad se identifica por la pareja **renglón de producto / material**. Se excluye cuando existe una asociación con un renglón de material no anulado. Una OCM todavía sin autorizar y un renglón de material cerrado también cuentan como compra existente. Anular el material permite preparar otra compra y conserva el vínculo histórico. Si existe otra compra vigente de la misma pareja, la necesidad sigue cubierta.

La tabla muestra selección, material/MAIA, OC, producto/maquilador, cantidad de producto y entrega solicitada. Usa búsqueda por OC, producto, maquilador, material o MAIA; filtros y ordenamiento compartidos; 50 filas por página. Fechas se muestran en `dd/mm/aaaa` sin volver a interpretar el día como medianoche UTC.

Los parámetros propios tienen el prefijo `pendientes_`: `desde`, `hasta`, `q`, `filtros`, `ordenar`, `direccion` y `pagina`. Conviven con los de las otras vistas de Abastecimiento. Búsqueda, filtros, ordenamiento y paginación conservan la selección, incluso cuando ocultan sus filas. Cambiar o quitar el rango pide confirmar el descarte; cancelar conserva el rango aplicado y la selección. Al preparar una OCM sin rango, se deriva el intervalo guardado de las fechas de entrega de sus orígenes seleccionados.

## Selección, consolidación y cantidades

La selección admite más de siete materiales distintos para **Cotizar materiales**, identificados por ID; nombres repetidos conservan su identidad y código. **Elaborar OCM** queda deshabilitado al superar siete, con una explicación visible. La creación de OCM conserva el límite de siete materiales también en el servicio. El resumen permanece visible, cuenta materiales, vínculos y OC, y permite quitar todos los orígenes de un material. La cotización reutiliza la consolidación sin aplicar el límite propio de la orden; [plantilla, destinatarios y envío simulado](COTIZACIONES-MATERIALES.md).

**Elaborar OCM** abre el mismo `OrderForm` de las órdenes habituales. Tipo Material, materiales y orígenes quedan bloqueados; cambiar el proveedor conserva el borrador. Para cambiar materiales se vuelve a la selección. Cancelar o Escape conservan la selección y piden confirmar si se editaron campos del formulario.

Cada material ocupa un solo renglón. Su base suma las cantidades solicitadas de los renglones de producto seleccionados; dos solicitudes del mismo producto siguen siendo dos orígenes distintos. La posición del material corresponde a su primera selección.

    cantidad sugerida = ceil(suma de cantidades de origen × (1 + adicional / 100))

El adicional inicial es **10 %**, editable entre **5 % y 10 %**, independiente por material. Cambiarlo recalcula desde la base original. La cantidad final también es editable: un ajuste manual se mantiene hasta otro cambio del porcentaje. Se redondea una sola vez, después de sumar los orígenes, con aritmética exacta y comprobación de enteros seguros.

La regla del adicional procede de la [fuente original de lógica de negocio](../Planeacion/Extracción%20y%20definición%20de%20la%20lógica%20de%20negocio.html), que especifica aproximadamente 5 % o 10 % adicionales y distingue la compra de materiales genéricos para inventario. Su incorporación al requisito vigente y el intervalo editable corresponden a esta iteración.

La revisión muestra cantidades finales, precio, subtotal y OC de origen. Se conservan las reglas de proveedor, importes exactos, entrega obligatoria y consecutivo compartido de materiales/otros. La OCM nace sin autorización. **Solo se guardan la cantidad final y los vínculos**: base y porcentaje son datos del borrador de creación. Las relaciones no reparten cantidades entre OC.

## Contrato y transacción

La entrega solicitada de la OCM debe ser **estrictamente anterior** al menor
día de entrega solicitada de sus OC asociadas, según Bogotá. La igualdad
también es inválida; solo cuentan los orígenes seleccionados. Se conserva
además el límite inferior del día real de creación. La revisión comparte la
regla con el servicio, que comprueba las fechas de origen vigentes antes de
reservar el consecutivo o guardar datos. El rechazo responde HTTP 422,
`VALIDATION` y `fields.fecha_solicitada_entrega`, muestra el banner y vuelve
a la captura sin perder el borrador. Corregir a otra fecha inválida conserva
el error; corregir a una fecha válida lo retira. Las compras sin asociaciones
no tienen este límite superior y las fuentes obsoletas conservan el tratamiento
`SUPPLY_CHANGED`.

`createOrder` conserva su contrato y respuesta `{ orderId }`. Admite opcionalmente `abastecimiento`:

```ts
{
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD, inclusivo
  fuentes: Array<{
    id_orden_producto: string;
    id_material: string;
    cantidad_solicitada: number; // cantidad original del renglón de producto
    fecha_solicitada_entrega: string; // valor original completo de la cabecera
  }>;
}
```

El campo solo se admite al crear una OCM de material. Las fuentes no se repiten y deben corresponder exactamente a los materiales distintos de `lines`. El servicio comprueba de nuevo autorización, seguimiento, asociación de catálogo, rango, cantidad/fecha originales y ausencia de una compra vigente. La consulta usa índices por snapshot y no recorre lotes.

Cabecera, consecutivo, renglones y relaciones `abastecimiento_material` se guardan en una transacción de `JsonStore`. Un error revierte todo. Dos solicitudes de la misma necesidad no generan dos compras: la segunda recibe `SUPPLY_CHANGED` con el contrato de error habitual del servicio.

Ante `SUPPLY_CHANGED`, la aplicación refresca el snapshot, conserva el borrador y bloquea la creación. **Revisar selección** vuelve a las necesidades vigentes; retira orígenes que dejaron de estar pendientes y actualiza los que cambiaron, antes de una nueva preparación. Un error temporal ordinario conserva el formulario y permite reintentar. Tras guardar se abre el detalle de la OCM, y los vínculos se consultan en ambos sentidos con las vistas existentes.

## Vinculación manual de una OCM existente — 27 de octubre de 2026

El detalle de la OC presenta **Vincular OCM existente** por renglón de producto,
dentro de Abastecimiento. Se parte de un material pendiente y se busca un renglón
de OCM compatible. No se crea una compra, no se reservan cantidades y no cambian
precios, recepciones ni consecutivos. La relación se refleja en ambos detalles y
en Vínculos entre órdenes.

La OC debe estar autorizada y el producto en seguimiento. El material debe seguir
en su configuración general actual y no tener una OCM no anulada que lo cubra.
Corrugado, cinta y sticker conservan su flujo de inventario. La OCM candidata debe
ser de material y su renglón estar en seguimiento; puede estar sin autorizar o
abastecer otras OC. Identificar materiales y renglones por ID, aunque tengan el
mismo nombre. Cerradas y anuladas no son candidatas nuevas; una asociación cerrada
existente sigue cubriendo la necesidad. Las anuladas conservan historial y permiten
reemplazo.

La vinculación manual permite entregas iguales o posteriores a la OC con un aviso
no bloqueante en el diálogo. **La excepción termina al vincular**: cualquier edición
posterior de la OCM requiere una entrega estrictamente anterior al menor día de
entrega de todas sus OC asociadas, aunque solo se cambie el precio. Creación desde
pendientes conserva su regla estricta. No se agrega ninguna excepción al esquema.

Contrato `linkMaterialSupply`:

```ts
{
  id_orden_producto: string;
  id_orden_material: string;
  expected: {
    id_producto: string;
    id_material: string;
    oc: { id_orden: string; fecha_solicitada_entrega: string | null; cantidad_solicitada: number };
    ocm: { id_orden: string; fecha_solicitada_entrega: string | null; cantidad_solicitada: number; id_proveedor: string };
  };
}
```

El servicio valida la selección esperada, la necesidad y el candidato en la misma
transacción que inserta `abastecimiento_material`. Un reintento o un competidor que
cubra el mismo material produce `SUPPLY_CHANGED`, sin inserciones parciales.
El diálogo conserva el borrador, refresca el snapshot y exige revisar las opciones.
Revisar no sustituye automáticamente los IDs seleccionados; si ya no están
disponibles, el usuario debe elegir una combinación válida.

La integridad compara cobertura antes/después para impedir nuevas duplicidades al
reactivar una OCM anulada o cambiar su material. No modifica ni invalida al abrir
los duplicados históricos o vínculos fuera del catálogo actual. No hay acción de
desvincular ni de reemplazar una compra vigente en este flujo.

Recuperación, hashes, capturas y resultados: [VINCULACION-OCM.md](VINCULACION-OCM.md).

## Verificación reproducible

```powershell
npm test
npm run test:ocm
npm run benchmark:ocm
```

Las pruebas funcionales usan bases temporales. El runner de tres motores prepara en Windows la copia temporal de Firefox con la solución SideBySide ya documentada; conserva intacta la instalación del usuario. Los ensayos de rendimiento sirven fixtures sintéticos en memoria y verifican el hash de `data/database.json`.

Evidencias y capturas: `tests/evidence/ocm/`. Los resultados finales se registran en [Verificación](VERIFICACION.md) y [Rendimiento](RENDIMIENTO.md).

`node scripts/report-material-demand.mjs` reúne los resultados comprobados,
valida los tres motores, los presupuestos y el hash de los datos, y genera
[el informe de entrega](tests/evidence/ocm/delivery-report.json) y
[su resumen](tests/evidence/ocm/summary.md).
