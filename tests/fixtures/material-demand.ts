import type { Database } from "../../shared/models";
import { blankRow } from "../../shared/schema";
import { makeSeed, sid } from "../../shared/seed";
import { makeOrderPerformanceFixture } from "./order-performance";

export const DEMAND_RANGE = { desde: "2027-02-01", hasta: "2027-02-28" };
export function makeMaterialDemandFixture(): Database {
  const db = makeSeed();
  const template = db.orden_compra.find(
    (order) => order.tipo_orden === "producto",
  )!;
  const line = db.orden_producto.find((row) => row.id_producto === sid(70))!;
  for (let index = 0; index < 2; index++) {
    const delivery = `2027-02-${index === 0 ? "15" : "22"}T12:00:00.000Z`;
    db.orden_compra.push({
      ...template,
      id: sid(2000 + index),
      no_orden: String(2901 + index),
      id_proveedor: sid(1),
      fecha_solicitada_entrega: delivery,
      estado_autorizacion: "autorizada",
      fecha_autorizacion: "2026-10-01T12:00:00.000Z",
    });
    db.orden_producto.push({
      ...line,
      id: sid(2100 + index),
      id_orden_compra: sid(2000 + index),
      posicion: 1,
      cantidad_solicitada: (index + 1) * 1000,
      estado: "en_seguimiento",
    });
    db.lote_producto.push({
      ...blankRow("lote_producto"),
      id: sid(2300 + index),
      id_orden_producto: sid(2100 + index),
      fecha_estimada_batch_record: delivery,
    } as Database["lote_producto"][number]);
  }
  db.orden_producto.push({
    ...line,
    id: sid(2102),
    id_orden_compra: sid(2000),
    posicion: 2,
    id_producto: sid(71),
    id_codigo_barras: sid(91),
    cantidad_solicitada: 500,
    estado: "en_seguimiento",
    cantidad_sticker: null,
    cantidad_cinta: 1,
  });
  db.lote_producto.push({
    ...blankRow("lote_producto"),
    id: sid(2302),
    id_orden_producto: sid(2102),
    fecha_estimada_batch_record: "2027-02-15T12:00:00.000Z",
  } as Database["lote_producto"][number]);
  db.consecutivo_orden.find(
    (counter) => counter.grupo === "producto",
  )!.ultimo_numero = 2902;
  return db;
}

/** Eight distinct materials, including homonyms, for capacity and identity checks. */
export function addDemandMaterials(db: Database) {
  for (let index = 0; index < 6; index++) {
    const id = sid(3000 + index);
    db.materiales.push({
      id,
      codigo_material: 200 + index,
      id_tipo_material: sid(40),
      nombre_material:
        index < 2
          ? "Envase con nombre repetido"
          : `Material de prueba ${index + 1}`,
    });
    db.materiales_asociados.push({ id_producto: sid(70), id_material: id });
  }
  return db;
}

export function makeMaterialDemandPerformanceFixture(lots: number) {
  const db = addDemandMaterials(makeOrderPerformanceFixture(lots));
  const materials = [
    sid(50),
    sid(51),
    ...Array.from({ length: 6 }, (_, index) => sid(3000 + index)),
  ];
  const existing = new Set(
    db.materiales_asociados.map(
      (relation) => `${relation.id_producto}/${relation.id_material}`,
    ),
  );
  for (const product of db.productos)
    for (const id of materials) {
      const key = `${product.id}/${id}`;
      if (!existing.has(key))
        db.materiales_asociados.push({
          id_producto: product.id,
          id_material: id,
        });
    }
  return db;
}
