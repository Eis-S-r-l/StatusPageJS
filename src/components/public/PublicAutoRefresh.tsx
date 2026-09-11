"use client";

import { startTransition, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/modules/i18n/config";
import { PublicRefreshController } from "./refresh-controller";
import styles from "./public.module.css";

export function PublicAutoRefresh({ locale, renderedAt }: { locale: Locale; renderedAt: string }) {
  const router = useRouter();
  const [controller] = useState(() => new PublicRefreshController({
    renderedAt,
    refresh: () => startTransition(() => router.refresh()),
    visible: () => document.visibilityState === "visible",
    online: () => navigator.onLine,
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);

  useEffect(() => {
    controller.start();
    document.addEventListener("visibilitychange", controller.refresh);
    window.addEventListener("online", controller.refresh);
    window.addEventListener("offline", controller.offline);
    return () => {
      controller.stop();
      document.removeEventListener("visibilitychange", controller.refresh);
      window.removeEventListener("online", controller.refresh);
      window.removeEventListener("offline", controller.offline);
    };
  }, [controller]);

  useEffect(() => { controller.acknowledge(renderedAt); }, [controller, renderedAt]);

  const unavailable = state === "unavailable";
  const text = locale === "it"
    ? unavailable ? "Aggiornamenti non disponibili. Le informazioni mostrate potrebbero non essere aggiornate." : state === "refreshing" ? "Aggiornamento in corso…" : "Aggiornamento automatico ogni 30 secondi."
    : unavailable ? "Updates are unavailable. The information shown may be out of date." : state === "refreshing" ? "Checking for updates…" : "Updates automatically every 30 seconds.";
  return <div className={`${styles.refreshStatus} ${unavailable ? styles.refreshUnavailable : ""}`}>
    <span role="status" aria-live={unavailable ? "polite" : "off"}>{text}</span>
    {unavailable && <button type="button" onClick={controller.refresh}>{locale === "it" ? "Riprova" : "Try again"}</button>}
  </div>;
}
