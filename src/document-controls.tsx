import { FileText, Info, Paperclip, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { schemas, type Row } from "../shared/schema";
import { type DocumentDraft, uploadDocument } from "./features/documentos/upload";
import { documentUrl, pilot } from "./shared/api/routes";
import {
  Action,
  ControlForm,
  ControlInput,
  ControlLink,
  ControlSelect,
} from "./components/controls";
import { confirmAction } from "./components/overlays";
import { entityValidation } from "./live-validation";
import {
  ApiError,
  Button,
  CancelButton,
  Dialog,
  ErrorNotice,
  Field,
  shortDate,
  text,
  useApp,
  useErrors,
} from "./ui";

export function Documents({
  owner,
  ownerId,
  compact = false,
  showList = true,
  renderAddTrigger,
  documents,
  draft,
  onDraftSave,
}: {
  owner: "factura" | "orden_compra" | "lote_material" | null;
  ownerId: string | null;
  compact?: boolean;
  showList?: boolean;
  renderAddTrigger?: (open: () => void) => ReactNode;
  documents?: readonly Row[];
  draft?: DocumentDraft;
  onDraftSave?: (draft: DocumentDraft) => void;
}) {
  const { db, run, notify, updateData } = useApp();
  const [editing, setEditing] = useState<Row | null | undefined>();
  const docs =
    documents ??
    db.documento.filter(
      (d) => d.tipo_entidad === owner && d.id_entidad === ownerId,
    );
  const types =
    owner === "factura"
      ? ["factura_fisica"]
      : owner === "orden_compra"
        ? ["orden_compra_escaneada"]
        : owner === "lote_material"
          ? ["certificado_calidad", "certificado_liberacion"]
          : ["plantilla_certificado_liberacion"];
  const availableTypes = types.filter(
    (type) => !docs.some((doc) => doc.tipo_documento === type),
  );
  const [name, setName] = useState(""),
    [kind, setKind] = useState(types[0]),
    [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState(0);
  const { error, catchError } = useErrors(
    entityValidation(
      "documento",
      {
        nombre_archivo: name,
        tipo_documento: kind,
        tipo_entidad: owner,
        id_entidad: ownerId,
      },
      db,
      editing ?? undefined,
    ),
  );
  function edit(doc?: Row) {
    const nextKind = doc?.tipo_documento ?? availableTypes[0];
    if (!nextKind) {
      notify("Ya existe el documento. Usa Reemplazar para corregirlo.", true);
      return;
    }
    setEditing(doc ?? null);
    setFile(draft?.file);
    setProgress(0);
    setName(
      doc?.nombre_archivo ??
        draft?.nombre_archivo ??
        (pilot ? "" : `${text(nextKind).replaceAll(" ", "-")}.html`),
    );
    setKind(nextKind);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const parsedName = schemas.documento.shape.nombre_archivo.safeParse(
        name.trim(),
      );
      if (!name.trim() || !parsedName.success)
        throw new ApiError({
          message: "Revisa el nombre del archivo.",
          fields: { nombre_archivo: "Indica un nombre de archivo válido." },
        });
      if (pilot && !file)
        throw new ApiError({ message: "Selecciona un archivo.", fields: { archivo: "Archivo obligatorio." } });
      if (onDraftSave) {
        onDraftSave({ tipo_documento: kind, nombre_archivo: name.trim(), file });
        setEditing(undefined);
        return;
      }
      if (pilot) {
        const saved = await uploadDocument(file!, {
          id: editing?.id, tipo_entidad: owner, id_entidad: ownerId, tipo_documento: kind, nombre_archivo: name.trim(),
        }, setProgress);
        await updateData(saved.changes, saved.revision);
        notify(saved.storageWarning ? "Documento guardado. El almacenamiento se acerca al límite." : "Documento guardado.");
      } else await run(
        "saveDocument",
        {
          id: editing?.id,
          tipo_entidad: owner,
          id_entidad: ownerId,
          tipo_documento: kind,
          nombre_archivo: name,
        },
        editing ? "Placeholder reemplazado" : "Placeholder agregado",
      );
      setEditing(undefined);
    } catch (e) {
      catchError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {showList && (
        <div className={compact ? "" : "panel-body"}>
          <div className="spread">
            <h3>
              Documentos{" "}
              {docs.length > 0 && (
                <span className="muted">({docs.length})</span>
              )}
            </h3>
            {availableTypes.length > 0 &&
              (renderAddTrigger ? (
                renderAddTrigger(() => edit())
              ) : (
                <Button icon={Plus} className="small" onClick={() => edit()}>
                  Agregar
                </Button>
              ))}
          </div>
          {docs.length === 0 ? (
            <div className="notice subtle" style={{ marginTop: 14 }}>
              <Paperclip size={16} aria-hidden="true" />
              Sin documentos adjuntos.
            </div>
          ) : (
            docs.map((d) => (
              <div className="doc-item" key={d.id}>
                <span className="doc-icon">
                  <FileText size={17} aria-hidden="true" />
                </span>
                <div className="doc-item-body">
                  <strong>{d.nombre_archivo}</strong>
                  <small>
                    {text(d.tipo_documento)} · {shortDate(d.fecha_carga)}
                  </small>
                  <div className="doc-actions">
                    <ControlLink
                      className="doc-action"
                      href={documentUrl(d.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver
                    </ControlLink>
                    <ControlLink
                      className="doc-action"
                      href={documentUrl(d.id, true)}
                    >
                      Descargar
                    </ControlLink>
                    <Action
                      type="button"
                      className="doc-action"
                      onClick={() => edit(d)}
                    >
                      Reemplazar
                    </Action>
                    <Action
                      type="button"
                      className="doc-action"
                      aria-label={`Eliminar ${d.nombre_archivo}`}
                      onClick={async () => {
                        if (await confirmAction(pilot ? "¿Eliminar este documento?" : "¿Eliminar este placeholder?"))
                          void run(
                            "deleteDocument",
                            { id: d.id },
                            pilot ? "Documento eliminado" : "Placeholder eliminado",
                          ).catch((e) => notify(e.message, true));
                      }}
                    >
                      Eliminar
                    </Action>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {!showList &&
        availableTypes.length > 0 &&
        renderAddTrigger?.(() => edit())}
      {editing !== undefined && (
        <Dialog
          title={editing ? (pilot ? "Reemplazar documento" : "Reemplazar placeholder") : (pilot ? "Agregar documento" : "Agregar placeholder")}
          subtitle={pilot ? "El tamaño máximo por archivo es de 25 MiB." : "El contenido será ficticio. Se conserva la relación con su propietario."}
          onClose={() => setEditing(undefined)}
        >
          <ControlForm onSubmit={save} fieldErrors={error?.fields}>
            <div className="dialog-body">
              <ErrorNotice error={error} />
              {pilot && (
                <Field id="field-archivo" label="Archivo" required error={error?.fields.archivo}>
                  <ControlInput type="file"
                    accept={kind === "plantilla_certificado_liberacion" ? ".pdf,.docx,.xlsx" : ".pdf,.png,.jpg,.jpeg"}
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      setFile(selected);
                      if (selected) setName(selected.name);
                    }}
                  />
                </Field>
              )}
              {pilot && busy && <progress aria-label="Progreso de carga" value={progress} max={100} />}
              <Field
                id="field-tipo_documento"
                label="Clase de documento"
                error={error?.fields.tipo_documento}
              >
                <ControlSelect
                  id="field-tipo_documento"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  disabled={!!editing}
                >
                  {types.map((t) => (
                    <option
                      key={t}
                      value={t}
                      disabled={!editing && !availableTypes.includes(t)}
                    >
                      {text(t)}
                    </option>
                  ))}
                </ControlSelect>
              </Field>
              <Field
                id="field-nombre_archivo"
                label="Nombre del archivo"
                required
                error={error?.fields.nombre_archivo}
              >
                <ControlInput
                  id="field-nombre_archivo"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <div className="notice subtle">
                <Info size={16} aria-hidden="true" />
                Únicamente se admite un documento. Reemplazar actualiza su
                registro vigente.
              </div>
            </div>
            <div className="dialog-footer">
              <CancelButton onClick={() => setEditing(undefined)}>
                Cancelar
              </CancelButton>
              <Button type="submit" variant="primary" disabled={busy}>
                {pilot ? (editing ? "Reemplazar documento" : "Guardar documento") : (editing ? "Reemplazar placeholder" : "Guardar placeholder")}
              </Button>
            </div>
          </ControlForm>
        </Dialog>
      )}
    </>
  );
}
