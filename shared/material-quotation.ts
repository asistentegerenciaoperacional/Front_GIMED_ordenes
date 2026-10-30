import { z } from "zod";
import type { Database } from "./models";
import { canonical, idSchema, validEmail } from "./schema";
import { favoriteSupplierIds } from "./favorite-suppliers";
import {
  buildMaterialNeeds,
  demandQuantity,
  groupMaterialSources,
  materialDemandSchema,
  needsInRange,
  type MaterialDemand,
} from "./material-demand";

export const quotationEvent = "cotizacion_materiales" as const;
export const quotationVariables = [
  "proveedor",
  "material",
  "codigo_maia",
  "tipo_material",
  "cantidad",
  "fecha_entrega",
] as const;
export const defaultQuotationTemplate = {
  asunto: "Solicitud de cotización · {{material}}",
  cuerpo:
    "Estimados {{proveedor}},\n\nSolicitamos su cotización para el siguiente material:\n\nMaterial: {{material}}\nCódigo MAIA: {{codigo_maia}}\nTipo: {{tipo_material}}\nCantidad: {{cantidad}} unidades\nEntrega solicitada: {{fecha_entrega}}\n\nPor favor indicar precio, impuestos, condiciones de pago y plazo de entrega.\n\nGracias.",
};
export type QuotationTemplate = typeof defaultQuotationTemplate;
export function quotationTemplateIssues(
  template: QuotationTemplate,
): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const field of ["asunto", "cuerpo"] as const) {
    const value = template[field];
    if (!value.trim()) issues[field] = "Completa este campo.";
    else if (value.length > (field === "asunto" ? 300 : 20000))
      issues[field] = "El texto es demasiado largo.";
    else if (field === "asunto" && /[\r\n]/.test(value))
      issues[field] = "El asunto debe ocupar una sola línea.";
    else {
      const remaining = value.replace(
        /{{\s*([^{}]+?)\s*}}/g,
        (_match, variable: string) => {
          if (
            !(quotationVariables as readonly string[]).includes(variable.trim())
          )
            issues[field] = `Variable desconocida: ${variable.trim()}.`;
          return "";
        },
      );
      if (remaining.includes("{{") || remaining.includes("}}"))
        issues[field] = "Revisa las llaves de las variables.";
    }
  }
  return issues;
}
export const quotationTemplateSchema = z
  .object({ asunto: z.string(), cuerpo: z.string() })
  .strict()
  .superRefine((value, ctx) => {
    for (const [field, message] of Object.entries(
      quotationTemplateIssues(value),
    ))
      ctx.addIssue({ code: "custom", path: [field], message });
  });
export function quotationTemplate(db: Database): QuotationTemplate {
  const row = db.plantilla_correo?.find(
    (item) => item.tipo_evento === quotationEvent,
  );
  return row
    ? { asunto: row.asunto, cuerpo: row.cuerpo }
    : { ...defaultQuotationTemplate };
}
export const materialQuotationSchema = z
  .object({
    demanda: materialDemandSchema,
    materiales: z
      .array(
        z
          .object({
            id_material: idSchema,
            adicional_pct: z.number().finite().min(5).max(10),
            cantidad: z.number().int().positive().refine(Number.isSafeInteger),
            proveedor_ids: z.array(idSchema),
          })
          .strict(),
      )
      .min(1),
    destinatarios: z.array(
      z
        .object({
          id_proveedor: idSchema,
          id_contacto: idSchema.nullable(),
          correo: z.string(),
        })
        .strict(),
    ),
    plantilla: quotationTemplateSchema,
  })
  .strict();
export type MaterialQuotationDraft = z.infer<typeof materialQuotationSchema>;
export type QuotationRecipient =
  MaterialQuotationDraft["destinatarios"][number];
