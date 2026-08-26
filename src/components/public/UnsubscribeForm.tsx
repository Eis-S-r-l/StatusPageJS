"use client";

import { FormEvent, useState } from "react";
import type { Locale } from "@/modules/i18n/config";
import styles from "./public.module.css";

const copy = {
  en: { email: "Email address", submit: "Send confirmation", sending: "Sending…", success: "If this address is subscribed, a confirmation email is on its way.", error: "The request could not be completed. Please try again." },
  it: { email: "Indirizzo email", submit: "Invia conferma", sending: "Invio…", success: "Se l’indirizzo è iscritto, riceverai un’email di conferma.", error: "Non è stato possibile completare la richiesta. Riprova." },
} as const;

export function UnsubscribeForm({ locale }: { locale: Locale }) {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const t = copy[locale];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("sending");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), language: locale }) });
      if (!response.ok) throw new Error("Request rejected");
      event.currentTarget.reset(); setState("success");
    } catch { setState("error"); }
  }
  return <form className={styles.subscriptionForm} onSubmit={submit}><label className={styles.emailField}><span className={styles.visuallyHidden}>{t.email}</span><input name="email" type="email" autoComplete="email" placeholder={t.email} maxLength={320} required /></label><button type="submit" disabled={state === "sending"}>{state === "sending" ? t.sending : t.submit}</button><p className={state === "error" ? styles.formError : styles.formMessage} role="status" aria-live="polite">{state === "success" ? t.success : state === "error" ? t.error : ""}</p></form>;
}
