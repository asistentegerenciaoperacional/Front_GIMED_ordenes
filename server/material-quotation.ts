import { createHash } from "node:crypto";
import type { Database } from "../shared/models";
import { validEmail } from "../shared/schema";
import { isMaterialSupplier, supplierName } from "../shared/favorite-suppliers";
import {
  buildMaterialNeeds,
  earliestMaterialDelivery,
  groupMaterialSources,
  materialNeedKey,
  needsInRange,
} from "../shared/material-demand";
import {
  materialQuotationSchema,
  type MaterialQuotationPreview,
} from "../shared/material-quotation";
import { BusinessError, check } from "./integrity";

export function materialQuotationPreview(
  db: Database,
  input: unknown,
): MaterialQuotationPreview {
  const parsed = materialQuotationSchema.safeParse(input);
  if (!parsed.success)
    throw new BusinessError(
      "Revisa los datos de la cotización.",
      "VALIDATION",
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      ),
    );
  const draft = parsed.data;
  const available = new Map(
    needsInRange(
      buildMaterialNeeds(db),
      draft.demanda.desde,
      draft.demanda.hasta,
    ).map((need) => [need.key, need]),
  );
  const seen = new Set<string>();
  for (const source of draft.demanda.fuentes) {
    const key = materialNeedKey(source.id_orden_producto, source.id_material);
    check(
      !seen.has(key),
      "La selección contiene un origen repetido.",
      "VALIDATION",
      { "demanda.fuentes": "No repitas los vínculos seleccionados." },
    );
    seen.add(key);
    const saved = available.get(key)?.source;
    check(
      saved &&
        saved.cantidad_solicitada === source.cantidad_solicitada &&
        saved.fecha_solicitada_entrega === source.fecha_solicitada_entrega,
      "Las necesidades de material cambiaron. Actualiza y revisa la cotización antes de enviar.",
      "QUOTATION_CHANGED",
    );
  }
  let groups: ReturnType<typeof groupMaterialSources>;
  try {
    groups = groupMaterialSources(draft.demanda.fuentes);
  } catch (cause) {
    throw new BusinessError((cause as Error).message, "VALIDATION", {
      "demanda.fuentes": "Revisa las cantidades de los orígenes.",
    });
  }
  const materialIds = new Set(draft.materiales.map((m) => m.id_material));
  check(
    materialIds.size === draft.materiales.length &&
      materialIds.size === groups.length &&
      groups.every((group) => materialIds.has(group.id_material)),
    "Los materiales deben corresponder exactamente a los orígenes seleccionados.",
    "VALIDATION",
  );
  const recipientByProvider = new Map(
    draft.destinatarios.map((r) => [r.id_proveedor, r]),
  );
  check(
    recipientByProvider.size === draft.destinatarios.length,
    "Cada proveedor admite un solo destinatario.",
    "VALIDATION",
    { destinatarios: "No repitas un proveedor." },
  );
  const includedProviders = new Set(
    draft.materiales.flatMap((m) => m.proveedor_ids),
  );
  check(
    draft.destinatarios.every((r) => includedProviders.has(r.id_proveedor)),
    "Hay destinatarios sin materiales que cotizar.",
    "VALIDATION",
  );
  const providers = new Map(db.proveedor.map((p) => [p.id, p]));
  const contacts = new Map(db.contacto.map((c) => [c.id, c]));
  const materials = new Map(db.materiales.map((m) => [m.id, m]));
  const types = new Map(
    db.tipos_materiales.map((t) => [t.id, t.tipo_material]),
  );
  const bases = new Map(groups.map((group) => [group.id_material, group]));
  const result: MaterialQuotationPreview = {
    materiales: [],
    messages: [],
    issues: {},
    revision: "",
  };
  for (const [index, line] of draft.materiales.entries()) {
    const material = materials.get(line.id_material)!;
    const base = bases.get(line.id_material)!;
    const info = {
      id_material: material.id,
      material: material.nombre_material ?? "Material",
      codigo_maia:
        material.codigo_material == null
          ? "Sin código"
          : String(material.codigo_material).padStart(3, "0"),
      tipo_material: types.get(material.id_tipo_material) ?? "Sin tipo",
      cantidad_base: base.cantidad_base,
      cantidad: line.cantidad,
      adicional_pct: line.adicional_pct,
      fecha_entrega: earliestMaterialDelivery(
        base.fuentes.map((source) => source.fecha_solicitada_entrega),
      )!,
    };
    result.materiales.push(info);
    check(
      new Set(line.proveedor_ids).size === line.proveedor_ids.length,
      "No repitas proveedores para un mismo material.",
      "VALIDATION",
    );
    if (!line.proveedor_ids.length)
      result.issues[`materiales.${index}.proveedor_ids`] =
        `${info.material}: incluye al menos un proveedor destinatario.`;
    for (const id of line.proveedor_ids) {
      const provider = providers.get(id);
      check(
        provider && isMaterialSupplier(provider),
        "Un proveedor dejó de ser de materiales. Actualiza la selección antes de enviar.",
        "QUOTATION_CHANGED",
      );
      const recipient = recipientByProvider.get(id);
      const contact = recipient?.id_contacto
        ? contacts.get(recipient.id_contacto)
        : null;
      const address = recipient?.id_contacto
        ? contact?.id_proveedor === id
          ? (contact.correo ?? "")
          : ""
        : (recipient?.correo.trim() ?? "");
      if (!validEmail(address)) {
        result.issues[`destinatarios.${id}`] =
          `${supplierName(provider)}: elige un contacto válido o escribe su correo.`;
        continue;
      }
      const variables: Record<string, string> = {
        proveedor: supplierName(provider),
        material: info.material,
        codigo_maia: info.codigo_maia,
        tipo_material: info.tipo_material,
        cantidad: String(line.cantidad),
        fecha_entrega: info.fecha_entrega.split("-").reverse().join("/"),
      };
      const render = (value: string) =>
        value.replace(
          /{{\s*([^{}]+?)\s*}}/g,
          (_match, name: string) => variables[name.trim()],
        );
      result.messages.push({
        id_material: material.id,
        id_proveedor: id,
        material: info.material,
        proveedor: supplierName(provider),
        recipient: {
          address,
          type: "para",
          name: contact?.nombre ?? supplierName(provider),
        },
        subject: render(draft.plantilla.asunto),
        body: render(draft.plantilla.cuerpo),
      });
    }
  }
  result.revision = createHash("sha256")
    .update(
      JSON.stringify({
        draft,
        materiales: result.materiales,
        messages: result.messages,
        issues: result.issues,
      }),
    )
    .digest("hex");
  return result;
}
