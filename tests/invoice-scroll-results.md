# Selección de lotes en facturas — 13 de octubre de 2026

Validación realizada con Playwright CLI y Chrome local, contra el prototipo en ejecución.

## Causa comprobada

Al clicar el texto de un lote, el navegador enfoca su checkbox. Este heredaba `scroll-margin-block: 100px`, pensado para los campos de formulario, y reajustaba la lista desplazable para respetar ese margen.

| Variante | Clic en lote superior | Clic en lote inferior |
| --- | ---: | ---: |
| Comportamiento original | −58 px | +82 px |
| Solo cursor `pointer` | −58 px | +82 px |
| Cursor `pointer` y margen del checkbox en 0 | 0 px | 0 px |

La hipótesis del cursor no explica el salto. El puntero mejora la señal visual, pero la corrección funcional es retirar el margen de desplazamiento de las casillas dentro de `.check-list`. Se conserva su foco nativo.

## Regresión

| Formulario | Viewport | Clics | Máximo desplazamiento involuntario | Teclado | Rueda |
| --- | --- | ---: | ---: | --- | --- |
| Edición | 799 × 668 | 8 | 0 px | Correcto | Correcto |
| Creación | 799 × 668 | 8 | 0 px | Correcto | Correcto |
| Edición | 1440 × 900 | 8 | 0 px | Correcto | Correcto |
| Creación | 1440 × 900 | 8 | 0 px | Correcto | Correcto |

Los 32 clics cubrieron texto y checkbox, filas superiores e inferiores y selección/deselección. Se midió el scroll de lista, diálogo y página con clics por coordenadas para evitar el desplazamiento automático de los localizadores de Playwright.

Tab siguió revelando lotes fuera de la vista; Espacio seleccionó/deseleccionó sin saltos. No hubo errores JavaScript ni solicitudes POST. Los formularios se cancelaron y el hash del archivo de datos fue idéntico antes y después.

La creación se validó con el proveedor elegido previamente para separar el salto involuntario del filtrado por proveedor.

## Repetir

```powershell
npx.cmd --no-install playwright-cli -s=invoice-scroll open http://127.0.0.1:5173/facturas/000000000000000000000096
npx.cmd --no-install playwright-cli -s=invoice-scroll run-code --filename=tests/invoice-scroll.browser.js
npx.cmd --no-install playwright-cli -s=invoice-scroll close
```

El script parte de una factura existente; la URL del primer comando puede cambiarse por otra factura con suficientes lotes disponibles para desplazar la lista.

Capturas: [edición](../.playwright-cli/invoice-scroll-edit-after.png) y [creación](../.playwright-cli/invoice-scroll-create-after.png).
