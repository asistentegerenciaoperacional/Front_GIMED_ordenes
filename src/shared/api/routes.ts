const mode = import.meta.env?.MODE;
export const pilot = !!mode && mode !== "legacy";

export const commandRoutes: Record<string, string> = {
  saveEntity: "catalogos/guardar",
  deleteEntity: "catalogos/eliminar",
  setProductMaterials: "catalogos/materiales-producto",
  setFavoriteSuppliers: "catalogos/proveedores-favoritos",
  setTolerance: "catalogos/tolerancia",
  createOrder: "ordenes",
  editOrder: "ordenes/editar",
  authorizeOrder: "ordenes/autorizar",
  authorizeOrders: "ordenes/autorizar-varias",
  saveProductOrderSheet: "ordenes/hoja-producto",
  saveMaterialOrderSheet: "ordenes/hoja-material",
  setMaterialSheetLineStates: "ordenes/estados-renglon-material",
  deleteMaterialSheetLines: "ordenes/eliminar-renglones-material",
  setLineState: "ordenes/estado-renglon",
  setProductLineStates: "ordenes/estados-renglon-producto",
  setProductLotStates: "ordenes/estados-lote",
  createProductLots: "ordenes/lotes-producto",
  saveLot: "ordenes/lote/guardar",
  deleteLot: "ordenes/lote/eliminar",
  deleteLots: "ordenes/lotes/eliminar",
  linkMaterialSupply: "abastecimiento/vincular",
  saveReceipt: "recepciones/guardar",
  createInvoice: "facturas",
  assignInvoice: "facturas/asignar",
  createBarcode: "codigos",
  advanceBarcode: "codigos/avanzar",
  setAssignedBarcode: "codigos/asignar",
  saveQuotationTemplate: "correos/plantilla-cotizacion",
  sendMail: "correos/envios",
  sendMaterialQuotations: "correos/cotizaciones/envios",
};

export function apiUrl(path: string) {
  if (!pilot) return "/api/" + path;
  const mappings: Record<string, string> = {
    state: "contexto",
    "mail-preview": "correos/previsualizaciones",
    "material-quotation-preview": "correos/cotizaciones/previsualizaciones",
  };
  return "/api/v1/" + (mappings[path] ?? path);
}
export function documentUrl(id: string, download = false) {
  const suffix = download ? "?download=1" : "";
  return pilot ? "/api/v1/documentos/" + id + "/contenido" + suffix : "/api/documents/" + id + "/content" + suffix;
}
