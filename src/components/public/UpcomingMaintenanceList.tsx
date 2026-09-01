"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";

import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { StatusEvent } from "@/modules/status/types";

import { eventPreviewExcerpt } from "./event-preview";
import { eventStateLabel, formatDateTime } from "./format";
import styles from "./public.module.css";

export const INITIAL_MAINTENANCE_COUNT = 3;

export function visibleUpcomingMaintenance(events: StatusEvent[], expanded: boolean): StatusEvent[] {
  return expanded ? events : events.slice(0, INITIAL_MAINTENANCE_COUNT);
}

function UpcomingMaintenanceCard({ event, locale }: { event: StatusEvent; locale: Locale }) {
  const t = getDictionary(locale);
  const excerpt = eventPreviewExcerpt(event.summary[locale]);
  const href = `/${locale}/maintenance/${event.slug}`;

  return <article className={styles.eventCard}>
    <div className={styles.eventTopline}>
      <span className={`${styles.eventState} ${styles[event.state]}`}>{eventStateLabel(event.state, t)}</span>
      <time dateTime={event.startsAt}>{formatDateTime(event.startsAt, locale)}</time>
    </div>
    <h3>{event.title[locale]}</h3>
    {excerpt && <p className={styles.upcomingMaintenanceExcerpt}>{excerpt}</p>}
    <div className={styles.upcomingMaintenanceActions}><Link href={href}>{t.viewDetails} <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </article>;
}

export function UpcomingMaintenanceList({ events, locale }: { events: StatusEvent[]; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const t = getDictionary(locale);
  const visibleEvents = visibleUpcomingMaintenance(events, expanded);

  return <>
    <div className={styles.eventList} id={listId}>{visibleEvents.map((event) => <UpcomingMaintenanceCard key={event.slug} event={event} locale={locale} />)}</div>
    {events.length > INITIAL_MAINTENANCE_COUNT && <button className={styles.showMoreButton} type="button" aria-controls={listId} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? t.showLessMaintenance : t.showMoreMaintenance}</button>}
  </>;
}
