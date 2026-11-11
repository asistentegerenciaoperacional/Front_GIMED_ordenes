import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Database, usuario } from "../shared/models";
import { idSchema, type Row } from "../shared/schema";
import { check } from "./integrity";

const targetSchema = z
  .object({
    tipo: z.enum(["producto", "material"]),
    id: idSchema,
  })
  .strict();
const postSchema = targetSchema.extend({
  texto: z.string().trim().min(1).max(10000),
});

function requireLine(db: Database, target: z.infer<typeof targetSchema>) {
  const rows =
    target.tipo === "producto" ? db.orden_producto : db.orden_material;
  check(
    rows.some((row) => row.id === target.id),
    "El renglón ya no existe.",
    "NOT_FOUND",
  );
}

export function lineComments(db: Database, input: unknown) {
  const target = targetSchema.safeParse(input);
  check(target.success, "Selecciona un renglón de producto o material.");
  requireLine(db, target.data);
  const field =
    target.data.tipo === "producto" ? "id_orden_producto" : "id_orden_material";
  const authors = new Map(db.usuario.map((user) => [user.id, user.nombre]));
  return db.comentario
    .filter((comment) => comment[field] === target.data.id)
    .sort(
      (a, b) =>
        a.fecha_creacion.localeCompare(b.fecha_creacion) ||
        a.id.localeCompare(b.id),
    )
    .map((comment) => ({ ...comment, autor: authors.get(comment.id_usuario) }));
}

export function addLineComment(db: Database, input: unknown, user: usuario) {
  const parsed = postSchema.safeParse(input);
  check(
    parsed.success,
    "Envía un comentario de 1 a 10.000 caracteres para un renglón válido.",
  );
  const { id, tipo, texto } = parsed.data;
  requireLine(db, { id, tipo });
  const comment = {
    id: randomBytes(12).toString("hex"),
    id_usuario: user.id,
    id_orden_producto: tipo === "producto" ? id : null,
    id_orden_material: tipo === "material" ? id : null,
    texto,
    fecha_creacion: new Date().toISOString(),
  };
  db.comentario.push(comment);
  return { ...comment, autor: user.nombre };
}

export function removeCommentsForOrderEdit(
  db: Database,
  orderId: string,
  type: "producto" | "material",
  current: Row[],
  proposed: Row[],
  replace: boolean,
  confirmation: unknown,
) {
  const next = new Map(proposed.map((row) => [row.id, row]));
  const field = type === "producto" ? "id_producto" : "id_material";
  const affected = new Set(
    current
      .filter((row) => replace || next.get(row.id)?.[field] !== row[field])
      .map((row) => row.id),
  );
  const foreignKey =
    type === "producto" ? "id_orden_producto" : "id_orden_material";
  const isAffected = (comment: Database["comentario"][number]) => {
    const id = comment[foreignKey];
    return id !== null && affected.has(id);
  };
  const ids = db.comentario
    .filter(isAffected)
    .map((comment) => comment.id)
    .sort();
  if (!ids.length) return;
  const revision = createHash("sha256")
    .update(JSON.stringify(ids))
    .digest("hex");
  check(
    confirmation === revision,
    "Confirma la eliminación de los comentarios de los renglones afectados.",
    "COMMENT_REMOVAL",
    {},
    { count: ids.length, orderId, revision },
  );
  db.comentario = db.comentario.filter((comment) => !isAffected(comment));
}
