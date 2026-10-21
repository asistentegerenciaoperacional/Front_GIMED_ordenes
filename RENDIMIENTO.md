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

## Despliegue de lotes y documentos

Medición del 14 de octubre de 2026, Windows, con Chrome 155 y Edge 155
sin interfaz visible. El detalle usa estado React local por renglón y
transiciones CSS de `grid-template-rows: 1fr ↔ 0fr` (180 ms) y opacidad
(140 ms). No solicita datos, mide alturas ni ejecuta JavaScript por
fotograma en producción. No se añade `will-change` permanente.

Animar la altura **sí requiere layout** para mover los renglones siguientes;
no es una animación exclusivamente del compositor. Al alternar un renglón,
sus hermanos no vuelven a renderizarse en React. El panel mantiene sus nodos
montados para conservar datos y controles: ocultarlo reduce su presencia
visual, pero no elimina su costo de memoria. Por eso esta solución no debe
interpretarse como virtualización de miles de lotes.

El ensayo de navegador amplifica únicamente la respuesta de su servicio
local aislado a **7 renglones y 280 lotes**, 40 por renglón, a 1440 × 900 px.
Cuatro alternancias registran 64 intervalos entre fotogramas con
`requestAnimationFrame`; las lecturas de altura pertenecen a la instrumentación
de la prueba. CDP registra los tiempos acumulados durante esas alternancias.

| Medición | Chrome 155 | Edge 155 |
| --- | ---: | ---: |
| Intervalo entre fotogramas, mediana | 16,7 ms | 16,7 ms |
| Intervalo entre fotogramas, p95 | 16,8 ms | 16,8 ms |
| Intervalo entre fotogramas, máximo | 16,9 ms | 16,8 ms |
| Layout acumulado, cuatro alternancias | 6,20 ms | 6,07 ms |
| Recalcular estilos, acumulado | 16,54 ms | 16,67 ms |
| JavaScript, acumulado | 13,31 ms | 14,85 ms |

Son muestras locales de una ejecución, sin limitación artificial de CPU;
no garantizan 60 fps en otros equipos ni con cantidades ilimitadas de lotes.
Se comprobó interpolación con alturas intermedias, altura final cero,
reapertura completa y clics rápidos. Los reportes guardan los valores sin
redondear: [Chrome](tests/evidence/order-detail/chrome-report.json) y
[Edge](tests/evidence/order-detail/msedge-report.json).

