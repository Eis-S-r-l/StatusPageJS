import { NextRequest } from "next/server";

import { localizedResultPage, localizedSubscriptionConfirmationPage } from "@/modules/subscriptions/html-response";
import { allowSubscriptionRequest, requestClientIp, requestClientKey } from "@/modules/subscriptions/rate-limit";
import { confirmEmailSubscription, pendingEmailSubscriptionLocale } from "@/modules/subscriptions/service";
import { TurnstileConfigurationError, verifyTurnstileToken } from "@/modules/subscriptions/turnstile";
import { turnstileSiteKey } from "@/modules/subscriptions/turnstile-config";

type Locale = "en" | "it";

function requestedLocale(value: string | null): Locale {
  return value === "it" ? "it" : "en";
}

function invalidLink(locale: Locale) {
  return localizedResultPage({ locale, ok: false, title: locale === "it" ? "Link non valido" : "Invalid link", message: locale === "it" ? "Questo link di conferma non è valido." : "This confirmation link is invalid." });
}

function expiredLink(locale: Locale) {
  return localizedResultPage({ locale, ok: false, title: locale === "it" ? "Link scaduto" : "Expired link", message: locale === "it" ? "Questo link non è valido, è scaduto o è già stato utilizzato." : "This link is invalid, expired, or has already been used." });
}

function unavailable(locale: Locale) {
  return localizedResultPage({ locale, ok: false, status: 503, title: locale === "it" ? "Servizio non disponibile" : "Service unavailable", message: locale === "it" ? "La conferma è temporaneamente non disponibile. Riprova più tardi." : "Confirmation is temporarily unavailable. Please try again later." });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const locale = requestedLocale(request.nextUrl.searchParams.get("lang"));
  if (!token || token.length > 200) return invalidLink(locale);
  try {
    const pendingLocale = await pendingEmailSubscriptionLocale(token);
    if (!pendingLocale) return expiredLink(locale);
    return localizedSubscriptionConfirmationPage({ locale: pendingLocale, siteKey: turnstileSiteKey(), token });
  } catch {
    return unavailable(locale);
  }
}

export async function POST(request: NextRequest) {
  const fallbackLocale = requestedLocale(request.nextUrl.searchParams.get("lang"));
  try {
    const form = await request.formData();
    const token = form.get("token");
    const turnstileToken = form.get("cf-turnstile-response");
    if (typeof token !== "string" || token.length === 0 || token.length > 200) return invalidLink(fallbackLocale);

    const locale = await pendingEmailSubscriptionLocale(token);
    if (!locale) return expiredLink(fallbackLocale);
    if (!allowSubscriptionRequest(requestClientKey(request, "confirm-subscription"))) {
      return localizedSubscriptionConfirmationPage({
        locale,
        siteKey: turnstileSiteKey(),
        token,
        error: locale === "it" ? "Troppi tentativi. Riprova più tardi." : "Too many attempts. Please try again later.",
        status: 429,
      });
    }
    if (typeof turnstileToken !== "string" || turnstileToken.length === 0 || turnstileToken.length > 2048) {
      return localizedSubscriptionConfirmationPage({
        locale,
        siteKey: turnstileSiteKey(),
        token,
        error: locale === "it" ? "Il controllo di sicurezza non è riuscito. Riprova." : "Security verification failed. Please try again.",
        status: 403,
      });
    }
    const verified = await verifyTurnstileToken({ token: turnstileToken, expectedAction: "confirm_subscription", remoteIp: requestClientIp(request) });
    if (!verified) {
      return localizedSubscriptionConfirmationPage({
        locale,
        siteKey: turnstileSiteKey(),
        token,
        error: locale === "it" ? "Il controllo di sicurezza non è riuscito. Riprova." : "Security verification failed. Please try again.",
        status: 403,
      });
    }

    const confirmedLocale = await confirmEmailSubscription(token);
    if (!confirmedLocale) return expiredLink(locale);
    return localizedResultPage({ locale: confirmedLocale, ok: true, title: confirmedLocale === "it" ? "Iscrizione confermata" : "Subscription confirmed", message: confirmedLocale === "it" ? "Riceverai gli aggiornamenti selezionati sullo stato dei servizi." : "You will receive the selected service status updates." });
  } catch (error) {
    if (error instanceof TurnstileConfigurationError) console.error(error.message);
    return unavailable(fallbackLocale);
  }
}
