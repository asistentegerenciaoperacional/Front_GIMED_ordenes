import { z } from "zod";
import type { Database } from "./models";
import { buildMaterialNeeds } from "./material-demand";

const id = z.string().min(1);
const orderSnapshot = z
  .object({
    id_orden: id,
    fecha_solicitada_entrega: z.string().nullable(),
    cantidad_solicitada: z.number().int().refine(Number.isSafeInteger),
  })
  .strict();
const expectedSchema = z
  .object({
    id_producto: id,
    id_material: id,
    oc: orderSnapshot,
    ocm: orderSnapshot.extend({ id_proveedor: id }),
  })
  .strict();
export const materialSupplyLinkSchema = z
  .object({
    id_orden_producto: id,
    id_orden_material: id,
    expected: expectedSchema,
  })
  .strict();

/** Freeze the identities and the values presented before confirming a link. */
export function materialSupplySelection(
  db: Database,
  productLineId: string,
  materialLineId: string,
) {
  const product = db.orden_producto.find((line) => line.id === productLineId);
  const material = db.orden_material.find((line) => line.id === materialLineId);
  const oc = db.orden_compra.find(
    (order) => order.id === product?.id_orden_compra,
  );
  const ocm = db.orden_compra.find(
    (order) => order.id === material?.id_orden_compra,
  );
  if (!product || !material || !oc || !ocm) return null;
  return expectedSchema.parse({
    id_producto: product.id_producto,
    id_material: material.id_material,
    oc: {
      id_orden: oc.id,
      fecha_solicitada_entrega: oc.fecha_solicitada_entrega,
      cantidad_solicitada: product.cantidad_solicitada,
    },
    ocm: {
      id_orden: ocm.id,
      fecha_solicitada_entrega: ocm.fecha_solicitada_entrega,
      cantidad_solicitada: material.cantidad_solicitada,
      id_proveedor: ocm.id_proveedor,
    },
  });
}

export function materialSupplyCandidates(db: Database, materialId: string) {
  const orders = new Map(
    db.orden_compra
      .filter((order) => order.tipo_orden === "material")
      .map((order) => [order.id, order]),
  );
  return db.orden_material.flatMap((line) => {
    const order = orders.get(line.id_orden_compra);
    return line.id_material === materialId &&
      line.estado === "en_seguimiento" &&
      order
      ? [{ line, order }]
      : [];
  });
}

export function materialSupplyLinkAvailable(
  db: Database,
  productLineId: string,
  materialLineId: string,
) {
  const target = db.orden_material.find((line) => line.id === materialLineId);
  const source = db.orden_producto.find((line) => line.id === productLineId);
  return (
    !!target &&
    !!source &&
    materialSupplyCandidates(db, target.id_material).some(
      ({ line }) => line.id === target.id,
    ) &&
    buildMaterialNeeds(db, source.id_orden_compra).some(
      (need) =>
        need.line.id === productLineId &&
        need.material.id === target.id_material,
    )
  );
}

function coverage(db: Database) {
  const materials = new Map(
    db.orden_material
      .filter((line) => line.estado !== "anulada")
      .map((line) => [line.id, line.id_material]),
  );
  const pairs = new Map<string, Set<string>>();
  for (const link of db.abastecimiento_material) {
    const material = materials.get(link.id_orden_material);
    if (!material) continue;
    const key = JSON.stringify([link.id_orden_producto, material]);
    const lines = pairs.get(key) ?? new Set<string>();
    lines.add(link.id_orden_material);
    pairs.set(key, lines);
  }
  return pairs;
}

/** Preserve historical duplicates; reject only newly introduced overlapping coverage. */
export function introducesDuplicateSupply(
  next: Database,
  previous: Database,
): boolean {
  const before = coverage(previous);
  for (const [pair, lines] of coverage(next)) {
    if (
      lines.size > 1 &&
      [...lines].some((line) => !before.get(pair)?.has(line))
    )
      return true;
  }
  return false;
}
