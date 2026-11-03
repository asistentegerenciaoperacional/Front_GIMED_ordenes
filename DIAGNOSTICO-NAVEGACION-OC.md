# Diagnóstico de navegación con flechas — 3 de noviembre de 2026

El problema se reproduce en Chromium con el estado actual de `codex/hoja-oc-productos`: HEAD `4d35d37` más los cambios locales existentes. Este trabajo añade pruebas e informe; conserva la implementación y los cambios pendientes. La compilación de producción se generó desde ese mismo estado antes de medir.

La selección dispara demasiado trabajo de React por tecla. A una frecuencia mayor que la capacidad de renderizado, se acumulan eventos y la hoja continúa desplazándose después de terminar la entrada. También se crean muchos objetos temporales, con picos de memoria y trabajo de recolección de basura. En estos ensayos no aparece una retención acumulativa de heap JS, nodos o listeners después de GC.

## Método y límites

- Chrome/Chromium 156.0.8078.80, ventana de 1440 × 900, base temporal con más de 5.000 lotes y las 24 columnas. Una sola ejecución de navegador a la vez para evitar competencia entre pruebas de CPU.
- Se midieron producción (`dist`) y desarrollo (Vite/StrictMode), sobre la aplicación real. No se escribieron datos de compras. Las preferencias cambiadas pertenecen al navegador temporal.
- Las flechas se enviaron mediante `Input.dispatchKeyEvent` de CDP: eventos `isTrusted`, timestamp de envío y repetición de tecla. El emisor espera el intervalo de 8, 30 o 60 teclas/s **sin esperar a que termine el render de cada tecla**. Así se reproduce una cola de entrada; el bucle anterior con `await page.keyboard.press(...)` por tecla se limitaba por la velocidad de respuesta de la propia aplicación.
- Se registraron retraso al recibir el evento, tiempo adicional para vaciar la cola después del último envío, intervalos entre frames, tareas largas, commits React, posición final, heap JS y contadores de DOM/listeners. Se forzó GC entre escenarios para diferenciar memoria temporal y retención.
- El perfil de CPU se activó exclusivamente durante la ráfaga vertical. El tiempo inclusivo de funciones recursivas se cuenta una sola vez por muestra, no se suma repetidamente a lo largo de la misma pila.
- Se ejecutó además un control independiente sin perfilador, observadores de frames/DOM ni hook de commits añadido. Vite conserva su hook habitual de React Refresh en desarrollo. Este control reproduce el problema y compara la misma base con una sola fila visible.

Las cifras son muestras locales instrumentadas, no garantías de tiempo para otros equipos. El heap JS no representa toda la memoria del proceso, GPU o sistema operativo. La ausencia de retención en esta prueba no descarta otras fugas en otros recorridos.

## Resultados de producción

| Escenario | Entrada | Cola restante tras el último envío | Retraso p95 al recibir la tecla |
| --- | --- | ---: | ---: |
| Navegación vertical pausada | 24 flechas a 8/s | 76 ms | 55,9 ms |
| Horizontal rápida | 144 flechas a 60/s | 7.703 ms | 7.283,8 ms |
| Vertical rápida, con perfil CPU | 180 flechas a 60/s | 10.415 ms | 9.884,5 ms |
| Insistir en el borde izquierdo | 120 flechas a 60/s | 6.416 ms | 6.121,9 ms |
| Vertical sostenida, primera tanda | 150 flechas a 30/s | 5.384 ms | 5.067,6 ms |
| Vertical sostenida, segunda tanda | 150 flechas a 30/s | 5.388 ms | 5.082,3 ms |
| Vertical sostenida, tercera tanda | 150 flechas a 30/s | 5.992 ms | 5.646,7 ms |
| Extender rango con Shift | 90 flechas a 30/s | 3.654 ms | 3.439,2 ms |

En las ráfagas la aplicación procesa aproximadamente **13–14,5 teclas/s**, por debajo de las 30–60 enviadas. La posición final coincide con todos los movimientos: en estos ensayos las teclas se retrasan, no se pierden. En la ráfaga vertical se observó un intervalo de hasta unos 10 s entre frames; eso explica los saltos visuales aunque internamente se hayan procesado estados intermedios.

