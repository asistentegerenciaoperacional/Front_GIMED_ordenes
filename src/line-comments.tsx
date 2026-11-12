import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const editorRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const resize = () => {
      editor.style.height = "auto";
      editor.style.height = `${editor.scrollHeight}px`;
    };
    resize();
    const container = editor.parentElement;
    const observer = new ResizeObserver(resize);
    if (container) observer.observe(container);
    return () => observer.disconnect();
  }, [draft]);
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
      className="line-comments-dialog"
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
                  <span className="comment-avatar" aria-hidden="true">
                    {entry.autor.trim().charAt(0).toLocaleUpperCase("es")}
                  </span>
                  <div className="comment-content">
                    <div className="comment-meta">
                      <strong>{entry.autor}</strong>
                      <time dateTime={entry.fecha_creacion}>
                        {timestamp.format(new Date(entry.fecha_creacion))}
                      </time>
                    </div>
                    <p>{entry.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="dialog-footer comment-composer">
          <Field id="line-comment" label="Nuevo comentario">
            <ControlTextArea
              ref={editorRef}
              id="line-comment"
              rows={1}
              placeholder="Escribe un comentario…"
              maxLength={10000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
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
