# Verificación de OCM desde materiales pendientes

Base: 1.25 estable (2011bb9). 213 pruebas automatizadas; 222 comprobaciones de navegador; 39/39 presupuestos generales cumplidos.

| Lotes / ancho | Parejas pendientes | Carga fría P95 | Mayor interacción P95 | Crecimiento de heap tras 30 ciclos |
| --- | --- | --- | --- | --- |
| 6.000 / 1440 px | 19.455 | 447 ms | 112,8 ms | 1,9 MB |
| 6.000 / 375 px | 19.455 | 448,7 ms | 112 ms | 1,9 MB |
| 60.000 / 1440 px | 194.365 | 1.078,4 ms | 149,2 ms | 1,3 MB |

La carga fría se mide por separado del objetivo de interacción inferior a 200 ms. Los informes incluyen muestras, fixtures, recursos descargados y memoria. Datos sintéticos; base real conservada por SHA-256. Sin commit de respaldo.

[Informe completo](delivery-report.json) · [Comparación general](comparison.json) · [Medición del módulo](material-demand-performance.json)
