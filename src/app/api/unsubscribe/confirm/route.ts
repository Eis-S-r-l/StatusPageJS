import { NextRequest } from "next/server";

import { localizedResultPage } from "@/modules/subscriptions/html-response";
import { confirmEmailUnsubscription } from "@/modules/subscriptions/service";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const requestedLocale = request.nextUrl.searchParams.get("lang") === "it" ? "it" : "en";
  if (!token || token.length > 200) return localizedResultPage({ locale: requestedLocale, ok: false, title: requestedLocale === "it" ? "Link non valido" : "Invalid link", message: requestedLocale === "it" ? "Questo link di disiscrizione non è valido." : "This unsubscription link is invalid." });
  try {
    const locale = await confirmEmailUnsubscription(token);
    if (!locale) return localizedResultPage({ locale: requestedLocale, ok: false, title: requestedLocale === "it" ? "Link scaduto" : "Expired link", message: requestedLocale === "it" ? "Questo link non è valido, è scaduto o è già stato utilizzato." : "This link is invalid, expired, or has already been used." });
    return localizedResultPage({ locale, ok: true, title: locale === "it" ? "Disiscrizione completata" : "Unsubscribed", message: locale === "it" ? "La tua iscrizione e le relative preferenze sono state eliminate definitivamente." : "Your subscription and its preferences have been permanently deleted." });
  } catch {
    return localizedResultPage({ locale: requestedLocale, ok: false, status: 503, title: requestedLocale === "it" ? "Servizio non disponibile" : "Service unavailable", message: requestedLocale === "it" ? "La disiscrizione è temporaneamente non disponibile. Riprova più tardi." : "Unsubscription is temporarily unavailable. Please try again later." });
  }
}
