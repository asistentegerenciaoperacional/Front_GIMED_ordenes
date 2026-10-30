# Cotizaciones de materiales

Vigente desde el 30 de octubre de 2026. Disponible en **Abastecimiento → Materiales pendientes**, desde el banner de selección. El transporte es simulado: no llama a Gmail ni a otros servicios de correo.

## Selección y cantidades

La selección admite más de siete materiales distintos; solo **Elaborar OCM** se deshabilita al superar siete. Su límite sigue validándose en el backend. Cotizar no crea OCM ni vínculos, no cubre necesidades y conserva la selección al cerrar o enviar. Se mantienen los filtros, el rango y la elegibilidad del recorrido de pendientes.

Se agrupan los orígenes por ID de material, sumando únicamente los renglones seleccionados. El adicional inicial es 10 %, editable de 5 % a 10 %; la cantidad sugerida se redondea hacia arriba una sola vez, con aritmética exacta. La cantidad final es editable. Cambiar el porcentaje recalcula desde la base. La entrega propuesta es el menor día de entrega de sus OC, en Bogotá. Los nombres repetidos conservan sus identidades y códigos.

## Proveedores y contactos

Los favoritos del tipo se precargan. Se puede agregar o quitar cualquier proveedor con `Es_materiales=true`; esta condición también se valida al previsualizar y enviar. El proveedor no necesita ser favorito y no se altera el catálogo de favoritos por cotizar.

El evento **Cotización de materiales** usa reglas de contactos de proveedor y destinatario principal. Se filtra por cargo/área con la normalización compartida, solo direcciones válidas; la misma dirección no genera varias sugerencias. Una coincidencia precarga el contacto; varias obligan a elegir. Sin reglas o sin coincidencias se puede elegir otro contacto del proveedor o escribir un correo manual. No se añade ese correo al directorio. La semilla nueva incluye la regla Compras/Proveedor/Para; las bases existentes conservan exactamente sus reglas.

Cada proveedor tiene un solo destinatario en el lote. La sección común **Destinatario único por proveedor** modifica todas sus apariciones. Cada proveedor incluido exige una dirección válida y cada material al menos un proveedor destinatario; se puede quitar un favorito sin contacto y elegir otro. No se omiten proveedores incompletos. Cada pareja material/proveedor produce un mensaje separado con un único Para, sin CC, CCO ni adjuntos. Un proveedor incluido en varios materiales recibe varios mensajes.

## Plantilla

**Configuración → Plantilla de cotización** guarda asunto y cuerpo comunes. Si aún no existe registro se muestra la plantilla predeterminada. Cada diálogo copia esa plantilla y permite ajustarla solo para el lote, sin sobrescribir la global. El guardado global comprueba la versión esperada para no perder cambios concurrentes.

Variables: `{{proveedor}}`, `{{material}}`, `{{codigo_maia}}`, `{{tipo_material}}`, `{{cantidad}}` y `{{fecha_entrega}}`. Se resuelven por mensaje; las fechas usan `dd/mm/aaaa` y el código ausente se muestra como «Sin código». La sustitución es de una sola pasada y los textos se presentan como texto, sin ejecutar HTML o expresiones. Se rechazan textos vacíos, variables desconocidas, llaves incompletas y saltos de línea en el asunto. El asunto admite hasta 300 caracteres y el cuerpo hasta 20.000.

## Contrato y concurrencia

`POST /api/material-quotation-preview` recibe:

```ts
{
  demanda: { desde, hasta, fuentes }, // MaterialDemand, sin límite de siete grupos
  materiales: [{ id_material, adicional_pct, cantidad, proveedor_ids: string[] }],
  destinatarios: [{ id_proveedor, id_contacto: string | null, correo: string }],
  plantilla: { asunto, cuerpo }
}
```

Si `id_contacto` está presente, el servidor resuelve su dirección y comprueba que pertenezca al proveedor. Si es `null`, usa el correo manual. Se rechazan orígenes, materiales, proveedores y destinatarios duplicados o ajenos al borrador. Los materiales deben coincidir exactamente con los de los orígenes. La respuesta incluye `materiales` consolidados, `messages` resueltos, `issues` por campo y `revision`. Las necesidades y las cantidades originales se comprueban frente al snapshot vigente.

`sendMaterialQuotations` recibe `{ borrador, expected_revision }`. Revalida todo antes de llamar al simulador y exige la revisión exacta de los mensajes actuales. Un cambio devuelve `QUOTATION_CHANGED` sin registrar envíos. **Actualizar datos** reconcilia solo los orígenes elegidos, retira los no disponibles y los proveedores sin rol, conserva destinatarios, plantilla y cantidades manuales compatibles, y recalcula las cantidades que seguían recomendadas. Se exige revisar otra vez.

Todos los registros del lote se guardan mediante una transacción del JsonStore. Fallar la simulación revierte registros parciales. Se reutilizan transporte y persistencia del correo existente, con asunto opcional para compatibilidad. Durante el envío se bloquean doble confirmación, X, Cancelar, Escape y cierre exterior. El evento se muestra en configuración e historial; su composición se realiza exclusivamente desde pendientes. El historial conserva los datos básicos existentes de mensaje y destinatario, sin almacenar cuerpo, asunto personalizado ni un expediente de cotización.

`saveQuotationTemplate` recibe `{ plantilla: { asunto, cuerpo }, expected: { asunto, cuerpo } }`; un conflicto devuelve `QUOTATION_TEMPLATE_CHANGED`. La tabla provisional `plantilla_correo` usa `tipo_evento` como clave y guarda únicamente `cotizacion_materiales`, asunto y cuerpo. El generador añade la tabla y el evento sin escribir `Planeacion/db.md`. Las bases anteriores reciben `plantilla_correo: []`, previa validación y respaldo exacto `database.json.quotations-*.bak`; no se modifican las otras colecciones. Los reingresos no repiten la migración.

## Verificación

Pruebas de dominio y persistencia en `tests/material-quotation.test.ts`; recorrido completo, teclado y vistas de 375/1440 px en `tests/material-quotation.browser.js`. Regresión de OCM en `tests/material-demand.browser.js`.

```powershell
npm test
npm run build
node scripts/verify-aria-browser.mjs tests/material-quotation.browser.js chromium
node scripts/verify-aria-browser.mjs tests/material-quotation.browser.js webkit
node scripts/verify-aria-browser.mjs tests/material-demand.browser.js chromium
```
