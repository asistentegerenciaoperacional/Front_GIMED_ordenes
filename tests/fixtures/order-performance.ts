import type {
  Database,
  orden_compra,
  orden_producto,
} from "../../shared/models";
import { makeSeed, sid } from "../../shared/seed";

export const ORDER_PERFORMANCE_DAY = "2026-10-09";

/** Deterministic UI fixture. Never reads or writes the user's database. */
export function makeOrderPerformanceFixture(lotCount: number): Database {
  if (!Number.isSafeInteger(lotCount) || lotCount < 6 || lotCount % 6 !== 0)
    throw new RangeError("lotCount must be a positive multiple of six.");
  const db = makeSeed();
  db.orden_compra = [];
  db.orden_producto = [];
  db.orden_material = [];
  db.orden_otro = [];
  db.lote_producto = [];
  db.lote_material = [{ id: sid(900), numero_lote: "PERF-MAT-001" }];
  db.abastecimiento_material = [];
  db.factura = [
    {
      id: sid(901),
      id_proveedor: sid(1),
      numero_factura: "PERF-AUR-001",
      fecha_registro: "2026-10-01T12:00:00.000Z",
    },
    {
      id: sid(902),
      id_proveedor: sid(3),
      numero_factura: "PERF-ENV-001",
      fecha_registro: "2026-10-01T12:00:00.000Z",
    },
    {
      id: sid(903),
      id_proveedor: sid(5),
      numero_factura: "PERF-SER-001",
      fecha_registro: "2026-10-01T12:00:00.000Z",
    },
  ];
  db.documento = [];
  db.productos.push({
    id: sid(904),
    nombre_producto: "Champú de demostración · 300 ml",
    id_maquilador: sid(1),
    id_categoria: sid(30),
    unidades_lote: 12000,
    activo: true,
  });
  db.codigos_barras.push({
    id: sid(905),
    codigo: "770100009999",
    id_producto: sid(904),
    estado: "asignado",
    fecha_creacion: "2026-01-10T12:00:00.000Z",
    fecha_act: "2026-01-11T12:00:00.000Z",
  });
  db.producto_corrugado.push({
    id_producto: sid(904),
    id_material: sid(53),
    unidades_por_corrugado: 24,
  });
  let nextId = 100000;
  const freshId = () => sid(nextId++);
  const productOrderCount = lotCount / 6;
  const otherOrderCount = Math.floor(productOrderCount / 10);
  const materialOrderCount = Math.max(
    1,
    Math.ceil(productOrderCount / 2) - otherOrderCount,
  );
  // ISO instants exercise the production Bogotá normalization, including UTC-day boundaries.
  const iso = (offset: number, boundary = false) => {
    const value = new Date("2026-10-09T12:00:00.000Z");
    value.setUTCDate(value.getUTCDate() + offset);
    if (boundary) value.setUTCHours(2);
    return value.toISOString();
  };
  const deliveryOffsets = [-9, -1, 0, 7, 8, 15, 16, 30, 31, 90];
  const header = (
    type: orden_compra["tipo_orden"],
    index: number,
    number: number,
  ) => {
    const row: orden_compra = {
      id: freshId(),
      tipo_orden: type,
      no_orden: String(number),
      id_proveedor: sid(type === "producto" ? 1 : type === "material" ? 3 : 5),
      fecha_elaboracion: "2026-09-01T12:00:00.000Z",
      fecha_solicitada_entrega: iso(
        deliveryOffsets[index % deliveryOffsets.length],
        index % 11 === 0,
      ),
      estado_autorizacion: "autorizada",
      fecha_autorizacion: "2026-09-02T12:00:00.000Z",
    };
    db.orden_compra.push(row);
    return row;
  };
  for (let index = 0; index < productOrderCount; index++) {
    const order = header("producto", index, 2801 + index);
    const lines: orden_producto[] = [];
    for (let position = 1; position <= 3; position++) {
      const product = [70, 71, 904][position - 1];
      const line: orden_producto = {
        id: freshId(),
        id_orden_compra: order.id,
        posicion: position,
        id_producto: sid(product),
        id_codigo_barras: sid([90, 91, 905][position - 1]),
        cantidad_solicitada: 12000,
        precio_unitario: ["3200.00", "2450.00", "4100.00"][position - 1],
        ref_corrugado: sid(53),
        cantidad_corrugado: 505,
        cantidad_sticker: position === 1 ? 26400 : null,
        cantidad_cinta: position === 2 ? 3 : null,
        estado:
          (index + position) % 17 === 0
            ? "anulada"
            : (index + position) % 7 === 0
              ? "cerrada"
              : "en_seguimiento",
      };
      lines.push(line);
      db.orden_producto.push(line);
    }
    const effective = lines.filter((line) => line.estado !== "anulada");
    // Exactly six lots per order; cancelled product lines retain no lots.
    for (let position = 0; position < 6; position++) {
      const serial = index * 6 + position;
      const line = effective[position % effective.length];
      const quantity =
        index % 13 === 0
          ? null
          : serial % 4 === 0
            ? null
            : serial % 4 === 1
              ? 0
              : 3000;
      const reception =
        serial % 3 === 0 ? iso(-1 - (serial % 8), serial % 11 === 0) : null;
      const batch = serial % 5 === 0 ? iso(-1 - (serial % 7)) : null;
      const inspection = serial % 7 === 0 ? iso(-1 - (serial % 6)) : null;
      const confirmation = serial % 5 === 0 ? iso(-1 - (serial % 5)) : null;
      db.lote_producto.push({
        id: freshId(),
        id_orden_producto: line.id,
        numero_lote: "PERF-PRO-" + String(serial + 1).padStart(6, "0"),
        id_factura: serial % 4 === 0 ? null : sid(901),
        cantidad_recibida: quantity,
        fecha_estimada_batch_record:
          serial % 11 === 0
            ? null
            : iso(serial % 2 === 0 ? -1 : 8, serial % 19 === 0),
        fecha_entrega_batch_record: batch,
        estado_batch_record: batch ? "recibido" : "pendiente",
        fecha_inspeccion: inspection,
        estado_inspeccion: serial % 3 === 0 ? "aprobada" : "pendiente",
        fecha_recepcion: reception,
        fecha_confirmacion: confirmation,
        ubicacion: reception ? "Bodega de demostración" : null,
        estado:
          serial % 19 === 0
            ? "anulado"
            : (index + line.posicion) % 5 === 0
              ? "cerrado"
              : "en_seguimiento",
      });
    }
  }
  for (let index = 0; index < materialOrderCount; index++) {
    const order = header("material", index, 1601 + index);
    for (let position = 1; position <= 3; position++) {
      const serial = index * 3 + position - 1;
      const reception =
        serial % 3 === 0 ? iso(-1 - (serial % 8), serial % 11 === 0) : null;
      db.orden_material.push({
        id: freshId(),
        id_orden_compra: order.id,
        posicion: position,
        id_material: sid([50, 51, 56][position - 1]),
        cantidad_solicitada: 13200,
        cantidad_recibida:
          index % 13 === 0
            ? null
            : serial % 4 === 0
              ? null
              : serial % 4 === 1
                ? 0
                : 6600,
        precio_unitario: "450.00",
        fecha_estimada_entrega: order.fecha_solicitada_entrega,
        fecha_entrega: reception,
        id_lote_material: reception ? sid(900) : null,
        id_factura: serial % 4 === 0 ? null : sid(902),
        ubicacion: reception ? "Bodega de demostración" : null,
        estado:
          serial % 11 === 0
            ? "anulada"
            : serial % 5 === 0
              ? "cerrada"
              : "en_seguimiento",
      });
    }
  }
  for (let index = 0; index < otherOrderCount; index++) {
    const order = header("otro", index, 1601 + materialOrderCount + index);
    for (let position = 1; position <= 3; position++) {
      const serial = index * 3 + position - 1;
      db.orden_otro.push({
        id: freshId(),
        id_orden_compra: order.id,
        posicion: position,
        producto: "Servicio de demostración " + position,
        cantidad_solicitada: 10,
        cantidad_recibida:
          index % 13 === 0
            ? null
            : serial % 4 === 0
              ? null
              : serial % 4 === 1
                ? 0
                : 5,
        precio_unitario: "850000.00",
        fecha_estimada_entrega: order.fecha_solicitada_entrega,
        fecha_entrega: serial % 3 === 0 ? iso(-1 - (serial % 8)) : null,
        id_factura: serial % 4 === 0 ? null : sid(903),
        ubicacion: null,
        estado:
          serial % 11 === 0
            ? "anulada"
            : serial % 5 === 0
              ? "cerrada"
              : "en_seguimiento",
      });
    }
  }
  for (let index = 0; index < db.orden_producto.length; index += 2) {
    db.abastecimiento_material.push({
      id_orden_producto: db.orden_producto[index].id,
      id_orden_material: db.orden_material[index % db.orden_material.length].id,
    });
  }
  const document = (
    owner: "orden_compra" | "factura" | "lote_material" | null,
    ownerId: string | null,
    type: Database["documento"][number]["tipo_documento"],
    name: string,
  ) => {
    const id = freshId();
    db.documento.push({
      id,
      tipo_entidad: owner,
      id_entidad: ownerId,
      tipo_documento: type,
      clave_almacenamiento: "placeholder/" + id,
      nombre_archivo: name,
      tipo_mime: "text/html",
      fecha_carga: iso(-8),
    });
  };
  db.orden_compra.forEach((order, index) => {
    if (index % 2 === 0)
      document(
        "orden_compra",
        order.id,
        "orden_compra_escaneada",
        "Orden-" + order.no_orden + ".html",
      );
  });
  for (const invoice of db.factura)
    document(
      "factura",
      invoice.id,
      "factura_fisica",
      invoice.numero_factura + ".html",
    );
  document(
    "lote_material",
    sid(900),
    "certificado_calidad",
    "Calidad-PERF-MAT-001.html",
  );
  document(
    "lote_material",
    sid(900),
    "certificado_liberacion",
    "Liberacion-PERF-MAT-001.html",
  );
  document(
    null,
    null,
    "plantilla_certificado_liberacion",
    "Plantilla-liberacion.html",
  );
  db.consecutivo_orden = [
    { grupo: "producto", ultimo_numero: 2800 + productOrderCount },
    {
      grupo: "material",
      ultimo_numero: 1600 + materialOrderCount + otherOrderCount,
    },
  ];
  return db;
}
