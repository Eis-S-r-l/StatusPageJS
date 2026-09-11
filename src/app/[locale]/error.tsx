"use client";

import { useParams } from "next/navigation";
import styles from "@/components/public/public.module.css";

export default function PublicPageError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { locale } = useParams<{ locale: string }>();
  const italian = locale === "it";
  return <main id="main-content" className={styles.page}>
    <section className={styles.hero}>
      <h1>{italian ? "Aggiornamenti temporaneamente non disponibili" : "Status updates are temporarily unavailable"}</h1>
      <p>{italian ? "Non è possibile verificare lo stato attuale dei servizi. Riprova tra poco." : "We cannot verify the current service status. Please try again shortly."}</p>
      <div className={styles.refreshStatus}><button type="button" onClick={retry}>{italian ? "Riprova" : "Try again"}</button></div>
    </section>
  </main>;
}
