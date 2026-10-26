# Proveedores favoritos por tipo de material

Implementación del 16 de octubre de 2026. Diseño elegido: tabla agrupada con diálogo central (opción A ajustada). Los materiales del mismo tipo heredan una configuración común. No se modifican precios, cantidades, historial ni vínculos de abastecimiento.

## Modelo y recuperación

La fuente del esquema es `../Planeacion/db.md`, fuera del repositorio Git. `proveedores_favoritos` contiene `id_tipo_material` y `id_proveedor`, ambos obligatorios, con clave primaria compuesta y referencias a `tipos_materiales.id` y `proveedor.id`. Los demás campos `id_material` conservan su significado.

Commit de recuperación: `ad313845dcb9f8aec535842d93415bfb0c751919`. Copias previas en `tests/.tmp/favorites-recovery-20261016/`: `database.json` y `db.md`, excluidas de Git.

El esquema anterior se conserva también en `data/schema-before-favorites-20261016.md.bak`, fuera de la carpeta temporal de pruebas. El archivo original de datos permanece en su respaldo automático `data/database.json.favorites-…bak`. Ambos están excluidos de Git.

SHA-256 originales:

- Base: `69948ac45b5316a941e3531b026431cf661960e9d8799642575e6f0887fefafb`.
- DBML: `840c602736d403d2e628c0f8ea662b872b3efa987b63e068c52e36a035b17dd5`.

`JsonStore.open` convierte las relaciones anteriores antes de validar el nuevo esquema. Resuelve material → tipo, reúne proveedores y elimina pares repetidos; admite colecciones mixtas. Una referencia inválida o un tipo contradictorio aborta con `FAVORITES_MIGRATION` y detalles de las filas. Se valida toda la base antes de escribir una copia exacta `database.json.favorites-<fecha>-<uuid>.bak`; solo después se sustituye el archivo mediante renombrado atómico. Si falla el respaldo o la validación, no se sustituye el original. La segunda apertura no vuelve a escribir ni crea otro respaldo.

La conversión actual reúne ocho relaciones en siete pares únicos. El archivo de datos local se convirtió al reiniciarse el servidor de desarrollo; se comprobó que las otras 27 colecciones no cambiaron. No se publican datos ni respaldos del usuario en las evidencias.

Para recuperar el formato anterior, detener la aplicación, conservar aparte el estado posterior que se necesite y restaurar juntos el archivo `.bak`, el DBML respaldado y el commit de recuperación. La unión por tipo no permite reconstruir las asociaciones originales por material sin el respaldo. El portable contiene la misma migración automática.

## Guardado y selección

Solo se admiten proveedores con `Es_materiales === true`. La tabla agrupada,
su búsqueda, las opciones del editor, la selección final y el historial de
materiales aplican la misma condición. `false` y `null` quedan excluidos;
un proveedor que además sea de maquila sigue siendo elegible, incluso si su
bandera Activo es falsa. El servicio revalida la condición antes de escribir
y antes de devolver un reintento idempotente; un rechazo devuelve HTTP 422,
`VALIDATION` y `fields.id_proveedores`, sin modificar los datos.

Las relaciones heredadas cuyo proveedor perdió el rol no se muestran.
El editor conserva la selección completa original para comprobar concurrencia,
pero envía únicamente proveedores elegibles como selección final. Guardar
retira las relaciones no elegibles de ese tipo; no modifica otros tipos ni
reescribe datos al consultar.

El endpoint existente `/api/commands` incorpora `setFavoriteSuppliers`:

```json
{
  "name": "setFavoriteSuppliers",
  "payload": {
    "id_tipo_material": "identificador del tipo",
    "id_proveedores": ["identificadores de la selección final"],
    "expected_id_proveedores": ["identificadores al abrir o revisar"]
  }
}
```

Valida referencias, elimina IDs repetidos y sustituye solo el conjunto del tipo indicado dentro de una transacción. Una selección vacía elimina relaciones, no el tipo. Repetir la selección actual es idempotente. Si el conjunto original cambió, devuelve `FAVORITES_CHANGED` y la selección actual: la aplicación refresca el snapshot, conserva el borrador y requiere revisarlo antes de reintentar. `saveEntity` y `deleteEntity` ya no admiten modificaciones individuales de esta tabla. La integridad referencial protege tipos y proveedores utilizados.

