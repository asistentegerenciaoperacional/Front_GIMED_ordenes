---
name: gimed-rendimiento
description: Medir y corregir regresiones al agregar funcionalidades o cambiar consultas, escrituras, renderizado, caché o navegación de GIMED.
---

Mide una compilación de producción con los mismos datos sintéticos, navegador y runner de la revisión base. Ejecuta `npm run perf:verify` y selecciona recorridos específicos según RENDIMIENTO.md y MIGRACION-ARIA.md. En cambios de hoja mide navegación rápida y contrasta el p95 con 50 ms. Reporta p95, muestras, volúmenes y errores. Si un límite falla, perfila, corrige y repite antes de integrar. Las lecturas y escrituras desplegadas tienen metas iniciales de 600 y 900 ms de p95 con 5 usuarios activos. Mide Gmail y archivos por separado.
