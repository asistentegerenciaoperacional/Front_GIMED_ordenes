import type { Database } from "./models";

export type MaterialRole =
  "general" | "corrugado" | "cinta" | "sticker" | "ambiguous";

export type ProductMaterialConfig = {
  id_materiales: string[];
  corrugado: {
    id_material: string;
    unidades_por_corrugado: number;
  } | null;
};

export type ProductMaterialIssue = {
  code: string;
  message: string;
  fields: Record<string, string>;
  details?: Record<string, unknown>;
};

const normalized = (value: unknown) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

// Keep adhesive recognition compatible with the existing recommendations.
// Corrugado is the reserved type name already used by MAIA validation.
export function materialTypeRole(name: unknown): MaterialRole {
  const value = normalized(name);
  const roles = [
    ...(value === "corrugado" ? ["corrugado" as const] : []),
    ...(value.includes("cinta") ? ["cinta" as const] : []),
    ...(value.includes("sticker") ? ["sticker" as const] : []),
  ];
  return roles.length > 1 ? "ambiguous" : (roles[0] ?? "general");
}

export function materialRole(db: Database, id: string): MaterialRole {
  const material = db.materiales.find((row) => row.id === id);
  return materialTypeRole(
    db.tipos_materiales.find((row) => row.id === material?.id_tipo_material)
      ?.tipo_material,
  );
}

export function productMaterialConfig(
  db: Database,
  productId: string,
): ProductMaterialConfig {
  const box = db.producto_corrugado.find(
    (row) => row.id_producto === productId,
  );
  return {
    id_materiales: db.materiales_asociados
      .filter((row) => row.id_producto === productId)
      .map((row) => row.id_material)
      .sort(),
    corrugado: box
      ? {
          id_material: box.id_material,
          unidades_por_corrugado: box.unidades_por_corrugado,
        }
      : null,
  };
}

export function normalizeProductMaterialConfig(
  config: ProductMaterialConfig,
): ProductMaterialConfig {
  return {
    id_materiales: [...new Set(config.id_materiales)].sort(),
    corrugado: config.corrugado
      ? {
          id_material: config.corrugado.id_material,
          unidades_por_corrugado: config.corrugado.unidades_por_corrugado,
        }
      : null,
  };
}

const issue = (
  code: string,
  field: string,
  message: string,
  details?: Record<string, unknown>,
): ProductMaterialIssue => ({
  code,
  message,
  fields: { [field]: message },
  ...(details ? { details } : {}),
});

export function productMaterialConfigShapeIssue(
  value: unknown,
): ProductMaterialIssue | null {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return issue(
      "TYPE",
      "id_materiales",
      "Indica la configuración completa de materiales del producto.",
    );
  const config = value as Record<string, unknown>;
  if (
    !Array.isArray(config.id_materiales) ||
    config.id_materiales.some((id) => typeof id !== "string" || !id.trim())
  )
    return issue(
      "TYPE",
      "id_materiales",
      "Selecciona materiales mediante identificadores válidos.",
    );
  if (config.corrugado === null) return null;
  if (
    !config.corrugado ||
    typeof config.corrugado !== "object" ||
    Array.isArray(config.corrugado)
  )
    return issue(
      "TYPE",
      "corrugado.id_material",
      "Selecciona un corrugado o deja esta sección sin asignar.",
    );
  const box = config.corrugado as Record<string, unknown>;
  if (typeof box.id_material !== "string" || !box.id_material.trim())
    return issue(
      "TYPE",
      "corrugado.id_material",
      "Selecciona un corrugado válido.",
    );
  if (
    typeof box.unidades_por_corrugado !== "number" ||
    !Number.isSafeInteger(box.unidades_por_corrugado) ||
    box.unidades_por_corrugado <= 0
  )
    return issue(
      "PRODUCT_MATERIALS",
      "corrugado.unidades_por_corrugado",
      "Introduce una cantidad entera, positiva y segura de unidades por corrugado.",
    );
  return null;
}