export function quotationRecipientAddress(
  db: Database,
  recipient: QuotationRecipient | undefined,
) {
  if (!recipient) return "";
  if (!recipient.id_contacto) return recipient.correo.trim();
  return (
    db.contacto.find(
      (contact) =>
        contact.id === recipient.id_contacto &&
        contact.id_proveedor === recipient.id_proveedor,
    )?.correo ?? ""
  );
}
export type QuotationMessage = {
  id_material: string;
  id_proveedor: string;
  material: string;
  proveedor: string;
  recipient: { address: string; name: string; type: "para" };
  subject: string;
  body: string;
};
export type MaterialQuotationPreview = {
  materiales: {
    id_material: string;
    material: string;
    codigo_maia: string;
    tipo_material: string;
    cantidad_base: number;
    cantidad: number;
    adicional_pct: number;
    fecha_entrega: string;
  }[];
  messages: QuotationMessage[];
  issues: Record<string, string>;
  revision: string;
};
export function quotationContacts(db: Database, provider: string) {
  const contacts = db.contacto.filter(
    (c) => c.id_proveedor === provider && c.correo && validEmail(c.correo),
  );
  const areas = new Set(
    db.destinatario_evento
      .filter(
        (r) =>
          r.tipo_evento === quotationEvent &&
          r.tipo_contacto === "proveedor" &&
          r.tipo_destinatario === "para",
      )
      .map((r) => canonical(r.cargo_area)),
  );
  const seen = new Set<string>();
  const suggested = contacts.filter((contact) => {
    const email = contact.correo!.toLowerCase();
    if (!areas.has(canonical(contact.cargo_area ?? "")) || seen.has(email))
      return false;
    seen.add(email);
    return true;
  });
  return { contacts, suggested };
}
export function suggestedQuotationRecipient(
  db: Database,
  id_proveedor: string,
): QuotationRecipient {
  const contacts = quotationContacts(db, id_proveedor).suggested;
  return {
    id_proveedor,
    id_contacto: contacts.length === 1 ? contacts[0].id : null,
    correo: contacts.length === 1 ? contacts[0].correo! : "",
  };
}
export function createMaterialQuotation(
  db: Database,
  demanda: MaterialDemand,
): MaterialQuotationDraft {
  const materiales = groupMaterialSources(demanda.fuentes).map((group) => ({
    id_material: group.id_material,
    adicional_pct: group.adicional_pct,
    cantidad: group.cantidad_solicitada,
    proveedor_ids: [...favoriteSupplierIds(db, [group.id_material])],
  }));
  return {
    demanda,
    materiales,
    plantilla: quotationTemplate(db),
    destinatarios: [...new Set(materiales.flatMap((m) => m.proveedor_ids))].map(
      (id) => suggestedQuotationRecipient(db, id),
    ),
  };
}
/** Refresh only the selected origins. Keep manual quantities, supplier choices and template edits. */
export function refreshMaterialQuotation(
  db: Database,
  draft: MaterialQuotationDraft,
): MaterialQuotationDraft {
  const current = new Map(
    needsInRange(
      buildMaterialNeeds(db),
      draft.demanda.desde,
      draft.demanda.hasta,
    ).map((need) => [need.key, need.source]),
  );
  const demanda = {
    ...draft.demanda,
    fuentes: draft.demanda.fuentes.flatMap((source) => {
      const next = current.get(
        `${source.id_orden_producto}/${source.id_material}`,
      );
      return next ? [next] : [];
    }),
  };
  const previous = new Map(
    groupMaterialSources(draft.demanda.fuentes).map((group) => [
      group.id_material,
      group,
    ]),
  );
  const materiales = groupMaterialSources(demanda.fuentes).map((group) => {
    const old = draft.materiales.find(
      (item) => item.id_material === group.id_material,
    )!;
    return {
      ...old,
      cantidad:
        old.cantidad ===
        demandQuantity(
          previous.get(group.id_material)!.cantidad_base,
          old.adicional_pct,
        )
          ? demandQuantity(group.cantidad_base, old.adicional_pct)
          : old.cantidad,
      proveedor_ids: old.proveedor_ids.filter((id) =>
        db.proveedor.some((p) => p.id === id && p.Es_materiales === true),
      ),
    };
  });
  const providers = new Set(materiales.flatMap((m) => m.proveedor_ids));
  return {
    ...draft,
    demanda,
    materiales,
    destinatarios: draft.destinatarios.filter((r) =>
      providers.has(r.id_proveedor),
    ),
  };
}
