import type { EmailLocale } from "@/modules/notifications/email-templates";

const headers = {
  "cache-control": "no-store",
  "content-type": "text/html; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export function localizedResultPage(input: { locale: EmailLocale; title: string; message: string; ok: boolean; status?: number }): Response {
  const home = `/${input.locale}`;
  const back = input.locale === "it" ? "Torna alla pagina di stato" : "Back to the status page";
  const html = `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(input.title)}</title><style>body{font-family:Arial,sans-serif;margin:0;background:#f4f6f5;color:#15201b;display:grid;min-height:100vh;place-items:center}.card{width:min(520px,calc(100% - 40px));box-sizing:border-box;padding:38px;border:1px solid #dfe7e2;border-radius:16px;background:#fff;text-align:center;box-shadow:0 16px 45px #14221d14}.mark{width:48px;height:48px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:${input.ok ? "#e5f6ef" : "#fcebe9"};color:${input.ok ? "#087f5b" : "#c85148"};font-size:24px}h1{font-size:26px;margin:0 0 14px}p{line-height:1.6;color:#66756e}a{display:inline-block;margin-top:12px;padding:11px 18px;border-radius:8px;background:#087f5b;color:#fff;text-decoration:none;font-weight:bold}</style></head><body><main class="card"><div class="mark">${input.ok ? "✓" : "!"}</div><h1>${escape(input.title)}</h1><p>${escape(input.message)}</p><a href="${home}">${back}</a></main></body></html>`;
  return new Response(html, { status: input.status ?? (input.ok ? 200 : 400), headers });
}

export function localizedSubscriptionConfirmationPage(input: {
  locale: EmailLocale;
  siteKey: string;
  token: string;
  error?: string;
  status?: number;
}): Response {
  const it = input.locale === "it";
  const title = it ? "Conferma la tua iscrizione" : "Confirm your subscription";
  const message = it
    ? "Completa il controllo di sicurezza, quindi premi il pulsante per ricevere gli aggiornamenti sullo stato dei servizi."
    : "Complete the security check, then press the button to receive service status updates.";
  const button = it ? "Conferma iscrizione" : "Confirm subscription";
  const unavailable = it
    ? "Il controllo di sicurezza richiede JavaScript. Abilitalo, aggiorna la pagina e riprova."
    : "The security check requires JavaScript. Enable it, refresh the page, and try again.";
  const html = `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(title)}</title><style>body{font-family:Arial,sans-serif;margin:0;background:#f4f6f5;color:#15201b;display:grid;min-height:100vh;place-items:center}.card{width:min(520px,calc(100% - 40px));box-sizing:border-box;padding:38px;border:1px solid #dfe7e2;border-radius:16px;background:#fff;text-align:center;box-shadow:0 16px 45px #14221d14}h1{font-size:26px;margin:0 0 14px}p{line-height:1.6;color:#66756e}.error{color:#c85148;font-weight:700}.challenge{display:flex;justify-content:center;margin:24px 0 18px}.button{display:inline-block;padding:11px 18px;border:0;border-radius:8px;background:#087f5b;color:#fff;font:inherit;font-weight:bold;cursor:pointer}.button:disabled{cursor:not-allowed;opacity:.48}</style><script>function confirmationVerified(){document.getElementById("confirm-button").disabled=false}function confirmationReset(){document.getElementById("confirm-button").disabled=true}</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head><body><main class="card"><h1>${escape(title)}</h1><p>${escape(message)}</p>${input.error ? `<p class="error" role="alert">${escape(input.error)}</p>` : ""}<form method="post" action="/api/subscribe/confirm?lang=${input.locale}"><input type="hidden" name="token" value="${escape(input.token)}"><div class="challenge"><div class="cf-turnstile" data-sitekey="${escape(input.siteKey)}" data-action="confirm_subscription" data-language="${input.locale}" data-theme="auto" data-callback="confirmationVerified" data-expired-callback="confirmationReset" data-error-callback="confirmationReset" data-timeout-callback="confirmationReset"></div></div><noscript><p class="error">${escape(unavailable)}</p></noscript><button id="confirm-button" class="button" type="submit" disabled>${escape(button)}</button></form></main></body></html>`;
  const responseHeaders = input.status === 429 ? { ...headers, "retry-after": "900" } : headers;
  return new Response(html, { status: input.status ?? 200, headers: responseHeaders });
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
