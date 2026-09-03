"use client";

import { CalendarSync, Check, ChevronDown, Copy, ExternalLink } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";

import styles from "./public.module.css";

const GOOGLE_SUBSCRIPTION_URL = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";
const OUTLOOK_SUBSCRIPTION_URL = "https://outlook.office.com/calendar/";

export function MaintenanceCalendarSubscription({ feedUrl, locale }: { feedUrl: string; locale: Locale }) {
  const t = getDictionary(locale);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const webcalUrl = feedUrl.replace(/^https?:/i, "webcal:");

  async function copyFeedAddress(): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(feedUrl);
      } else {
        inputRef.current?.select();
        if (!document.execCommand("copy")) throw new Error("Copy is unavailable");
      }
      return true;
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      return false;
    }
  }

  function openSubscription(provider: "google" | "outlook") {
    const url = provider === "google" ? GOOGLE_SUBSCRIPTION_URL : OUTLOOK_SUBSCRIPTION_URL;
    window.open(url, "_blank", "noopener,noreferrer");
    void copyFeedAddress().then((copied) => setMessage(copied ? t.calendarAddressCopied : t.copyCalendarAddressManually));
  }

  function copyOnly() {
    void copyFeedAddress().then((copied) => setMessage(copied ? t.calendarAddressCopied : t.copyCalendarAddressManually));
  }

  return (
    <details className={styles.calendarSubscription}>
      <summary><CalendarSync size={17} aria-hidden="true" />{t.subscribeMaintenanceCalendar}<ChevronDown className={styles.calendarMenuChevron} size={16} aria-hidden="true" /></summary>
      <div className={styles.calendarSubscriptionPopover}>
        <strong>{t.calendarSubscriptionTitle}</strong>
        <p>{t.calendarSubscriptionBody}</p>
        <div className={styles.calendarSubscriptionProviders}>
          <button type="button" onClick={() => openSubscription("google")}>{t.googleCalendar}<ExternalLink size={14} aria-hidden="true" /></button>
          <button type="button" onClick={() => openSubscription("outlook")}>{t.outlookCalendar}<ExternalLink size={14} aria-hidden="true" /></button>
          <a href={webcalUrl}>{t.openCalendarApp}<ExternalLink size={14} aria-hidden="true" /></a>
        </div>
        <label className={styles.visuallyHidden} htmlFor={inputId}>{t.calendarFeedAddress}</label>
        <div className={styles.calendarFeedField}>
          <input ref={inputRef} id={inputId} value={feedUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
          <button type="button" onClick={copyOnly} aria-label={t.copyCalendarAddress}><Copy size={15} aria-hidden="true" /></button>
        </div>
        <p className={styles.calendarSubscriptionHint}>{t.calendarSubscriptionHint}</p>
        <p className={styles.calendarCopyStatus} aria-live="polite">{message ? <><Check size={14} aria-hidden="true" />{message}</> : null}</p>
      </div>
    </details>
  );
}
