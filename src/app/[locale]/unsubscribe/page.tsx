import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/PublicShell";
import { UnsubscribeForm } from "@/components/public/UnsubscribeForm";
import styles from "@/components/public/public.module.css";
import { isLocale } from "@/modules/i18n/config";

export default async function UnsubscribePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const it = locale === "it";
  return <PublicShell locale={locale} alternatePath={`/${it ? "en" : "it"}/unsubscribe`}><main id="main-content" className={styles.main}><section className={styles.subscribeSection}><div><p className={styles.eyebrow}>{it ? "Notifiche" : "Notifications"}</p><h1>{it ? "Annulla l’iscrizione" : "Unsubscribe"}</h1><p>{it ? "Inserisci il tuo indirizzo email. Per proteggere la tua iscrizione, ti invieremo un link di conferma monouso." : "Enter your email address. To protect your subscription, we’ll send a one-time confirmation link."}</p></div><UnsubscribeForm locale={locale} /></section></main></PublicShell>;
}
