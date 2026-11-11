import { useEffect, useState } from "react";
import type { comentario } from "../shared/models";
import { ControlForm, ControlTextArea } from "./components/controls";
import { confirmAction } from "./components/overlays";
import {
  ApiError,
  Button,
  Dialog,
  ErrorNotice,
  Field,
  Loading,
  request,
} from "./ui";

type Entry = comentario & { autor: string };
const timestamp = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export async function withCommentRemovalConfirmation<T>(
  save: (confirmed: Record<string, string>) => Promise<T>,
): Promise<T | undefined> {
  const confirmed: Record<string, string> = {};
  for (;;) {
    try {
      return await save(confirmed);
    } catch (failure) {
      if (!(failure instanceof ApiError) || failure.code !== "COMMENT_REMOVAL")
        throw failure;
      const { count, orderId, revision } = failure.details;
      if (
        !(await confirmAction(
          count === 1
            ? "Se eliminará un comentario del renglón afectado. ¿Continuar?"
            : `Se eliminarán ${count} comentarios de los renglones afectados. ¿Continuar?`,
          "Eliminar y guardar",
          true,
        ))
      )
        return;
      confirmed[orderId] = revision;
    }
  }
}

export function LineComments({
  tipo,
  id,
  name,
  onClose,
}: {
  tipo: "producto" | "material";
  id: string;
  name: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  useEffect(() => {
    let active = true;
    void request(`comentarios/${tipo}/${id}`).then(
      (data: Entry[]) => {
        if (active) setEntries(data);
      },
      (failure: ApiError) => {
        if (active) setError(failure);
      },
    );
    return () => {
      active = false;
    };
  }, [tipo, id]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved: Entry = await request("comentarios", {
        tipo,
        id,
        texto: draft,
      });
      setEntries((current) => [...(current ?? []), saved]);
      setDraft("");
    } catch (failure) {
      setError(failure as ApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Comentarios"
      subtitle={name}
      onClose={onClose}
      dirty={!!draft.trim()}
      busy={busy}
    >
      <ControlForm onSubmit={submit}>
        <div className="dialog-body">
          {error && <ErrorNotice error={error} />}
          {!entries && !error && <Loading />}
          {entries?.length === 0 && (
            <p>Este renglón todavía no tiene comentarios.</p>
          )}
          {!!entries?.length && (
            <ol className="comment-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.autor}</strong>
                  <time dateTime={entry.fecha_creacion}>
                    {timestamp.format(new Date(entry.fecha_creacion))}
                  </time>
                  <p>{entry.texto}</p>
                </li>
              ))}
            </ol>
          )}
          <Field id="line-comment" label="Nuevo comentario">
            <ControlTextArea
              id="line-comment"
              rows={3}
              maxLength={10000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
        </div>
        <div className="dialog-footer">
          <Button
            type="submit"
            variant="primary"
            disabled={!entries || !draft.trim() || busy}
          >
            Publicar comentario
          </Button>
        </div>
      </ControlForm>
    </Dialog>
  );
}
