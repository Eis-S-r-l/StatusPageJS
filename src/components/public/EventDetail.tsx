import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Info } from "lucide-react";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { ServiceCategory, StatusEvent } from "@/modules/status/types";
import { eventStateLabel, formatDateTime } from "./format";
import styles from "./public.module.css";

function duration(start: string, end: string | null, locale: Locale) {
  if (!end) return locale === "it" ? "In corso" : "Ongoing";
  const minutes = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function EventDetail({ event, categories, locale }: { event: StatusEvent; categories: ServiceCategory[]; locale: Locale }) {
  const t = getDictionary(locale);
  const services = categories.flatMap((category) => category.services).filter((service) => event.affectedServiceIds.includes(service.id));
  return (
    <main className={styles.detailMain} id="main-content">
      <Link className={styles.back} href={`/${locale}`}><ArrowLeft size={17} aria-hidden="true" />{t.back}</Link>
      <article>
        <header className={styles.detailHeader}>
          <div className={styles.detailKicker}><span>{event.kind === "incident" ? t.incident : t.maintenance}</span><span className={`${styles.eventState} ${styles[event.state]}`}>{eventStateLabel(event.state, t)}</span></div>
          <h1>{event.title[locale]}</h1>
          <p>{event.summary[locale]}</p>
        </header>
        <dl className={styles.facts}>
          <div><dt><Calendar size={16} aria-hidden="true" />{t.started}</dt><dd><time dateTime={event.startsAt}>{formatDateTime(event.startsAt, locale)}</time></dd></div>
          {event.endsAt && <div><dt><Calendar size={16} aria-hidden="true" />{t.ended}</dt><dd><time dateTime={event.endsAt}>{formatDateTime(event.endsAt, locale)}</time></dd></div>}
          <div><dt><Clock size={16} aria-hidden="true" />{t.duration}</dt><dd>{duration(event.startsAt, event.endsAt, locale)}</dd></div>
          <div><dt>{t.affectedServices}</dt><dd>{services.map((service) => service.name[locale]).join(", ")}</dd></div>
        </dl>
        <section className={styles.timelineSection} aria-labelledby="timeline-title">
          <h2 id="timeline-title">{t.timeline}</h2>
          <ol className={styles.timeline}>
            {event.timeline.map((entry) => <li key={entry.id}><span className={styles.timelineDot} aria-hidden="true" /><div><div className={styles.timelineMeta}><strong>{eventStateLabel(entry.state, t)}</strong><time dateTime={entry.publishedAt}>{formatDateTime(entry.publishedAt, locale)}</time></div><p>{entry.message[locale]}</p></div></li>)}
          </ol>
        </section>
        {event.affectsUptime && <aside className={styles.disclosure}><Info size={18} aria-hidden="true" /><p>{t.disclosure}</p></aside>}
      </article>
    </main>
  );
}