### Control sin perfilador ni hook añadido

| Entorno y celdas montadas | Entrada horizontal | Cola restante | Retraso p95 |
| --- | --- | ---: | ---: |
| Producción, 31 filas × 24 columnas = 744 celdas | 144 a 60/s | 7.510 ms | 7.092 ms |
| Producción, una fila × 24 columnas | 144 a 60/s | 9 ms | 2 ms |
| Desarrollo, 744 celdas | 144 a 60/s | 36.286 ms | 34.332 ms |
| Desarrollo, 24 celdas | 144 a 60/s | 2.792 ms | 2.665 ms |

La base de 5.000 lotes no cambia entre los dos tamaños de ventana: se aplica una búsqueda a un lote. El fuerte descenso al reducir las celdas montadas y la repetición sin instrumentación de commits confirman que el coste principal está en actualizar la interfaz, no en un fallo del perfilador ni en cargar datos del servicio.

El control vertical de producción, también sin perfilador, dejó **9.095 ms** de cola para 180 flechas a 60/s. El de desarrollo dejó **20.133 ms** para 80 flechas a 60/s. En desarrollo se usaron ráfagas verticales más cortas: el primer intento de 180 flechas superó la guarda de 45 s de la prueba. No se deben comparar directamente las duraciones de esas ráfagas con diferente cantidad de teclas.

## Memoria: presión temporal, sin fuga acumulativa observada

En producción el heap JS utilizado alcanzó un pico muestreado de **215,6 MiB**. Después de GC, las tres tandas verticales sucesivas quedaron en **30,49 → 30,51 → 30,53 MiB**; el final del recorrido fue 31,03 MiB frente a 38,87 MiB iniciales. Los nodos vuelven a 2.438 y los listeners a 300 en las tres tandas. Permanecen montadas 31 filas/744 celdas, no las 5.000 filas.

Durante el trabajo aparecen nodos transitorios separados del DOM visible y objetos de React/colección que son recuperados al hacer GC. El perfil vertical de producción atribuye aproximadamente **1.467 ms** al recolector de basura dentro de una muestra de 13.816 ms. Es un coste relevante que acompaña al exceso de reconstrucciones.

En desarrollo el pico muestreado fue **387,3 MiB**. El heap utilizado final volvió a **67,28 MiB**, frente a 67,43 MiB iniciales. En las tandas sucesivas quedó alrededor de 63–67 MiB; nodos/listeners regresan a 2.444/303. El desarrollo añade StrictMode, depuración de props y creación/validación de elementos; el perfil muestra `addObjectDiffToProperties`, `createElement`, `ReactElement`, trabajo de Table/React Aria y GC.

## Causas localizadas en el código

1. **El cursor invalida la hoja entera.** `ProductSheetGrid.navigate` llama `onRange` por cada flecha; ese callback es `setRange` en `ProductOrderSheet`. Se vuelven a crear las herramientas, encabezados, descriptores de filas/celdas y callbacks de render aunque únicamente se mueva el cursor.
2. **La colección pierde estabilidad.** El `memo` de `DataTable` solo evita renderizar cuando recibe un `cacheKey` estable; la hoja no lo proporciona. Cada nuevo árbol de `TableRows` produce nuevos objetos `items` y celdas en el adaptador. Esto obliga a React Aria a volver a procesar la colección y sus controles.
3. **Solo hay virtualización vertical.** `rows.slice(start,end)` limita las filas, pero cada una ejecuta `columns.map(...)` para las 24 columnas. En esta ventana se reconstruyen descriptores para unas 744 celdas, incluidas las que quedan fuera de la pantalla horizontalmente. Se observaron unas dos confirmaciones de render React por flecha: 290 para 144 horizontales y 363 para 180 verticales.
4. **Se actualiza incluso cuando no hay movimiento.** Al llegar al borde se vuelve a llamar `onRange` con un objeto nuevo que contiene la misma posición. Las 120 flechas hacia la izquierda, estando ya en la primera columna, produjeron 240 commits y unos 8.386 ms de script, con **cero tiempo de layout y estilos** en ese escenario. Es trabajo evitable.
5. **Hay trabajo secundario repetido.** Se llama a `reveal` desde el manejador y otra vez desde el efecto del rango. El contador de OC vuelve a recorrer `rows` y el render calcula valores y ayudas de todas las celdas montadas. Aportan trabajo, aunque el perfil sitúa el grueso del coste en React/colección.

