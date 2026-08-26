"use client";

import { Bell } from "lucide-react";
import { FormEvent, useState } from "react";

import type { Locale } from "@/modules/i18n/config";

import styles from "./public.module.css";

const copy = {
  en: {
    email: "Work email",
    incidents: "Incidents",
    maintenance: "Maintenance",
    submit: "Subscribe by email",
    submitting: "Subscribing…",
    success: "Check your email to confirm the subscription.",
    error: "The subscription could not be created. Please try again.",
    telegram: "Subscribe on Telegram",
    webex: "Message the Webex bot",
    unsubscribe: "Manage or unsubscribe",
  },
  it: {
    email: "Email di lavoro",
    incidents: "Incidenti",
    maintenance: "Manutenzioni",
    submit: "Iscriviti via email",
    submitting: "Iscrizione…",
    success: "Controlla la tua email per confermare l'iscrizione.",
    error: "Non è stato possibile completare l'iscrizione. Riprova.",
    telegram: "Iscriviti su Telegram",
    webex: "Scrivi al bot Webex",
    unsubscribe: "Gestisci o annulla l’iscrizione",
  },
} as const;

export function SubscribeForm({ locale, telegramUsername, webexBotEmail }: { locale: Locale; telegramUsername?: string; webexBotEmail?: string }) {
  const t = copy[locale];
  const telegramBot = telegramUsername?.replace(/^@/, "");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          language: locale,
          receiveIncidents: form.get("receiveIncidents") === "on",
          receiveMaintenance: form.get("receiveMaintenance") === "on",
        }),
      });
      if (!response.ok) throw new Error("Subscription rejected");
      event.currentTarget.reset();
      setState("success");
    } catch {
      setState("error");
    }
  }

  return (
    <form className={styles.subscriptionForm} onSubmit={submit}>
      <label className={styles.emailField}>
        <span className={styles.visuallyHidden}>{t.email}</span>
        <input name="email" type="email" autoComplete="email" placeholder={t.email} maxLength={320} required />
      </label>
      <div className={styles.subscriptionChoices}>
        <label><input name="receiveIncidents" type="checkbox" defaultChecked /> {t.incidents}</label>
        <label><input name="receiveMaintenance" type="checkbox" defaultChecked /> {t.maintenance}</label>
      </div>
      <button type="submit" disabled={state === "submitting"}>
        <Bell size={17} aria-hidden="true" />{state === "submitting" ? t.submitting : t.submit}
      </button>
      <p className={state === "error" ? styles.formError : styles.formMessage} role="status" aria-live="polite">
        {state === "success" ? t.success : state === "error" ? t.error : ""}
      </p>
      {(telegramBot || webexBotEmail) && <div className={styles.botLinks}>
        {telegramBot && <a href={`https://t.me/${telegramBot}?start=${locale}`} target="_blank" rel="noreferrer">{t.telegram}</a>}
        {webexBotEmail && <a href={`webexteams://im?email=${encodeURIComponent(webexBotEmail)}&message=${encodeURIComponent(`subscribe ${locale}`)}`}>{t.webex}</a>}
      </div>}
      <div className={styles.botLinks}><a href={`/${locale}/unsubscribe`}>{t.unsubscribe}</a></div>
    </form>
  );
}
