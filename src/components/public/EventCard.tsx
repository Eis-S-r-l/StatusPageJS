import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { StatusEvent } from "@/modules/status/types";
import { SafeRichText } from "@/components/content/SafeRichText";
import { eventStateLabel, formatDateTime } from "./format";
import styles from "./public.module.css";

export function EventCard({ event, locale }: { event: StatusEvent; locale: Locale }) {
  const t = getDictionary(locale);
  const href = `/${locale}/${event.kind === "incident" ? "incidents" : "maintenance"}/${event.slug}`;
  return (
    <article className={styles.eventCard}>
      <div className={styles.eventTopline}>
        <span className={`${styles.eventState} ${styles[event.state]}`}>{eventStateLabel(event.state, t)}</span>
        <time dateTime={event.startsAt}>{formatDateTime(event.startsAt, locale)}</time>
      </div>
      <h3><Link href={href}>{event.title[locale]}</Link></h3>
      <SafeRichText html={event.summary[locale]} className={styles.richText} />
      <div className={styles.eventFooter}>
        <span>{t.affectedServices}: {event.affectedServices.map((service) => service.name[locale]).join(", ")}</span>
        <Link href={href}>{t.viewDetails} <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    </article>
  );
}
