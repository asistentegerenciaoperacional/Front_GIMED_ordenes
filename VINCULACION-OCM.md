# Vinculación manual OC–OCM · 27 de octubre de 2026

## Recuperación y datos

Commit anterior a cualquier modificación: `d905af2b2e6a8afb5dc0b18de53cde46bd3ee067`.
El repositorio estaba limpio; se creó igualmente el commit de recuperación.

Respaldos separados en `../respaldos/vinculo-manual-20261027/`:

| Archivo | SHA-256 |
|---|---|
| `database.json` | `2eadb88592c002a778c14ffff861d10bf56a9ce791eebdc76beac94d77511019` |
| `db.md` | `494b4c653fc5e9929e9ec8023b7f3756671b229669fd1a916c46b72f4625e475` |

No hay migración, cambios de esquema ni corrección de datos. Los archivos originales
conservan esos hashes. Las pruebas de escritura usan bases temporales; las mediciones
sirven fixtures sintéticos en memoria. La comparación de cobertura conserva los
duplicados históricos y rechaza únicamente cobertura duplicada introducida por una
operación nueva, incluida la reactivación de una compra anulada.

## Implementación

- `shared/material-demand.ts`: consulta común de pendientes, con alcance opcional por
  OC para evitar construir las necesidades de toda la aplicación al abrir un detalle.
- `shared/material-supply.ts`: candidatos por ID, selección esperada y comparación de
  cobertura anterior/nueva.
- `server/domain.ts`: comando transaccional `linkMaterialSupply`.
- `server/integrity.ts`: protección contra nuevas coberturas duplicadas.
- `src/material-supply.tsx`: acción por producto, diálogo React Aria y recuperación de
  foco/scroll; `src/orders.tsx` integra la sección con los vínculos históricos.

La vinculación admite una entrega tardía con advertencia únicamente al asociar.
Cualquier edición posterior mantiene la regla estricta existente, incluso si no
cambia la fecha. El contrato completo y la elegibilidad están en
[ABASTECIMIENTO-OCM.md](ABASTECIMIENTO-OCM.md) y el patrón visual en
[MASTER.md](design-system/MASTER.md).

## Verificación reproducible

```powershell
npm test
npm run build
npm run test:ocm
node scripts/verify-aria-browser.mjs tests/browser-journey.js chromium
node scripts/verify-persistence.mjs
node scripts/benchmark-manual-supply.mjs
```

`test:ocm` ejecuta la creación consolidada y la vinculación manual en Chromium,
Firefox y WebKit. Las capturas reales del nuevo diálogo están en
`tests/evidence/ocm/*-manual-link-{375,768,1024,1440}.png`; sus reportes incluyen
los casos comprobados y la consola. El recorrido general fija únicamente su reloj
de fixture en 14/10/2026, en navegador y servidor, para conservar sus casos históricos
sin desactivar las reglas de fechas de producción. Los tests específicos de fechas
y de vinculación siguen verificando el comportamiento temporal correspondiente.

La comparación de producción está en `tests/evidence/manual-supply/comparison.json`:
misma referencia de recuperación, fixtures de 6.000/60.000 lotes, equipo y navegador,
sin limitar CPU. Mide eventos hasta resultado visible, carga, descarga JS, tareas
largas y heap liberado tras ciclos repetidos. Los límites son +máx(15 %,20 ms) por
interacción, +máx(15 %,100 ms) para carga y +máx(15 %,5 MB) para memoria estable.
La acción de vincular no existía en la referencia: la comparación mide las operaciones
compartidas y la navegación al detalle que ahora incorpora la acción. El nuevo flujo
se verifica funcionalmente en los tres motores. CPU 4× permanece como ensayo separado.
`new-flow-performance.json` mide además selección de material, apertura del selector,
búsqueda sobre miles de OCM, selección por ID y cierre, con 20 muestras por interacción
y 50 ciclos para memoria. Comprueba un DOM de hasta 50 coincidencias más la selección
conservada y encuentra una OCM situada fuera de la primera página de resultados.

Resultados finales, sin redondeos de las muestras: [Verificación](VERIFICACION.md)
y [Rendimiento](RENDIMIENTO.md).