export function productMaterialConfigIssue(
  db: Database,
  productId: string,
  value: unknown,
): ProductMaterialIssue | null {
  if (!db.productos.some((row) => row.id === productId))
    return issue("FOREIGN_KEY", "id_producto", "El producto ya no existe.");
  const shape = productMaterialConfigShapeIssue(value);
  if (shape) return shape;
  const config = value as ProductMaterialConfig;
  const kinds = new Set<MaterialRole>();
  for (const id of config.id_materiales) {
    if (!db.materiales.some((row) => row.id === id))
      return issue(
        "FOREIGN_KEY",
        "id_materiales",
        "Uno de los materiales seleccionados ya no existe.",
        { id_material: id },
      );
    const role = materialRole(db, id);
    if (role === "corrugado" || role === "ambiguous")
      return issue(
        "PRODUCT_MATERIALS",
        "id_materiales",
        role === "corrugado"
          ? "Configura el corrugado en su sección, separado de los demás materiales."
          : "El tipo de uno de los materiales es ambiguo.",
        { id_material: id },
      );
    kinds.add(role);
  }
  if (kinds.has("cinta") && kinds.has("sticker"))
    return issue(
      "R13",
      "id_materiales",
      "Un producto puede llevar sticker o cinta, pero no ambos.",
    );
  if (config.corrugado) {
    if (!db.materiales.some((row) => row.id === config.corrugado!.id_material))
      return issue(
        "FOREIGN_KEY",
        "corrugado.id_material",
        "El corrugado seleccionado ya no existe.",
      );
    if (materialRole(db, config.corrugado.id_material) !== "corrugado")
      return issue(
        "PRODUCT_MATERIALS",
        "corrugado.id_material",
        "Selecciona un material de tipo Corrugado.",
      );
  }
  return null;
}

function materialIsUsed(db: Database, id: string): boolean {
  return (
    db.materiales_asociados.some((row) => row.id_material === id) ||
    db.producto_corrugado.some((row) => row.id_material === id) ||
    db.orden_material.some((row) => row.id_material === id) ||
    db.orden_producto.some((row) => row.ref_corrugado === id)
  );
}

export function materialCatalogIssue(
  db: Database,
  entity: "materiales" | "tipos_materiales",
  candidate: Record<string, unknown>,
): ProductMaterialIssue | null {
  const proposed = {
    ...candidate,
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : "__material_draft__",
  };
  const next: Database = {
    ...db,
    [entity]: [...db[entity].filter((row) => row.id !== proposed.id), proposed],
  };
  const previous = db[entity].find((row) => row.id === proposed.id);
  const role =
    entity === "tipos_materiales"
      ? materialTypeRole(candidate.tipo_material)
      : materialRole(next, proposed.id);
  const field =
    entity === "tipos_materiales" ? "tipo_material" : "id_tipo_material";
  if (role === "ambiguous")
    return issue(
      "PRODUCT_MATERIALS",
      field,
      "El nombre del tipo no puede identificar simultáneamente cinta y sticker.",
    );
  if (previous) {
    const oldRole =
      entity === "tipos_materiales"
        ? materialTypeRole(
            (previous as Database["tipos_materiales"][number]).tipo_material,
          )
        : materialRole(db, previous.id);
    const used =
      entity === "tipos_materiales"
        ? db.materiales.some((row) => row.id_tipo_material === previous.id)
        : materialIsUsed(db, previous.id);
    if (oldRole !== role && used)
      return issue(
        "R13",
        field,
        entity === "tipos_materiales"
          ? "No puedes cambiar el significado de un tipo que ya tiene materiales."
          : "No puedes cambiar el tipo especial de un material que ya está utilizado.",
      );
  }
  return materialSingletonIssue(next);
}

function materialSingletonIssue(db: Database): ProductMaterialIssue | null {
  const found = new Map<MaterialRole, string>();
  for (const type of db.tipos_materiales)
    if (materialTypeRole(type.tipo_material) === "ambiguous")
      return issue(
        "PRODUCT_MATERIALS",
        "tipo_material",
        "El nombre del tipo no puede identificar simultáneamente cinta y sticker.",
        { id_tipo_material: type.id },
      );
  for (const material of db.materiales) {
    const role = materialRole(db, material.id);
    if (role !== "cinta" && role !== "sticker") continue;
    const existing = found.get(role);
    if (existing)
      return issue(
        "MATERIAL_SINGLETON",
        "id_tipo_material",
        `Solo puede existir un material de tipo ${role === "cinta" ? "Cinta" : "Sticker"} en todo el catálogo.`,
        { id_material: material.id, existingId: existing, role },
      );
    found.set(role, material.id);
  }
  return null;
}

export function productMaterialsDatabaseIssue(
  db: Database,
  previous?: Database,
): ProductMaterialIssue | null {
  if (previous) {
    for (const entity of ["tipos_materiales", "materiales"] as const)
      for (const row of db[entity]) {
        const old = previous[entity].find((other) => other.id === row.id);
        if (old && JSON.stringify(old) !== JSON.stringify(row)) {
          const conflict = materialCatalogIssue(previous, entity, { ...row });
          if (conflict) return conflict;
        }
      }
  }
  const singleton = materialSingletonIssue(db);
  if (singleton) return singleton;
  for (const product of db.productos) {
    const conflict = productMaterialConfigIssue(
      db,
      product.id,
      productMaterialConfig(db, product.id),
    );
    if (conflict) return conflict;
  }
  return null;
}
