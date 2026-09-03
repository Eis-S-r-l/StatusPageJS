import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { PaginatedStatusEvents } from "@/modules/status/types";
import { EventCard } from "./EventCard";
import { MaintenanceCalendarSubscription } from "./MaintenanceCalendarSubscription";
import { maintenanceFeedUrl } from "@/modules/calendar/maintenance-calendar";
import styles from "./public.module.css";

type EventKind = "incident" | "maintenance";

function pageHref(path: string, page: number): string {
  return page === 1 ? path : `${path}?page=${page}`;
}

export function PublicEventIndex({ locale, kind, result }: { locale: Locale; kind: EventKind; result: PaginatedStatusEvents }) {
  const t = getDictionary(locale);
  const isIncident = kind === "incident";
  const path = `/${locale}/${isIncident ? "incidents" : "maintenance"}`;
  const otherPath = `/${locale}/${isIncident ? "maintenance" : "incidents"}`;
  const title = isIncident ? t.incidentsTitle : t.maintenanceHistoryTitle;
  const eyebrow = isIncident ? t.incidentsEyebrow : t.maintenanceHistoryEyebrow;
  const empty = isIncident ? t.noIncidents : t.noMaintenanceHistory;
  const otherLabel = isIncident ? t.viewAllMaintenance : t.viewAllIncidents;
  return (
    <main id="main-content">
      <section className={styles.historyHero} aria-labelledby="page-title">
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 id="page-title">{title}</h1>
        <p className={styles.intro}>{isIncident ? t.incidentsIntro : t.maintenanceHistoryIntro}</p>
        <div className={styles.historyHeroActions}>
          <Link className={styles.historyCrossLink} href={pageHref(otherPath, result.page)}>{otherLabel} <ArrowRight size={16} aria-hidden="true" /></Link>
          {!isIncident ? <MaintenanceCalendarSubscription feedUrl={maintenanceFeedUrl(locale)} locale={locale} /> : null}
        </div>
      </section>
      <section className={styles.section} aria-label={title}>
        {result.events.length ? <div className={styles.eventList}>{result.events.map((event) => <EventCard key={event.slug} event={event} locale={locale} />)}</div> : <div className={styles.empty}>{empty}</div>}
        <nav className={styles.pagination} aria-label={t.paginationLabel}>
          {result.page > 1 ? <Link href={pageHref(path, result.page - 1)}><ArrowLeft size={16} aria-hidden="true" />{t.previousPage}</Link> : <span />}
          <span>{t.pageCount.replace("{page}", String(result.page)).replace("{pages}", String(result.totalPages))}</span>
          {result.page < result.totalPages ? <Link href={pageHref(path, result.page + 1)}>{t.nextPage}<ArrowRight size={16} aria-hidden="true" /></Link> : <span />}
        </nav>
      </section>
    </main>
  );
}
