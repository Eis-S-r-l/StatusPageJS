"use client";

import { FormEvent, useCallback, useRef, useState } from "react";
import type { Locale } from "@/modules/i18n/config";
import styles from "./public.module.css";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./TurnstileWidget";

const copy = {
  en: { email: "Email address", submit: "Send confirmation", sending: "Sending…", success: "If this address is subscribed, a confirmation email is on its way.", error: "The request could not be completed. Please try again." },
  it: { email: "Indirizzo email", submit: "Invia conferma", sending: "Invio…", success: "Se l’indirizzo è iscritto, riceverai un’email di conferma.", error: "Non è stato possibile completare la richiesta. Riprova." },
} as const;

export function UnsubscribeForm({ locale, turnstileSiteKey }: { locale: Locale; turnstileSiteKey: string }) {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const handleTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);
  const t = copy[locale];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("sending");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), language: locale, "cf-turnstile-response": turnstileToken }) });
      if (!response.ok) throw new Error("Request rejected");
      formElement.reset(); setState("success");
    } catch { setState("error"); }
    finally { turnstileRef.current?.reset(); }
  }
  return <form className={styles.subscriptionForm} onSubmit={submit}><label className={styles.emailField}><span className={styles.visuallyHidden}>{t.email}</span><input name="email" type="email" autoComplete="email" placeholder={t.email} maxLength={320} required /></label><TurnstileWidget ref={turnstileRef} action="unsubscribe" locale={locale} onToken={handleTurnstileToken} siteKey={turnstileSiteKey} /><button type="submit" disabled={state === "sending" || !turnstileToken}>{state === "sending" ? t.sending : t.submit}</button><p className={state === "error" ? styles.formError : styles.formMessage} role="status" aria-live="polite">{state === "success" ? t.success : state === "error" ? t.error : ""}</p></form>;
}
