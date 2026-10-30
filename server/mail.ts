import { randomUUID } from "node:crypto";
import type { Database } from "../shared/models";
import type { Row } from "../shared/schema";
import { check } from "./integrity";

export type MailMessage = {
  from: string;
  recipients: Row[];
  body: string;
  subject?: string;
  documents: Row[];
  event: Database["correo_enviado"][number]["tipo_evento"];
};
export type MailTransport = (message: MailMessage) => Promise<string>;
export const simulatedTransport: MailTransport = async () =>
  `sim-${randomUUID()}`;

/** Prototype transport only; callers validate the complete batch before delivery. */
export async function deliverMail(
  db: Database,
  transport: MailTransport,
  message: MailMessage,
) {
  const messageId = await transport(message);
  check(
    typeof messageId === "string" && messageId.length,
    "El simulador no confirmó el envío.",
    "MAIL",
  );
  const row = {
    id_correo: messageId,
    remitente: message.from,
    tipo_evento: message.event,
    fecha_envio: new Date().toISOString(),
  };
  db.correo_enviado.push(row);
  for (const recipient of message.recipients)
    db.correo_enviado_destinatario.push({
      id_correo: messageId,
      remitente: message.from,
      destinatario: recipient.address,
      tipo_destinatario: recipient.type,
    });
  return row;
}
