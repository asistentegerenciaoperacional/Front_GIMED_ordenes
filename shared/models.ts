// Generated from Planeacion/db.md. Monetary decimals are exact strings.
export interface productos {
  id: string;
  nombre_producto: string;
  id_maquilador: string;
  id_categoria: string;
  unidades_lote: number;
  activo: boolean | null;
}

export interface codigos_barras {
  id: string;
  codigo: string;
  id_producto: string | null;
  estado: "creado_gs1" | "verificado_sistema" | "activo" | "//" | "Vigente," | "asociado" | "y" | "disponible" | "como" | "alternativa" | "asignado" | "//" | "Único" | "por" | "producto;" | "utilizado" | "para" | "nuevas" | "órdenes" | "inactivo";
  fecha_creacion: string | null;
  fecha_act: string | null;
}

export interface proveedor {
  id: string;
  nombre_largo: string | null;
  nombre_corto: string | null;
  nit: string | null;
  digito_verf: string | null;
  Es_maquila: boolean | null;
  Es_materiales: boolean | null;
  activo: boolean | null;
}

export interface direccion_proveedor {
  id: string;
  id_proveedor: string;
  nombre_dir: string | null;
  ciudad: string | null;
  linea_1: string | null;
  linea_2: string | null;
}

export interface contacto {
  id: string;
  id_proveedor: string;
  nombre: string | null;
  celular: string | null;
  cargo_area: string | null;
  correo: string | null;
}

export interface categorias {
  id: string;
  nombre_categoria: string | null;
  iva: number | null;
}

