import Link from "next/link";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { StatusEvent } from "@/modules/status/types";
import { SafeRichText } from "@/components/content/SafeRichText";
import { EventDuration } from "./EventDuration";
import { eventStateLabel, formatDateTime } from "./format";
import styles from "./public.module.css";

export function EventDetail({ event, locale }: { event: StatusEvent; locale: Locale }) {
  const t = getDictionary(locale);
  const renderedAt = new Date().toISOString();
  return (
    <main className={styles.detailMain} id="main-content">
      <Link className={styles.back} href={`/${locale}`}><ArrowLeft size={17} aria-hidden="true" />{t.back}</Link>
      <article>
        <header className={styles.detailHeader}>
          <div className={styles.detailKicker}><span>{event.kind === "incident" ? t.incident : t.maintenance}</span><span className={`${styles.eventState} ${styles[event.state]}`}>{eventStateLabel(event.state, t)}</span></div>
          <h1>{event.title[locale]}</h1>
          <SafeRichText html={event.summary[locale]} className={styles.richText} />
        </header>
        <dl className={styles.facts}>
          <div><dt><Calendar size={16} aria-hidden="true" />{t.started}</dt><dd><time dateTime={event.startsAt}>{formatDateTime(event.startsAt, locale)}</time></dd></div>
          {event.endsAt && <div><dt><Calendar size={16} aria-hidden="true" />{t.ended}</dt><dd><time dateTime={event.endsAt}>{formatDateTime(event.endsAt, locale)}</time></dd></div>}
          <div><dt><Clock size={16} aria-hidden="true" />{t.duration}</dt><dd><EventDuration start={event.startsAt} end={event.endsAt} locale={locale} initialNow={renderedAt} /></dd></div>
          <div><dt>{t.affectedServices}</dt><dd>{event.affectedServices.map((service) => service.name[locale]).join(", ")}</dd></div>
        </dl>
        <section className={styles.timelineSection} aria-labelledby="timeline-title">
          <h2 id="timeline-title">{t.timeline}</h2>
          <ol className={styles.timeline}>
            {event.timeline.map((entry) => <li key={entry.id}><span className={styles.timelineDot} aria-hidden="true" /><div><div className={styles.timelineMeta}><strong>{eventStateLabel(entry.state, t)}</strong><time dateTime={entry.effectiveAt}>{formatDateTime(entry.effectiveAt, locale)}</time></div><SafeRichText html={entry.message[locale]} className={styles.richText} /></div></li>)}
          </ol>
        </section>
      </article>
    </main>
  );
}
