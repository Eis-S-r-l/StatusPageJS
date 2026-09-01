"use client";

import { useId, useState } from "react";

import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { StatusEvent } from "@/modules/status/types";

import { EventCard } from "./EventCard";
import styles from "./public.module.css";

export const INITIAL_MAINTENANCE_COUNT = 3;

export function visibleUpcomingMaintenance(events: StatusEvent[], expanded: boolean): StatusEvent[] {
  return expanded ? events : events.slice(0, INITIAL_MAINTENANCE_COUNT);
}

export function UpcomingMaintenanceList({ events, locale }: { events: StatusEvent[]; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const t = getDictionary(locale);
  const visibleEvents = visibleUpcomingMaintenance(events, expanded);

  return <>
    <div className={styles.eventList} id={listId}>{visibleEvents.map((event) => <EventCard key={event.slug} event={event} locale={locale} />)}</div>
    {events.length > INITIAL_MAINTENANCE_COUNT && <button className={styles.showMoreButton} type="button" aria-controls={listId} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? t.showLessMaintenance : t.showMoreMaintenance}</button>}
  </>;
}
