import { Upload } from "tus-js-client";
import { request } from "../../ui";
import type { Changes } from "../../shared/api/changes";
import type { Row } from "../../../shared/schema";

export type DocumentDraft = { tipo_documento: string; nombre_archivo: string; file?: File };
type Reservation = {
  id: string; key: string; token: string; signedUrl: string; resumableUrl: string;
  bucket: string; storageWarning: boolean;
};
type PendingUpload = { id: string; warnings: boolean; ready: boolean };
const pendingFiles = new WeakMap<File, Map<string, PendingUpload>>();

const mime = (file: File) => ({
  pdf: "application/pdf", jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}[file.name.split(".").at(-1)?.toLowerCase() ?? ""] ?? file.type);

export async function uploadDocument(
  file: File, metadata: Row, onProgress: (percent: number) => void = () => undefined,
): Promise<{ result: Row; changes: Changes; revision: number; storageWarning: boolean }> {
  let known = pendingFiles.get(file);
  if (!known) {
    known = new Map();
    pendingFiles.set(file, known);
  }
  const fingerprint = JSON.stringify(metadata);
  let pending = known.get(fingerprint);
  if (!pending) {
    const reservation: Reservation = await request("documentos/cargas", {
      ...metadata, nombre_archivo: metadata.nombre_archivo || file.name, tipo_mime: mime(file), bytes: file.size,
    });
    pending = { id: reservation.id, warnings: reservation.storageWarning, ready: false };
    known.set(fingerprint, pending);
    if (file.size <= 6 * 1024 ** 2) {
      const response = await fetch(reservation.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": mime(file), "x-upsert": "false" },
        body: file,
      });
      if (!response.ok) {
        known.delete(fingerprint);
        throw new Error("No se pudo cargar el archivo. Reintenta.");
      }
      onProgress(100);
    } else {
      try {
        await new Promise<void>((resolve, reject) => {
          const upload = new Upload(file, {
            endpoint: reservation.resumableUrl,
            headers: { "x-signature": reservation.token },
            chunkSize: 6 * 1024 ** 2,
            retryDelays: [0, 1000, 3000, 5000, 10000],
            uploadDataDuringCreation: true,
            storeFingerprintForResuming: false,
            metadata: { bucketName: reservation.bucket, objectName: reservation.key, contentType: mime(file) },
            onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)),
            onSuccess: () => resolve(),
            onError: reject,
          });
          upload.start();
        });
      } catch (error) {
        known.delete(fingerprint);
        throw error;
      }
    }
    pending.ready = true;
  }
  if (!pending.ready) throw new Error("La carga está en curso.");
  try {
    const saved = await request("documentos/cargas/" + pending.id + "/confirmar", {});
    known.delete(fingerprint);
    return { ...saved, storageWarning: pending.warnings };
  } catch (error) {
    if ((error as { code?: string }).code === "NOT_FOUND") known.delete(fingerprint);
    throw error;
  }
}
