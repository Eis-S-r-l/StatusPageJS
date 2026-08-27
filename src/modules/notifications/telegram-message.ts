import { richTextToTelegramHtml, sanitizeRichText } from "../content/rich-text";

interface TelegramEventMessage {
  locale: "en" | "it";
  kind: "incident" | "maintenance";
  title: string;
  body: string;
  bodyHtml?: string;
  eventUrl: string;
  details?: Array<{ label: string; value: string }>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function eventNotificationTelegramHtml(input: TelegramEventMessage): string {
  const italian = input.locale === "it";
  const kind = input.kind === "incident" ? (italian ? "Incidente" : "Incident") : (italian ? "Manutenzione" : "Maintenance");
  const body = richTextToTelegramHtml(input.bodyHtml ?? sanitizeRichText(input.body));
  const details = input.details?.map((detail) => `<p><strong>${escapeHtml(detail.label)}:</strong> ${escapeHtml(detail.value)}</p>`).join("") ?? "";
  const actionLabel = italian ? "Visualizza dettagli" : "View details";
  return `<h2>${escapeHtml(`${kind}: ${input.title}`)}</h2>${body}${details}<p><a href="${escapeHtml(input.eventUrl)}">${actionLabel}</a></p>`;
}
