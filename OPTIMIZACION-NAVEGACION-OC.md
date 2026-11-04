# Navegación de la hoja de OC — 3 de noviembre de 2026

Se implementó la alternativa **B** en `codex/hoja-oc-productos`, después del commit de recuperación `ef493cb` sobre `d25f20f`. La estructura HTML especializada pertenece exclusivamente a la hoja de OC de productos. Los controles, modelos, comandos, datos y el `DataTable` compartido conservan sus contratos.

## Decisión y cambios

Se construyó A con selección separada, colección dinámica de React Aria e identidades estables. En tres repeticiones de producción mejoró la navegación horizontal, pero el p95 vertical quedó en **139,6 ms**, por encima de 50 ms. El [resultado de A](tests/evidence/product-sheet-navigation/alternative-a-production.json) conserva las mediciones completas; el [ensayo parcial de desarrollo](tests/evidence/product-sheet-navigation/alternative-a-development-partial.json) no se usa como aceptación. Se retiró esa implementación y se sustituyó por B, según el criterio del plan.

- Controlador de selección por instancia, con direcciones estables, lectura lógica inmediata y publicación visual por frame. Las acciones leen el destino actual incluso antes del siguiente frame. Los cambios de vista cancelan selección, frames y arrastres pendientes.
- Tabla HTML con semántica `grid`, filas/celdas memoizadas y React Aria para controles, calendarios, autocompletados, filtros y ayudas. El cursor administra únicamente sus marcas, sin reconstruir contenido.
- Ventana vertical con margen de 2–6 filas por lado; columnas visibles más una adicional por lado. El editor y el encabezado con filtro abierto conservan su montaje sin fijarse visualmente ni montar posiciones intermedias.
- Herramientas suscritas únicamente al resumen que afecta sus acciones. Un cambio de lote del mismo propietario lee los nuevos destinos al ejecutar la acción, sin reconstruir la cinta por cada flecha. Las acciones diferidas conservan sus identificadores al resolver el borrador.
- Índices globales, `aria-sort`, selección accesible y referencia a una celda activa conectada. El menú de columnas conserva el foco al deshabilitar «Seleccionar todas» y responde a Escape.

## Comparativa

Chromium 156.0.8078.80, mismo equipo del diagnóstico, base temporal de más de 5.000 lotes, 24 columnas y viewport de 1440 × 900. Los controles envían eventos confiables de CDP a 8/30/60 teclas por segundo desde un emisor independiente de la respuesta de la página. No se ejecutan otros navegadores de prueba simultáneamente.

Las cifras siguientes comparan el control original sin perfilador con la mediana de tres repeticiones de la implementación final. La columna «cola» mide cuánto tarda en procesarse la entrada después del último envío.

| Entorno y recorrido | Flechas | p95 original | p95 final | Cola original | Cola final |
| --- | ---: | ---: | ---: | ---: | ---: |
| Producción horizontal, 60/s | 144 | 7.092 ms | **7,8 ms** | 7.510 ms | **4,4 ms** |
| Producción vertical, 60/s | 180 | 8.633 ms | **5,7 ms** | 9.095 ms | **1,8 ms** |
| Desarrollo horizontal, 60/s | 144 | 34.332 ms | **27,0 ms** | 36.286 ms | **11,1 ms** |

La vertical final de desarrollo utiliza **180 flechas**, frente a 80 del control antiguo; no se comparan sus duraciones como cargas iguales. Su p95 final fue **12,6 ms** y su cola mediana **2,0 ms**. Los seis escenarios de cada entorno cumplen los tres presupuestos bloqueantes: p95, cola mediana y cola máxima. Todas las posiciones finales coinciden con los movimientos enviados. Los resultados individuales, frames y tiempo de script están en los [controles de producción](tests/evidence/product-sheet-navigation/production-acceptance.json) y [desarrollo](tests/evidence/product-sheet-navigation/development-acceptance.json).

El perfilado se ejecutó separadamente de esos controles. En el recorrido comparable del diagnóstico, el pico de heap JS muestreado pasó de **215,6 a 21,8 MiB** en producción y de **387,3 a 57,6 MiB** en desarrollo. El script de la ráfaga vertical de producción pasó de 13.433 a 142 ms. El heap JS no representa toda la memoria del proceso ni de la GPU.

## Memoria y calidad de la medición

Diez recorridos por entorno combinan 2.160 flechas con saltos al final y al inicio de la base. Se compara la misma ventana final para que la histéresis de sus márgenes no falsee los contadores. GC forzado se utiliza únicamente en el arnés.

| Entorno | Últimos tres heaps tras GC | Nodos tras GC | Listeners | Filas/celdas montadas |
| --- | --- | ---: | ---: | ---: |
| Producción | 9,41 / 9,42 / 9,42 MiB | 1.027 constantes | 255 constantes | 23 / 230 |
| Desarrollo | 28,51 / 27,83 / 27,78 MiB | 1.033 constantes | 258 constantes | 23 / 230 |

Las esperas del arnés devuelven booleanos: devolver elementos desde `waitForFunction` retenía `JSHandle`s de celdas desmontadas en el depurador y producía un crecimiento artificial de nodos. Se corrigió y se repitieron los diez recorridos antes de aceptar las cifras. También se verificó el número real de celdas y filas montadas. No se observó retención acumulativa de nodos/listeners en el recorrido corregido.

Evidencias: [memoria de producción](tests/evidence/product-sheet-navigation/production-memory.json), [desarrollo](tests/evidence/product-sheet-navigation/development-memory.json), [análisis, hashes y CPU](tests/evidence/product-sheet-navigation/analysis.json), [perfil original conservado](tests/evidence/product-sheet-keyboard/production-fast-vertical.cpuprofile), [perfil final de producción](tests/evidence/product-sheet-navigation/profile/production-fast-vertical.cpuprofile) y [desarrollo](tests/evidence/product-sheet-navigation/profile/development-fast-vertical.cpuprofile).

## Reproducción

```powershell
npm run build
$env:PROTOTIPO_BROWSER_MODE='production'
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-navigation-optimized.browser.js
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-navigation-memory.browser.js
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-navigation-profile.browser.js
$env:PROTOTIPO_BROWSER_MODE='development'
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-navigation-optimized.browser.js
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-navigation-memory.browser.js
node --import tsx scripts/verify-product-sheet-large.ts tests/product-sheet-navigation-profile.browser.js
node scripts/analyze-sheet-navigation.mjs
```

Los runners usan bases temporales y no alteran los datos locales de compras. Las evidencias originales permanecen en `tests/evidence/product-sheet-keyboard`. Las comprobaciones funcionales y sus limitaciones se registran en [VERIFICACION.md](VERIFICACION.md).