En la ráfaga vertical de producción se midieron **13.433 ms de script**, frente a **26,5 ms de layout y 17,3 ms de estilos**. Por tanto, aumentar el margen de filas virtualizadas o cambiar colores/animaciones no aborda el coste dominante. Los modelos de lectura ya conservan su identidad en esta navegación; la optimización anterior de filtros no elimina el trabajo de la selección.

## Intervención recomendada, por orden

1. Separar el cursor/rango visual de la colección de datos. Acumular todos los movimientos en una referencia y publicar la posición como máximo una vez por frame, conservando las teclas; evitar actualizaciones cuando posición y ancla no cambian.
2. Reutilizar objetos de fila y contenido de celda por ID y versión de datos. Mover únicamente el indicador/rango y actualizar en las herramientas solo lo que cambie realmente de selección. La caché debe invalidarse ante edición, errores, columnas y datos reales, no ante cada cambio de cursor.
3. Unificar `reveal`, agrupar lecturas de dimensiones y desplazar únicamente cuando se sale del área visible. Memoizar contadores y valores que no dependen del cursor.
4. Evaluar virtualización horizontal después de estabilizar la selección, manteniendo tamaños, índices accesibles, filtros y edición. Esto reduciría las celdas montadas fuera de pantalla.
5. Repetir estas mismas ráfagas a 30/60 teclas/s y comprobar retraso, exactitud final, frames, pico de heap y memoria posterior al GC. Incluir límites, Shift, cambio de dirección, controles abiertos y navegación hacia filas desmontadas.

## Reproducción y evidencias

```powershell
npm run build
$env:PROTOTIPO_BROWSER_MODE='production'
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-keyboard-diagnostic.browser.js
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-keyboard-control.browser.js
$env:PROTOTIPO_BROWSER_MODE='development'
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-keyboard-diagnostic.browser.js
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-keyboard-control.browser.js
node scripts/analyze-keyboard-diagnostic.mjs
```

El diagnóstico envía 1.008 flechas en el recorrido completo de producción y 613 en el de desarrollo; los controles añaden 468/368. No incluye los primeros intentos descartados de instrumentación. Los perfiles `.cpuprofile` pueden abrirse en Chrome DevTools. La comprobación de propiedades de la prueba valida que la medición es íntegra; **no significa que la fluidez sea aceptable**: los retrasos quedan registrados como hallazgo.

- [Análisis consolidado, equipo y hashes de fuentes](tests/evidence/product-sheet-keyboard/analysis.json).
- [Producción: memoria, CPU y escenarios](tests/evidence/product-sheet-keyboard/production-summary.json).
- [Desarrollo: memoria, CPU y escenarios](tests/evidence/product-sheet-keyboard/development-summary.json).
- [Control de producción sin perfilador](tests/evidence/aria/chromium-product-sheet-keyboard-control.browser.json).
- [Control de desarrollo sin perfilador](tests/evidence/aria/chromium-development-product-sheet-keyboard-control.browser.json).
- [Perfil CPU de producción](tests/evidence/product-sheet-keyboard/production-fast-vertical.cpuprofile) y [desarrollo](tests/evidence/product-sheet-keyboard/development-fast-vertical.cpuprofile).
- [Resultado visual de producción](tests/evidence/product-sheet-keyboard/production-final.png) y [desarrollo](tests/evidence/product-sheet-keyboard/development-final.png).

Los archivos `*-trace.json` conservan tiempos individuales de envío/recepción, frames y muestreo de memoria. Los ensayos se realizaron en Chromium; no se atribuyen estos valores a WebKit o Firefox.