La animación de pistas está disponible en Chrome/Edge desde 107 y Safari
16; Firefox también la implementa. Referencias primarias: [Chrome 107](https://developer.chrome.com/blog/chrome-107-beta),
[WebKit Safari 16](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/)
y [MDN grid-template-rows](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/grid-template-rows).
`inert` está disponible en los navegadores actuales y forma parte de Baseline
desde abril de 2023 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/inert)).
Los paneles usan además `aria-hidden` y visibilidad diferida; al ocultarlos
se retiran del teclado y del árbol accesible. Sin interpolación de Grid, el
cambio de altura puede ser inmediato. La media query
[prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
desactiva las transiciones. Chrome y Edge se probaron; Firefox y Safari se
revisaron mediante documentación y no se ejecutaron en este entorno Windows.

Reproducción desde `prototipo`, siempre con una base temporal independiente:

    npm run test:detail
    node scripts/verify-order-detail.mjs msedge

La segunda orden usa la compilación generada por la primera. El script no
abre ni modifica `data/database.json` y elimina únicamente su directorio temporal.

## Comparación de la migración a React Aria

Referencia: commit `bd37e32c943477dd36c6936c8453160c0abf34b9`; compilación congelada en `tests/.tmp/aria-baseline/dist`. Harness: `scripts/measure-aria.ts`. La compilación final aprobó **39 de 39 límites** en Chrome **155.0.8059.80**, Windows y el mismo equipo. Evidencias completas: [referencia](tests/evidence/aria/baseline-performance.json), [migración](tests/evidence/aria/after-performance.json) y [comparación por métrica](tests/evidence/aria/comparison.json). No se atribuye a la migración el resultado de mediciones históricas anteriores.

La prueba usa producción, Chrome y fixtures idénticos de 6.000 y 60.000 lotes, sin limitar la CPU, a 1440 y 375 px. Por confirmación expresa del usuario, el ensayo adicional con CPU 4× es informativo y se reporta aparte. Cada interacción empieza en el evento real, después de preparar el control visible, y termina con el resultado pintado. Se excluye el desplazamiento automático y el envío del comando de Playwright. Se mide P95 de carga, búsqueda, selección, diálogos, filtros, ordenamiento, paginación y navegación; heap tras GC y ciclos repetidos; JavaScript descargado.

Presupuestos: incremento máximo del mayor entre 15 % y 20 ms por interacción; entre 15 % y 100 ms para carga; entre 15 % y 5 MB para memoria estable. Las mediciones se ejecutan sin recorridos simultáneos. Cualquier exceso debe resolverse antes de aceptar la entrega.

Cada escenario contiene 20 cargas, 30 muestras por interacción de búsqueda, selección, paginación, menús, ordenamiento y diálogos, y 20 navegaciones de ida/regreso. La memoria se mide tras GC, con 50 ciclos adicionales de apertura/cierre. Los MB de la tabla son decimales (1 MB = 1.000.000 bytes).

| Escenario sin limitar CPU | Carga P95 antes → después | Límite de carga | Heap estable antes → después | Límite de heap |
|---|---:|---:|---:|---:|
| 6.000 lotes, 1440 × 1000 | 126,3 → 143,8 ms | 226,3 ms | 13,00 → 17,43 MB | 18,00 MB |
| 6.000 lotes, 375 × 812 | 113,8 → 162,2 ms | 213,8 ms | 13,00 → 16,27 MB | 18,00 MB |
| 60.000 lotes, 1440 × 1000 | 637,1 → 709,2 ms | 737,1 ms | 65,22 → 40,35 MB | 75,00 MB |

Los 33 P95 de interacción cumplen individualmente; el mayor P95 final de cada escenario fue 60,7, 61,0 y 71,8 ms respectivamente. El retorno al listado con 60.000 lotes pasó de 242,6 a 46,3 ms gracias a reutilizar el modelo indexado. La colección de 50 posiciones conserva todas sus filas accesibles mientras React Aria monta solo las visibles.

El JavaScript inicial descargado pasa de **515.237 a 830.537 bytes** (+315.300 bytes, aproximadamente 61 %). El módulo principal final ocupa 241,08 kB gzip; CSS, 42,83 kB / 9,34 kB gzip. El calendario y las pantallas secundarias se cargan por demanda. Formularios principales y captura de fechas están disponibles desde el inicio para evitar la pausa de Suspense en su primera apertura. Este aumento de código está incluido en las mediciones de carga; el servicio local de la prueba entrega los recursos sin compresión.

En la última carga y sus interacciones se registraron 1, 0 y 5 tareas de más de 50 ms, frente a 0, 0 y 23 en la referencia; los máximos finales fueron 55 ms en escritorio con 6.000 y 251 ms con 60.000. Las muestras sin redondear y los seis puntos de memoria por escenario figuran en los JSON. Son mediciones locales con API sintética en memoria; no representan latencia de red o disco ni otros equipos.

Se eliminaron transiciones de hover que retenían nodos desmontados en el seguimiento global de transiciones de React Aria 3.53.1. Se conservaron sus estados visuales y las animaciones de desplegado/drawer. El snapshot recién recibido comparte cadenas iguales mediante un pool temporal; no normaliza ni modifica valores, identificadores o decimales, y no cambia la API ni el archivo del usuario. El modelo de órdenes conserva únicamente los índices necesarios y usa una caché débil por snapshot.

Reproducción de aceptación: `npm run benchmark:aria`. El script prepara la referencia aislada si falta, compila y mide ambas versiones secuencialmente, y falla si alguna métrica supera el presupuesto.

Se amplió la observación a **600 aperturas y cierres**, con 61 puntos de memoria separados por GC. El heap final fue 13.223.152 bytes en la referencia y 17.577.548 en la migración, también dentro de 5 MB de diferencia. Entre los ciclos 510 y 600 creció 22.528 bytes (0,13 %), tras el calentamiento. La captura del heap no mostró contenedores `div`, `section`, `form` o `dialog` desmontados retenidos. Esta ventana comprueba estabilización en el ensayo; no prueba una ausencia absoluta de cualquier fuga durante un tiempo ilimitado. Evidencias: [resumen](tests/evidence/aria/soak-summary.json), [referencia prolongada](tests/evidence/aria/baseline-quick-soak-performance.json) y [migración prolongada](tests/evidence/aria/after-quick-soak-performance.json).

Reproducción prolongada: ejecutar ambas fases con `--quick --soak --cycles=600`; para la fase final establecer `ARIA_HEAP_SNAPSHOT=1` y ejecutar después `node scripts/summarize-aria-soak.mjs`. `--quick` reduce las muestras de interacción de este diagnóstico adicional; los resultados de aceptación anteriores usan las muestras completas. La captura cruda queda ignorada en `tests/.tmp`.

### Ensayo adicional de estrés, CPU 4×

Por confirmación expresa del usuario, este ensayo queda **fuera del criterio de aceptación**. Se ejecutó por separado con 6.000 lotes y 375 × 812 px. La carga P95 pasó de 418,9 a 506,1 ms y el heap estable de 13,37 a 16,29 MB. Ocho de las once interacciones superarían los márgenes si se aplicaran también a esta simulación: por ejemplo, abrir el formulario pasó de 74,0 a 152,2 ms y abrir el filtro de 44,5 a 109,2 ms. El retorno al listado mejoró de 210,4 a 107,8 ms. Este resultado no permite afirmar que las mismas cotas se cumplan en equipos mucho más lentos.

Evidencias: [referencia CPU 4×](tests/evidence/aria/baseline-stress-performance.json) y [migración CPU 4×](tests/evidence/aria/after-stress-performance.json). Reproducción: `npx tsx scripts/measure-aria.ts baseline --scenario=stress` y `npx tsx scripts/measure-aria.ts after --scenario=stress`.

Los desplegados nuevos usan la altura calculada por React Aria mediante `--disclosure-panel-height` y una transición de 180 ms, con opacidad de 140 ms. La librería controla medición, apertura y ocultación; la aplicación no añade un bucle de medición por fotograma. Se conserva contenido montado y se desactiva la animación con movimiento reducido.

<!-- favorites-results-start -->
## Favoritos por tipo de material — cierre del 19 de octubre de 2026

La comparación de producción contra el commit de recuperación aprueba **39 de 39 límites**, con el mismo Chrome, equipo, colecciones deterministas y CPU sin limitación. Se conservaron los hashes de los datos de cada escenario y se midieron eventos reales hasta el resultado visible, excluyendo la automatización. La copia fija de control evita interferir con la base abierta del usuario.

| Escenario | Carga P95 anterior | Carga P95 actual | Límite |
|---|---|---|---|
| 6000 lotes / 1440px | 149,5 ms | 154,7 ms | 249,5 ms |
| 6000 lotes / 375px | 145,7 ms | 141,8 ms | 245,7 ms |
| 60000 lotes / 1440px | 797,4 ms | 744,1 ms | 917 ms |

Todas las interacciones y la memoria estable cumplen el mayor entre 15 % y 20 ms, 100 ms o 5 MB según la métrica. La descarga de JavaScript, tareas largas y muestras de memoria figuran en la [comparación](tests/evidence/favorites/comparison.json).

El nuevo editor se verifica además por separado:

| Lotes | Ciclos | Apertura P95 | Búsqueda P95 | Crecimiento tras GC |
|---|---|---|---|---|
| 6.000 | 150 | 45,3 ms | 41,7 ms | 0,4 MB |
| 60.000 | 150 | 45,9 ms | 41,2 ms | 0,4 MB |

Ensayo prolongado: 630 ciclos adicionales, con muestras de heap y nodos DOM tras GC. Las muestras de los últimos 120 ciclos se mantuvieron en 371 nodos y el recuento final descendió a 222; entre los ciclos 480 y 600 el heap varió 16,8 KB. Se comprobó automáticamente que no aumentaran los nodos retenidos y que esa variación final quedara por debajo de 250 KB. [Resultados del editor](tests/evidence/favorites/component-performance.json) y [secuencia prolongada](tests/evidence/favorites/component-soak-performance.json). La tabla mantiene sus colecciones y callbacks mientras se abre o cierra el editor.

El [ensayo CPU 4×](tests/evidence/favorites/after-stress-performance.json) es informativo y no modifica los criterios de aceptación acordados. Reproducir con <code>npm run benchmark:favorites</code> y <code>npx tsx scripts/measure-favorites.ts</code>; añadir <code>--soak</code> para la secuencia prolongada.
<!-- favorites-results-end -->


## Códigos de barras · 20 de octubre de 2026

Referencia: commit de recuperación `068cae7a43f13fd2e3aa0323998eb2faba259087`, compilaciones de producción y Chrome 155.0.8059.85. Ambas versiones usan las mismas colecciones deterministas, verificadas por hash, de 6.000 y 60.000 lotes. Los eventos se cronometran dentro del navegador hasta el resultado visible, fuera del tiempo de automatización.

Las **39 comparaciones cumplen** los límites acordados en equipo actual: P95 interacción +máx(15 %,20 ms), carga +máx(15 %,100 ms), memoria estable +máx(15 %,5 MB).

| Caso | Carga P95 antes → después | Heap estable antes → después |
| --- | --- | --- |
| 6.000 lotes / 1440 px | 162,5 → 145,7 ms | 17.530.568 → 17.592.224 bytes |
| 6.000 lotes / 375 px | 143,8 → 150,4 ms | 16.397.808 → 16.424.436 bytes |
| 60.000 lotes / 1440 px, par consecutivo | 1.185,0 → 707,0 ms | 41.120.036 → 39.968.296 bytes |

La primera ejecución de 60.000 lotes mostró cuatro interacciones fuera del margen. Se conservaron sus informes `*-initial.json` y se repitió ese caso consecutivamente con las dos compilaciones, sin cambios de código ni de límites; la diferencia no se reprodujo. Estos valores son mediciones de la ejecución, no una atribución causal de mejora al cambio de códigos.

Reproducción: `npm run build`, `node scripts/benchmark-barcodes.mjs`. El caso grande también puede contrastarse con `node scripts/recheck-barcodes-large.mjs`, conservando el primer informe. Compilación de referencia en `tests/.tmp/barcodes-baseline/dist`; guard de datos respaldado, nunca base usada como fixture. [Comparación](tests/evidence/barcodes/comparison.json), [informe completo](tests/evidence/barcodes/delivery-report.json).

Estas mediciones son una referencia histórica previa a la simplificación de la vista de códigos. No se han vuelto a medir después de retirarla; se repiten compilación y recorridos funcionales.
