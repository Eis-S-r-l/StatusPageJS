import { NextRequest } from "next/server";

import { confirmEmailSubscription } from "@/modules/subscriptions/service";
import { localizedResultPage } from "@/modules/subscriptions/html-response";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const requestedLocale = request.nextUrl.searchParams.get("lang") === "it" ? "it" : "en";
  if (!token || token.length > 200) return localizedResultPage({ locale: requestedLocale, ok: false, title: requestedLocale === "it" ? "Link non valido" : "Invalid link", message: requestedLocale === "it" ? "Questo link di conferma non è valido." : "This confirmation link is invalid." });
  try {
    const locale = await confirmEmailSubscription(token);
    if (!locale) return localizedResultPage({ locale: requestedLocale, ok: false, title: requestedLocale === "it" ? "Link scaduto" : "Expired link", message: requestedLocale === "it" ? "Questo link non è valido, è scaduto o è già stato utilizzato." : "This link is invalid, expired, or has already been used." });
    return localizedResultPage({ locale, ok: true, title: locale === "it" ? "Iscrizione confermata" : "Subscription confirmed", message: locale === "it" ? "Riceverai gli aggiornamenti selezionati sullo stato dei servizi." : "You will receive the selected service status updates." });
  } catch {
    return localizedResultPage({ locale: requestedLocale, ok: false, status: 503, title: requestedLocale === "it" ? "Servizio non disponibile" : "Service unavailable", message: requestedLocale === "it" ? "La conferma è temporaneamente non disponibile. Riprova più tardi." : "Confirmation is temporarily unavailable. Please try again later." });
  }
}
