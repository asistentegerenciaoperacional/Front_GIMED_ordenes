# Rendimiento de los filtros de órdenes

Evaluación del 9 de octubre de 2026 sobre la implementación de lectura del
prototipo. Los 13 filtros y sus 17 variantes se calculan a partir de un modelo
indexado por orden. Este documento distingue mediciones de CPU, objetivos de
interacción y recomendaciones para una aplicación compartida.

## Resultado medido

Se ejecutó [benchmark-order-filters.ts](scripts/benchmark-order-filters.ts)
contra las funciones reales buildOrderReadModel y filterCustomOrders. El
[reporte JSON](tests/evidence/order-filter-benchmark.json) conserva muestras,
medianas, p95, cantidades coincidentes, hashes de resultados y de las fuentes.

| Operación                                              | 6.000 lotes / 1.500 órdenes | 60.000 lotes / 15.000 órdenes |
| ------------------------------------------------------ | --------------------------: | ----------------------------: |
| Preparar el modelo de lectura completo, mediana / p95  |            23,16 / 25,38 ms |            261,18 / 299,20 ms |
| Seleccionar una de las 17 variantes, rango de medianas |              0,010–0,026 ms |                0,096–0,208 ms |
| Clonar el snapshot, mediana / p95                      |            15,78 / 18,02 ms |            185,21 / 248,58 ms |
| Serializar JSON compacto, mediana                      |                     7,16 ms |                      79,66 ms |
| Parsear JSON, mediana                                  |                     6,68 ms |                      73,30 ms |
| Tamaño del JSON generado                               |             5.360.126 bytes |              53.474.829 bytes |

Las **34 comparaciones de resultados**, 17 por volumen, coinciden exactamente
con una referencia independiente, incluidos los identificadores y su orden.
El modelo conserva la identidad de los documentos indexados y no modifica
los registros de entrada.

El cambio de filtro es barato después de preparar el modelo. La preparación
con 60.000 lotes supera 200 ms en este equipo; por tanto, este ensayo no
demuestra que una carga inicial o una actualización completa a ese volumen
cumpla un objetivo de interacción inferior a 200 ms.

El benchmark no mide HTTP, React, DOM, persistencia ni validación completa de
JsonStore sobre esos volúmenes. Sus números no son tiempos de respuesta de la
aplicación. Los p95 son empíricos sobre muestras pequeñas; en las operaciones
con siete muestras corresponden al máximo observado.

## Método y reproducción

Desde la carpeta prototipo, con las dependencias instaladas:

    node node_modules/tsx/dist/cli.mjs scripts/benchmark-order-filters.ts

El script escribe únicamente el reporte anterior. No abre database.json ni
inicia servicios o navegadores. Los datos proceden de
[order-performance.ts](tests/fixtures/order-performance.ts), con día de
referencia fijo 2026-10-09 y generación determinista:

- 6.000/60.000 lotes; 1.000/10.000 OC de producto, 400/4.000 OCM de material y
  100/1.000 OCM de otros; tres renglones por orden.
- Exactamente seis lotes por OC, distribuidos entre sus renglones efectivos.
  Los productos anulados conservan sus relaciones y no tienen lotes.
- Identificadores hexadecimales de 24 caracteres, todos los campos del
  modelo, catálogos, proveedores compatibles, facturas, documentos de varias
  clases y 1.500/15.000 relaciones de abastecimiento.
- Cantidades nulas, cero y positivas; fechas presentes y ausentes; estados
  cerrados y anulados; fechas límite de 7/15/30 días e instantes ISO próximos
  al cambio de día UTC, para ejercitar America/Bogota.

Equipo de esta ejecución: Intel Core i5-14500, Windows, Node 24.17.0. La
preparación del modelo, clonación y JSON usan un calentamiento y siete
muestras; cada selección usa dos calentamientos y once muestras. La
referencia usa un calentamiento y tres muestras. El reporte recoge los
valores sin redondear a los dos decimales de la tabla principal.

La medición del modelo incluye su conversión real de fechas mediante
calendarDay, agrupación de lotes, estados visibles, cantidades, totales
monetarios exactos, nombres y texto de búsqueda. No utiliza fechas ya
normalizadas por el benchmark.

La referencia aplica predicados sencillos sobre registros originales
agrupados. Tiene su propia conversión de día de Bogotá y no reutiliza los
resúmenes ni los predicados de producción. Su agrupación se mide por
separado: mediana 1,15 ms para 6.000 lotes y 23,63 ms para 60.000. No se
presenta esta referencia como una simulación de todos los recorridos
ingenuos posibles.

Las dos bases generadas pasan comprobaciones de esquema, claves y
referencias en recorridos lineales, además de compatibilidad de proveedor
de factura. Una muestra de 60 lotes pasa también validateDatabase completo.
La validación completa del servicio sobre los volúmenes grandes no forma
parte del ensayo. Los hashes verifican que la lectura no cambie los datos
y que las fuentes permanezcan iguales durante la ejecución.

## Costo por familia