En órdenes de materiales, el selector conserva las reglas de elegibilidad existentes y agrupa por **Favoritos** y **Otros proveedores**, ordenados alfabéticamente. Se utiliza la unión de favoritos de los tipos de todos los materiales del formulario. Cambiar materiales no sustituye el proveedor elegido. La sugerencia inicial de material consulta los tipos favoritos del proveedor y conserva el orden estable del catálogo. Abastecimiento sigue consultando los vínculos actuales; no se añade un formulario nuevo.

El selector de proveedor permite escribir para filtrar opciones con el mismo
autocompletado compartido de productos y materiales, conservando las secciones
de favoritos. Buscar o abandonar una consulta sin seleccionar no cambia el
proveedor ni reinicia renglones. La selección confirma el identificador; los
proveedores homónimos conservan su distinción por NIT.

## Interacción y patrones reutilizables

`GroupedRelationsTable` y `MultiRelationPicker`, en la capa compartida React Aria, implementan dos patrones:

1. **Agrupar relaciones por una entidad común:** una fila por tipo, incluidos los vacíos; conteo, despliegue accesible y lápiz cuadrado secundario. El detalle ocupa el ancho de la tabla. La búsqueda por tipo, proveedor o NIT abre los grupos coincidentes; se pueden cerrar manualmente. Sin Agregar global: los tipos se crean en su pestaña existente.
2. **Editar varias relaciones como un borrador:** tipo bloqueado, proveedores buscables con casillas y selección final independiente del filtro, con acciones para quitar y etiquetas Nuevo. Mostrar altas y bajas antes de un único Guardar. Buscar no elimina selecciones. Cancelar/Escape confirma descarte cuando hay cambios; los errores conservan el borrador. Se bloquean los controles durante el guardado y React Aria restaura el foco. En móvil las listas se apilan.

Todas las elecciones conservan IDs estables; nombre y NIT distinguen proveedores con nombres iguales. No se introducen controles nativos, listeners de foco duplicados ni bibliotecas nuevas. Otras tablas de relaciones conservan su presentación.

El detalle reutiliza `DataTable` con columnas Proveedor y NIT, y los mismos estilos compartidos que las subtablas de costos: encabezados transparentes sobre blanco de 11 px, datos de 12 px, peso 400 y padding de 8 × 10 px. Las filas miden al menos 51 px, o 57 px en móvil. El texto queda sangrado 34 px respecto al nombre del tipo, incluidos los 10 px de la celda. El NIT muestra el DV separado por guión cuando existe. No hay acciones de editar o eliminar por proveedor, ni al hacer hover; se conserva el lápiz de edición del grupo. La tabla tiene un mínimo de 360 px y participa en el único scroll horizontal exterior. El contenedor mantiene 0 px arriba y 4 px abajo, sin tarjeta adicional ni padding en la celda contenedora. Las filas del tipo conservan el padding vertical de 18 px, o 21 px desde 1600 px de ventana. El chevrón conserva su borde y tamaño de 34 px, que pasa a 40 px en móvil.

Abrir/cerrar interpola la altura con CSS Grid durante 180 ms `ease-out` y la opacidad durante 140 ms, con giro del chevrón en 180 ms. Los paneles se montan al abrir y se retiran al finalizar el cierre; no quedan filas vacías permanentes. Durante el cierre, `inert` y `aria-hidden` retiran el contenido del teclado y del árbol accesible, manteniendo el foco en el botón. Movimiento reducido desactiva la transición y retira el panel inmediatamente. Los temporizadores y fotogramas pendientes se cancelan al cambiar de estado o desmontar, por lo que los clics rápidos no duplican filas. La búsqueda conserva su apertura automática y permite cerrar manualmente cada grupo.

## Verificación reproducible

Revisión visual del **20 de octubre de 2026**: compilación correcta; **45 comprobaciones** de animación/presentación en Chromium a 375/803/1440 px y **71 comprobaciones** del recorrido de favoritos a 375/768/1024/1440 px. Incluyen alturas intermedias de apertura y cierre, altura final cero, ausencia de filas residuales y solicitudes al alternar, teclado, foco, movimiento reducido, clics rápidos, búsqueda, selección, cancelación y guardado. Las capturas compactas se inspeccionaron visualmente. Reportes: [despliegue](tests/evidence/favorites/chromium-favorites-disclosure.browser.json) y [recorrido](tests/evidence/favorites/chromium-favorites.browser.json).

    npm run build
    node scripts/verify-aria-browser.mjs tests/favorites-disclosure.browser.js chromium
    node scripts/verify-aria-browser.mjs tests/favorites.browser.js chromium

