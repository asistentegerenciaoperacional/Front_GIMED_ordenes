/** Add the optional prototype template collection without rewriting any existing row. */
export function migrateQuotationTemplate(input: Record<string, unknown>) {
  if (Object.hasOwn(input, "plantilla_correo"))
    return { database: input, changed: false };
  return { database: { ...input, plantilla_correo: [] }, changed: true };
}
