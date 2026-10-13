import express from "express";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./store";
import { command, mailPreview } from "./domain";
import { BusinessError } from "./integrity";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = await JsonStore.open(
  process.env.PROTOTIPO_DATA_FILE || resolve(root, "data/database.json"),
);
const app = express();
app.use(express.json({ limit: "1mb" }));
app.get("/api/state", (_req, res) => res.json(store.snapshot()));
app.post("/api/commands", async (req, res) => {
  const result = await store.transaction((db) =>
    command(db, req.body.name, req.body.payload ?? {}),
  );
  res.json({ result });
});
app.post("/api/mail-preview", (req, res) =>
  res.json(mailPreview(store.snapshot(), req.body)),
);
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
app.get("/api/documents/:id/content", (req, res) => {
  const doc = store.snapshot().documento.find((d) => d.id === req.params.id);
  if (!doc) throw new BusinessError("El documento ya no existe.", "NOT_FOUND");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(doc.nombre_archivo)}</title><style>body{font:16px Segoe UI,sans-serif;margin:64px;color:#1e293b}header{color:#2563eb;border-bottom:2px solid;padding-bottom:20px}small{color:#475569}article{border:1px dashed #94a3b8;padding:48px;margin:32px 0;background:#f8fafc}button{padding:12px}@media print{button{display:none}}</style></head><body><header><strong>GIMED · Documento de demostración</strong></header><h1>${escape(doc.nombre_archivo)}</h1><small>Placeholder · ${escape(doc.tipo_documento)} · ${escape(doc.fecha_carga)}</small><article>Este archivo representa el documento asociado en el prototipo. Su contenido es ficticio y sirve para probar la consulta, descarga, impresión y resolución de adjuntos.</article><button onclick="window.print()">Imprimir documento</button></body></html>`;
  if (req.query.download)
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${doc.nombre_archivo.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    );
  res.type("html").send(html);
});
app.use(express.static(resolve(root, "dist")));
app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(resolve(root, "dist/index.html"));
});
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof BusinessError)
      res.status(err.code === "NOT_FOUND" ? 404 : 422).json({
        message: err.message,
        code: err.code,
        fields: err.fields,
        details: err.details,
      });
    else {
      console.error(err);
      res.status(500).json({
        message:
          "No se pudo completar la operación. Los datos guardados se conservan.",
        code: "SERVER",
      });
    }
  },
);
const port = Number(process.env.PROTOTIPO_API_PORT ?? 3001);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(
    `Servicio local: http://127.0.0.1:${port} · Datos: ${store.file}`,
  ),
);
server.on("error", (e) => {
  console.error("No se pudo iniciar el servicio local:", e.message);
  process.exitCode = 1;
});
