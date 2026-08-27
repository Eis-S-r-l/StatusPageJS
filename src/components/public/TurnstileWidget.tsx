"use client";

import Script from "next/script";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { Locale } from "@/modules/i18n/config";

import styles from "./public.module.css";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileWidgetHandle = {
  reset: () => void;
};

const copy = {
  en: {
    label: "Security check",
    unavailable: "The security check could not load. Please refresh the page and try again.",
  },
  it: {
    label: "Controllo di sicurezza",
    unavailable: "Non è stato possibile caricare il controllo di sicurezza. Aggiorna la pagina e riprova.",
  },
} as const;

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, {
  action: "subscribe" | "unsubscribe";
  locale: Locale;
  onToken: (token: string) => void;
  siteKey: string;
}>(function TurnstileWidget({ action, locale, onToken, siteKey }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [scriptFailed, setScriptFailed] = useState(false);
  const t = copy[locale];

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current !== null) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      theme: "auto",
      language: locale,
      size: "flexible",
      "response-field": false,
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(""),
      "error-callback": () => onTokenRef.current(""),
      "timeout-callback": () => onTokenRef.current(""),
    });
  }, [action, locale, siteKey]);

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current("");
      if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current);
    },
  }), []);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetIdRef.current !== null) window.turnstile?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [renderWidget]);

  return (
    <div className={styles.turnstileField} aria-label={t.label}>
      <div ref={containerRef} />
      {scriptFailed && <p className={styles.formError} role="alert">{t.unavailable}</p>}
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
        onError={() => {
          setScriptFailed(true);
          onTokenRef.current("");
        }}
      />
    </div>
  );
});