N representa órdenes; R, renglones; L, lotes; D, documentos; A, vínculos.
La columna ingenua describe búsquedas repetidas en colecciones globales,
no una latencia prometida. Preparar conjuntamente el modelo cuesta
O(N+R+L+D+A), considerando el límite de siete renglones por orden. Los mapas
y conjuntos proporcionan consultas de costo promedio constante; seleccionar
cualquier variante cuesta O(N) después de esa preparación.

| Familia y relaciones consultadas                                                | Costo ingenuo aproximado | Mediana de selección: 6.000 / 60.000 lotes |
| ------------------------------------------------------------------------------- | ------------------------ | -----------------------------------------: |
| Documento de la orden: cabecera → documento escaneado                           | O(N·D)                   |               0,015–0,016 / 0,119–0,121 ms |
| Recepciones sin factura: renglones y lotes efectivos                            | O(N·(R+L))               |                           0,017 / 0,117 ms |
| Entrega solicitada vencida: cabecera y renglón abierto                          | O(N·R)                   |                           0,016 / 0,171 ms |
| Próximas entregas: fecha de cabecera                                            | O(N)                     |               0,022–0,026 / 0,190–0,208 ms |
| Sin recepciones registradas: cantidades no nulas de renglones/lotes             | O(N·(R+L))               |                           0,013 / 0,096 ms |
| Batch record vencido: estimación y recepción del BR en el lote                  | O(N·(R+L))               |                           0,019 / 0,153 ms |
| Producto recibido sin batch record: recepción física y fecha BR del mismo lote  | O(N·(R+L))               |                           0,014 / 0,151 ms |
| Inspección pendiente: fecha BR y fecha de inspección del mismo lote             | O(N·(R+L))               |                           0,014 / 0,141 ms |
| Recibidos sin inspección: recepción física y fecha de inspección del mismo lote | O(N·(R+L))               |                           0,015 / 0,129 ms |
| Confirmación pendiente: recepción física y fecha de confirmación del mismo lote | O(N·(R+L))               |                           0,016 / 0,132 ms |
| Seguimiento por cerrar: producto abierto y todos sus lotes efectivos            | O(N·R+R·L)               |                           0,013 / 0,114 ms |
| Vínculos de abastecimiento: relaciones existentes en ambas direcciones          | O(N·(R+A))               |               0,010–0,020 / 0,097–0,135 ms |
| OCM vinculadas pendientes: producto → vínculo → renglón material enlazado       | O(N·(R+A)+A·R)           |                           0,015 / 0,137 ms |

El documento vigente se obtiene del mapa documentByOrderId, también
disponible para dibujar cada fila. La condición más sencilla puede resultar
costosa si se recorre toda la colección documental por cada orden: en la
referencia, «con documento» tardó una mediana de 7,78 ms y 1098,02 ms, respectivamente, frente a 0,016 ms y 0,121 ms al consultar el resumen.

Las condiciones de lotes se calculan durante el mismo recorrido. Añadir el
segundo criterio de inspección o separar recepción física de cantidad
registrada no añade recorridos completos.

## Reglas de los indicadores

- Recepción física: cantidad mayor que cero o fecha real presente.
  Para material/otros, la fecha equivalente es fecha_entrega.
- Sin recepciones registradas: al menos un renglón efectivo y ninguna
  cantidad recibida no nula. Cero es una cantidad registrada; una fecha
  con cantidad nula permite cumplir este filtro.
- Batch record vencido: estimación anterior al día actual de Bogotá y fecha
  de entrega del BR ausente, sin exigir recepción física.
- Inspección pendiente: fecha BR presente y fecha de inspección ausente.
  Recibidos sin inspección: recepción física y fecha de inspección ausente.
  Ambos pueden coincidir; no dependen del estado de inspección.
- Producto recibido sin BR y confirmación pendiente exigen recepción física
  y ausencia de la fecha correspondiente.
- Se excluyen renglones/lotes anulados de los pendientes. Los cerrados
  pueden conservar pendientes documentales.
- Seguimiento por cerrar exige un producto en seguimiento y al menos un
  lote no anulado; todos los lotes efectivos deben estar cerrados.
- Los vínculos existentes cuentan independientemente del estado.
  OCM vinculadas pendientes comprueba solamente el estado en seguimiento
  del renglón de material efectivamente enlazado.
- Próximas entregas incluye hoy y hoy más 7, 15 o 30 días.

## Ajustes y evolución

En el prototipo, mantener los índices y resúmenes memorizados por snapshot,
reutilizarlos en búsqueda, columnas, documentos y estadísticas, y paginar
después de filtrar y ordenar con 50 órdenes por página. Las fechas vencidas
se comparan con el día actual; actualizar ese día al recuperar foco y al
cambio de fecha evita conservar resultados del día anterior.