export interface costos_maquila {
  id: string;
  id_producto: string;
  costo: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

export interface tipos_materiales {
  id: string;
  tipo_material: string | null;
}

export interface materiales {
  id: string;
  codigo_material: number | null;
  id_tipo_material: string;
  nombre_material: string | null;
}

export interface materiales_asociados {
  id_material: string;
  id_producto: string;
}

export interface producto_corrugado {
  id_material: string;
  id_producto: string;
  unidades_por_corrugado: number;
}

export interface proveedores_favoritos {
  id_tipo_material: string;
  id_proveedor: string;
}

export interface orden_compra {
  id: string;
  tipo_orden: "producto" | "material" | "otro";
  no_orden: string;
  id_proveedor: string;
  fecha_elaboracion: string | null;
  fecha_solicitada_entrega: string | null;
  estado_autorizacion: "no_autorizada" | "autorizada";
  fecha_autorizacion: string | null;
}

export interface orden_producto {
  id: string;
  id_orden_compra: string;
  posicion: number;
  id_codigo_barras: string;
  id_producto: string;
  cantidad_solicitada: number;
  precio_unitario: string;
  ref_corrugado: string;
  cantidad_corrugado: number;
  estado: "en_seguimiento" | "anulada" | "cerrada";
  cantidad_sticker: number | null; // Prototype extension; not in production DBML.
  cantidad_cinta: number | null; // Prototype extension; not in production DBML.
}

export interface lote_producto {
  id: string;
  id_orden_producto: string;
  id_factura: string | null;
  numero_lote: string | null;
  cantidad_recibida: number | null;
  fecha_estimada_batch_record: string | null;
  fecha_entrega_batch_record: string | null;
  estado_batch_record: "pendiente" | "recibido" | "validado" | "rechazado";
  fecha_inspeccion: string | null;
  estado_inspeccion: "pendiente" | "aprobada" | "rechazada";
  fecha_recepcion: string | null;
  fecha_confirmacion: string | null;
  ubicacion: string | null;
  estado: "en_seguimiento" | "cerrado" | "anulado";
}

export interface orden_material {
  id: string;
  id_orden_compra: string;
  posicion: number;
  id_material: string;
  cantidad_solicitada: number;
  cantidad_recibida: number | null;
  precio_unitario: string;
  fecha_estimada_entrega: string | null;
  fecha_entrega: string | null;
  id_lote_material: string | null;
  id_factura: string | null;
  ubicacion: string | null;
  estado: "en_seguimiento" | "anulada" | "cerrada";
}

export interface lote_material {
  id: string;
  numero_lote: string;
}

export interface orden_otro {
  id: string;
  id_orden_compra: string;
  posicion: number;
  producto: string;
  cantidad_solicitada: number;
  cantidad_recibida: number | null;
  precio_unitario: string;
  fecha_estimada_entrega: string | null;
  fecha_entrega: string | null;
  id_factura: string | null;
  ubicacion: string | null;
  estado: "en_seguimiento" | "anulada" | "cerrada";
}

export interface abastecimiento_material {
  id_orden_producto: string;
  id_orden_material: string;
}

export interface factura {
  id: string;
  id_proveedor: string;
  numero_factura: string;
  fecha_registro: string;
}

export interface documento {
  id: string;
  tipo_entidad: "factura" | "lote_material" | "orden_compra" | null;
  id_entidad: string | null;
  tipo_documento: "factura_fisica" | "certificado_calidad" | "certificado_liberacion" | "orden_compra_escaneada" | "plantilla_certificado_liberacion";
  clave_almacenamiento: string;
  nombre_archivo: string;
  tipo_mime: string | null;
  fecha_carga: string;
}

export interface parametros_seguimiento {
  id: string;
  margen_tolerancia_pct: number;
  fecha_inicio: string;
}

export interface consecutivo_orden {
  grupo: "producto" | "material";
  ultimo_numero: number;
}

export interface contacto_interno {
  id: string;
  nombre: string;
  correo: string;
  cargo_area: string | null;
  activo: boolean;
}

export interface destinatario_evento {
  id: string;
  tipo_evento: "codigos_barras_nuevos" | "envio_orden_compra" | "envio_certificado_calidad" | "envio_certificado_liberacion";
  tipo_contacto: "interno" | "proveedor";
  cargo_area: string;
  tipo_destinatario: "para" | "cc" | "cco";
}

export interface adjunto_evento {
  tipo_evento: "codigos_barras_nuevos" | "envio_orden_compra" | "envio_certificado_calidad" | "envio_certificado_liberacion";
  tipo_adjunto: "orden_compra_escaneada" | "certificado_calidad" | "certificado_liberacion";
}

export interface correo_enviado {
  id_correo: string;
  remitente: string;
  tipo_evento: "codigos_barras_nuevos" | "envio_orden_compra" | "envio_certificado_calidad" | "envio_certificado_liberacion";
  fecha_envio: string;
}

export interface correo_enviado_destinatario {
  id_correo: string;
  remitente: string;
  destinatario: string;
  tipo_destinatario: "para" | "cc" | "cco";
}

export interface EntityMap {
  productos: productos;
  codigos_barras: codigos_barras;
  proveedor: proveedor;
  direccion_proveedor: direccion_proveedor;
  contacto: contacto;
  categorias: categorias;
  costos_maquila: costos_maquila;
  tipos_materiales: tipos_materiales;
  materiales: materiales;
  materiales_asociados: materiales_asociados;
  producto_corrugado: producto_corrugado;
  proveedores_favoritos: proveedores_favoritos;
  orden_compra: orden_compra;
  orden_producto: orden_producto;
  lote_producto: lote_producto;
  orden_material: orden_material;
  lote_material: lote_material;
  orden_otro: orden_otro;
  abastecimiento_material: abastecimiento_material;
  factura: factura;
  documento: documento;
  parametros_seguimiento: parametros_seguimiento;
  consecutivo_orden: consecutivo_orden;
  contacto_interno: contacto_interno;
  destinatario_evento: destinatario_evento;
  adjunto_evento: adjunto_evento;
  correo_enviado: correo_enviado;
  correo_enviado_destinatario: correo_enviado_destinatario;
}
export type Database = { [K in keyof EntityMap]: EntityMap[K][] };
