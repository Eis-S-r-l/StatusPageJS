import { sanitizeRichText } from "../content/rich-text";

export type EmailLocale = "en" | "it";

export interface EmailTemplate extends Record<string, unknown> {
  subject: string;
  text: string;
  html: string;
}

interface Brand {
  companyName: string;
  logoUrl?: string | null;
}

interface ActionEmail extends Brand {
  locale: EmailLocale;
  actionUrl: string;
}

interface EventEmail extends Brand {
  locale: EmailLocale;
  kind: "incident" | "maintenance";
  title: string;
  body: string;
  bodyHtml?: string;
  eventUrl: string;
  unsubscribeUrl: string;
  details?: Array<{ label: string; value: string }>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function absoluteUrl(value: string): string {
  return escapeHtml(value);
}

function layout(input: Brand & { locale: EmailLocale; title: string; body: string; bodyHtml?: string; actionLabel: string; actionUrl: string; details?: Array<{ label: string; value: string }>; footerLink?: { label: string; url: string } }): string {
  const company = escapeHtml(input.companyName);
  const logo = input.logoUrl
    ? `<img src="${absoluteUrl(input.logoUrl)}" alt="${company}" style="max-width:160px;max-height:54px;border:0;height:auto;outline:none;text-decoration:none">`
    : `<strong style="font-size:22px;letter-spacing:.08em;color:#ffffff">${company}</strong>`;
  const footerLink = input.footerLink
    ? `<p style="margin:8px 5px 0"><a href="${absoluteUrl(input.footerLink.url)}" style="color:#f3f3f3;text-decoration:underline">${escapeHtml(input.footerLink.label)}</a></p>`
    : "";
  const details = input.details?.length ? `<table role="presentation" align="center" cellpadding="10" cellspacing="0" border="0" width="100%" style="border:1px solid #9c9c9c;border-radius:6px;max-width:460px">${input.details.map((detail, index) => `<tr><td style="text-align:start;font-size:12px;color:#666">${escapeHtml(detail.label)}</td><td style="font-size:14px;font-weight:bold;text-align:start">${escapeHtml(detail.value)}</td></tr>${index < input.details!.length - 1 ? '<tr><td colspan="2" style="border-top:1px solid #ddd;padding:0"></td></tr>' : ""}`).join("")}</table>` : "";
  const body = input.bodyHtml ? `<div style="font-size:15px;line-height:1.6;margin:5px 0 24px">${input.bodyHtml}</div>` : `<p style="font-size:15px;line-height:1.6;text-align:center;white-space:pre-line;margin:5px 0 24px">${escapeHtml(input.body)}</p>`;
  return `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;background:#f3f3f3;color:#202020"><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden"><tr><td style="background:#282828;text-align:center;padding:20px">${logo}</td></tr><tr><td style="padding:30px 24px"><h1 style="font-size:24px;line-height:1.25;text-align:center;margin:0 0 20px">${escapeHtml(input.title)}</h1>${body}${details}<div style="text-align:center;margin:20px 0"><a href="${absoluteUrl(input.actionUrl)}" style="display:inline-block;background:#5929ff;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;font-weight:bold">${escapeHtml(input.actionLabel)}</a></div></td></tr><tr><td style="background:#282828;color:#f3f3f3;text-align:center;padding:20px;font-size:12px"><p style="margin:5px">© ${new Date().getUTCFullYear()} ${company}</p>${footerLink}</td></tr></table></body></html>`;
}

export function subscriptionConfirmationEmail(input: ActionEmail): EmailTemplate {
  const it = input.locale === "it";
  const subject = it ? "Conferma la tua iscrizione" : "Confirm your status updates";
  const body = it ? "Conferma il tuo indirizzo email per ricevere gli aggiornamenti sullo stato dei servizi." : "Confirm your email address to receive service status updates.";
  const label = it ? "Conferma iscrizione" : "Confirm subscription";
  return { subject, text: `${body}\n\n${label}: ${input.actionUrl}`, html: layout({ ...input, title: subject, body, actionLabel: label }) };
}

export function unsubscriptionConfirmationEmail(input: ActionEmail): EmailTemplate {
  const it = input.locale === "it";
  const subject = it ? "Conferma la disiscrizione" : "Confirm unsubscription";
  const body = it ? "Conferma la richiesta per eliminare definitivamente la tua iscrizione agli aggiornamenti." : "Confirm this request to permanently remove your status-update subscription.";
  const label = it ? "Conferma disiscrizione" : "Confirm unsubscription";
  return { subject, text: `${body}\n\n${label}: ${input.actionUrl}`, html: layout({ ...input, title: subject, body, actionLabel: label }) };
}

export function eventNotificationEmail(input: EventEmail): EmailTemplate {
  const it = input.locale === "it";
  const kind = input.kind === "incident" ? (it ? "Incidente" : "Incident") : (it ? "Manutenzione" : "Maintenance");
  const actionLabel = it ? "Visualizza dettagli" : "View details";
  const unsubscribeLabel = it ? "Gestisci o annulla l’iscrizione" : "Manage or unsubscribe";
  const subject = `${kind}: ${input.title}`;
  return {
    subject,
    text: `${subject}\n\n${input.body}\n\n${actionLabel}: ${input.eventUrl}\n${unsubscribeLabel}: ${input.unsubscribeUrl}`,
    html: layout({ ...input, title: subject, body: input.body || input.title, bodyHtml: input.bodyHtml ? sanitizeRichText(input.bodyHtml) : undefined, details: input.details, actionLabel, actionUrl: input.eventUrl, footerLink: { label: unsubscribeLabel, url: input.unsubscribeUrl } }),
  };
}

export const emailTemplateInternals = { escapeHtml };