React documenta que la memoización evita cálculos repetidos, pero no acelera
su primera ejecución. La búsqueda diferida cambia la prioridad del
renderizado; no disminuye el trabajo ni evita por sí sola solicitudes de
red. [useMemo](https://react.dev/reference/react/useMemo),
[useDeferredValue](https://react.dev/reference/react/useDeferredValue).

Para una aplicación centralizada compartida, construir la consulta paginada
en el backend y resolver relaciones en PostgreSQL. Usar EXISTS/NOT EXISTS
para existencia, ausencia y todos cerrados; aprovechar índices de renglones,
lotes y documentos y añadir el índice inverso de abastecimiento por
id_orden_material. Evaluar índices de entrega y parciales de pendientes con
distribuciones reales. No incluir el reloj actual en un predicado de índice:
indexar fechas y comparar con un límite al consultar.
[EXISTS](https://www.postgresql.org/docs/current/functions-subquery.html),
[índices parciales](https://www.postgresql.org/docs/current/indexes-partial.html),
[restricciones de CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html).

Medir la consulta con EXPLAIN ANALYZE y BUFFERS: sus costos estimados no son
milisegundos. Mantener los registros de la base y los detalles fuera de la
respuesta paginada cuando no sean necesarios.
[EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html).

Para un portable exclusivamente local, SQLite permite consultas relacionales
y actualizaciones parciales sin instalar un servidor de base de datos.
PostgreSQL conviene para centralizar datos con varios escritores. Estos
cambios de motor son una evolución posterior al prototipo.
[Criterios oficiales de SQLite](https://www.sqlite.org/whentouse.html).

No se justifican Redis, Elasticsearch, microservicios ni un trabajador de
navegador únicamente por 6.000 lotes. La decisión de añadir una caché o
materialización debe partir de mediciones de la aplicación compartida,
incluidos concurrencia, red y frecuencia de escritura.

## Medición de navegador

Se ejecutó la versión compilada de Vite en Google Chrome, en el mismo equipo
Windows con i5-14500. El [reporte](tests/evidence/order-filters-browser-report.json)
registra 52 comprobaciones correctas y 51 cambios por escenario: tres vueltas
de las 17 variantes. El reloj de rendimiento y los cuadros de animación son
nativos; únicamente Date se fija al día de referencia. La prueba separada de
medianoche utiliza Playwright Clock y queda fuera de las mediciones.

| Escenario | Cambio visible: mediana / p95 / máximo |
| --- | ---: |
| 6.000 lotes, 1.500 órdenes, escritorio 1440 × 1000 | 31,8 / 32,3 / 35,1 ms |
| 6.000 lotes, 1.500 órdenes, móvil 375 × 812 y CPU limitada 4× | 61,2 / 82,4 / 104,9 ms |
| 60.000 lotes, 15.000 órdenes, escritorio 1440 × 1000 | 30,9 / 31,6 / 31,9 ms |

El tiempo de interacción empieza al emitir el cambio del selector y termina
con los identificadores y contador esperados en el DOM y dos cuadros de
animación. Es una medida de actualización visual con datos ya preparados;
no es la duración de una consulta de base de datos ni de un clic físico.
El objetivo de **p95 inferior a 200 ms con 6.000 lotes en este equipo** se
cumplió. La limitación de CPU es una simulación en escritorio, no una prueba
en un teléfono físico. Los p95 son empíricos sobre 51 muestras por escenario.

| Fase inicial, una observación por volumen | 6.000 lotes | 60.000 lotes |
| --- | ---: | ---: |
| Respuesta HTTP de /api/state, recurso completo | 47,5 ms | 475,6 ms |
| Preparar el modelo en el navegador, User Timing orders:prepare | 23,0 ms | 249,5 ms |
| Navegación hasta resultados y dos cuadros de animación | 132,4 ms | 894,3 ms |
| Cuerpo JSON sin compresión | 5.360.126 bytes | 53.474.829 bytes |

Las fases se registran por separado y no deben sumarse: el tiempo hasta
resultados incluye las anteriores, además de parseo, columnas, React y DOM.
Estas observaciones de carga usan recursos de interfaz ya visitados y un
servicio local de datos sintéticos en memoria, que clona y serializa el
snapshot mediante el contrato actual. Excluyen lectura de disco y validación
completa de JsonStore. No demuestran un p95 de carga inicial. A 60.000 lotes,
la transferencia de todo el snapshot y su preparación siguen siendo un
costo relevante, aunque seleccionar un filtro preparado conserve su rapidez.

Los cambios de filtro no solicitaron datos ni reconstruyeron el modelo:
se comprobaron el contador HTTP y la marca de preparación. La tabla montó
50 filas y sus opciones de columna incluyeron todas las páginas. Pasaron
intersección con columnas y búsqueda, retiro selectivo del filtro, ayuda
con teclado/Escape/foco, navegación de regreso desde detalle e impresión,
actualización después de guardar un documento y recarga. Se verificaron
móvil y tablet con navegación fijada, además de medianoche de Bogotá y
recuperación del foco sin nueva descarga.

Para reproducir desde prototipo:

    npm run test:filters

El servicio de esta prueba conserva su estado exclusivamente en memoria.
El archivo del usuario mantuvo su SHA-256
`e48b8e9bb7e118cdd4531fa748299907d61907de54c8186c218361608532eba7`.
