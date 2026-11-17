# Front de GIMED

`npm run dev:piloto` usa el backend separado. `npm run dev` y `npm run build:legacy` preservan la comprobación del prototipo con datos sintéticos. `npm run build` genera la SPA que consume `/api/v1`.

Usar React Aria y el [sistema visual existente](../design-system/MASTER.md). Compartir componentes de tabla, diálogo, formulario, calendario y avisos. Guardar estilos de flujos nuevos en CSS Modules y reutilizar los tokens que gobiernan la aplicación. Conservar nombres accesibles, navegación por teclado y retorno de foco. Las hojas de órdenes y la impresión siguen las reglas del negocio.

Mantener búsquedas, filtros, ordenamiento y página en la URL. Consumir endpoints por flujo, manejar las respuestas de conflicto conservando el borrador y aplicar cambios de datos por revisión. Los archivos se cargan desde el navegador después de reservar espacio en el back. Los estados de carga y confirmación deben distinguirse en la UI.

Actualizar `src/shared/api/openapi.json` desde el back y regenerar los tipos cuando cambie su revisión. Usar el mismo archivo al probar la pareja de aplicaciones.

Al trabajar con dos repositorios hermanos, el glosario canónico y las decisiones de arquitectura se encuentran en `Back_GIMED_ordenes/CONTEXT.md` y `Back_GIMED_ordenes/docs/`.
