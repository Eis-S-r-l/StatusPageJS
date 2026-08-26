import type { EmailLocale } from "@/modules/notifications/email-templates";

export function localizedResultPage(input: { locale: EmailLocale; title: string; message: string; ok: boolean; status?: number }): Response {
  const home = `/${input.locale}`;
  const back = input.locale === "it" ? "Torna alla pagina di stato" : "Back to the status page";
  const html = `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(input.title)}</title><style>body{font-family:Arial,sans-serif;margin:0;background:#f4f6f5;color:#15201b;display:grid;min-height:100vh;place-items:center}.card{width:min(520px,calc(100% - 40px));box-sizing:border-box;padding:38px;border:1px solid #dfe7e2;border-radius:16px;background:#fff;text-align:center;box-shadow:0 16px 45px #14221d14}.mark{width:48px;height:48px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:${input.ok ? "#e5f6ef" : "#fcebe9"};color:${input.ok ? "#087f5b" : "#c85148"};font-size:24px}h1{font-size:26px;margin:0 0 14px}p{line-height:1.6;color:#66756e}a{display:inline-block;margin-top:12px;padding:11px 18px;border-radius:8px;background:#087f5b;color:#fff;text-decoration:none;font-weight:bold}</style></head><body><main class="card"><div class="mark">${input.ok ? "✓" : "!"}</div><h1>${escape(input.title)}</h1><p>${escape(input.message)}</p><a href="${home}">${back}</a></main></body></html>`;
  return new Response(html, { status: input.status ?? (input.ok ? 200 : 400), headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