Inventario de puntos actualizados:

| Área | Sustitución |
|---|---|
| DBML, modelos, metadatos y semilla | Clave y referencia por tipo en lugar de material |
| Apertura de JsonStore | Conversión anterior a validación, respaldo y reemplazo atómico |
| Comandos del servicio | Guardado del conjunto por tipo y control de conflictos |
| Catálogos / Materiales / Favoritos | Tabla agrupada y editor de selección múltiple |
| Historial de un material | Favoritos heredados; precios históricos siguen siendo individuales |
| Crear y editar órdenes de material | Secciones de proveedores y sugerencia inicial por tipo |
| Controles compartidos | Secciones en Select, celdas de ancho completo, diálogo bloqueado durante guardado |
| Abastecimiento | Conserva consulta de órdenes y lotes; utiliza las órdenes de material existentes |

Ejecutar `npm test`, `npm run build` y `node scripts/verify-aria-browser.mjs tests/favorites.browser.js <motor>`, con `chromium`, `firefox` y `webkit`. Para Firefox en este equipo, usar la copia preparada mediante `scripts/prepare-firefox-runtime.mjs` y `PROTOTIPO_FIREFOX_EXECUTABLE`, según VERIFICACION.md.

Los recorridos usan bases temporales: tipos vacíos, búsqueda, elección múltiple, teclado, cancelación anidada, errores, conflicto, guardado vacío, prioridad y conservación de proveedor a 375/768/1024/1440 px. Las pruebas de datos cubren conversión, mezcla, referencias inválidas, copia exacta, segunda apertura y atomicidad. Ejecutar además el recorrido completo, controles, validación, filtros, detalle, scroll de facturas, persistencia y portable.

Rendimiento: `npm run benchmark:favorites` reconstruye una referencia aislada del commit de recuperación y compara ambas compilaciones con las mismas colecciones deterministas de 6.000 y 60.000 lotes, sin otras pruebas simultáneas. `ARIA_DIST` selecciona la compilación; `ARIA_EVIDENCE` separa la salida; `ARIA_BASELINE_COMMIT` registra el punto de recuperación. El runner usa una copia fija de control (`ARIA_GUARD_FILE`) y registra el hash de cada colección determinista: la actividad normal de la base abierta no invalida el ensayo ni se sobrescribe. Comparar resultados guardados con `scripts/compare-favorites.mjs`. `npx tsx scripts/measure-favorites.ts` mide además los eventos de búsqueda, selección y apertura/cierre nuevos, y 150 ciclos por tamaño de datos para comprobar memoria estable. Los límites siguen siendo el mayor entre 15 % y 20 ms por interacción, 100 ms de carga o 5 MB de memoria. CPU 4× se informa aparte.

Los resultados y capturas se conservan en `tests/evidence/favorites/`; los resultados detallados de los recorridos generales mantienen sus ubicaciones habituales.

<!-- favorites-results-start -->
## Resultados de entrega — 19 de octubre de 2026

- 151 pruebas automatizadas correctas; 598 comprobaciones del recorrido completo.
- 71 comprobaciones de favoritos en Chromium, 71 en Firefox y 71 en WebKit.
- 21 comprobaciones del portable; reinicio con las 28 colecciones conservadas.
- 39/39 presupuestos de rendimiento aprobados; 300 ciclos del editor y 630 del ensayo prolongado.
- Migración 8 → 7, respaldo exacto y 27 colecciones conservadas en la conversión. Los cambios concurrentes de la base abierta permanecen intactos.

[Informe de entrega](tests/evidence/favorites/delivery-report.json), [comparación](tests/evidence/favorites/comparison.json), [tabla desplegada](tests/evidence/favorites/groups-expanded-1440.png), [editor de escritorio](tests/evidence/favorites/editor-1440.png) y [editor móvil](tests/evidence/favorites/editor-375.png). El [paquete probado](tests/.tmp/favorites-portable.zip) contiene únicamente datos ficticios iniciales.
<!-- favorites-results-end -->
