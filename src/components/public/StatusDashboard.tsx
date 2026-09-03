import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Radio } from "lucide-react";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { PublicStatusSnapshot, StatusEvent } from "@/modules/status/types";
import { eventStateLabel, formatDateTime } from "./format";
import { SubscribeForm } from "./SubscribeForm";
import { turnstileSiteKey } from "@/modules/subscriptions/turnstile-config";
import { sortLocalizedByOrder } from "@/modules/status/ordering";
import { EventCard } from "./EventCard";
import { ServiceCategories, type ServiceCategoryContent } from "./ServiceCategories";
import { ServiceStatusBadge } from "./ServiceStatusBadge";
import { UptimeHistory } from "./UptimeHistory";
import { UpcomingMaintenanceList } from "./UpcomingMaintenanceList";
import { eventPreviewExcerpt } from "./event-preview";
import { MaintenanceCalendarSubscription } from "./MaintenanceCalendarSubscription";
import { maintenanceFeedUrl } from "@/modules/calendar/maintenance-calendar";
import styles from "./public.module.css";

function EventPreview({ event, locale }: { event: StatusEvent; locale: Locale }) {
  const t = getDictionary(locale);
  const href = `/${locale}/${event.kind === "incident" ? "incidents" : "maintenance"}/${event.slug}`;
  const excerpt = eventPreviewExcerpt(event.summary[locale]);
  return (
    <Link className={styles.eventPreview} href={href}>
      <span className={styles.eventPreviewContent}>
        <span className={styles.eventPreviewMeta}>
          <span>{event.kind === "maintenance" ? t.scheduledFor : eventStateLabel(event.state, t)}</span>
          <time dateTime={event.startsAt}>{formatDateTime(event.startsAt, locale)}</time>
        </span>
        <strong>{event.title[locale]}</strong>
        {excerpt ? <span className={styles.eventPreviewExcerpt}>{excerpt}</span> : null}
      </span>
      <ArrowRight className={styles.eventPreviewArrow} size={18} aria-hidden="true" />
    </Link>
  );
}

export function StatusDashboard({ snapshot, locale, title, collapsedCategoryIds }: { snapshot: PublicStatusSnapshot; locale: Locale; title: string; collapsedCategoryIds: string[] }) {
  const t = getDictionary(locale);
  const overall = snapshot.overallState;
  const categoryContent: ServiceCategoryContent[] = sortLocalizedByOrder(snapshot.categories, locale).map((category) => ({
    id: category.id,
    name: category.name[locale],
    content: <div className={styles.serviceList}>
      {sortLocalizedByOrder(category.services, locale).map((service) => (
        <article className={styles.service} key={service.id}>
          <div className={styles.serviceMeta}>
            <div><h4>{service.name[locale]}</h4><p>{service.description[locale]}</p><ServiceStatusBadge state={service.state} label={t.status[service.state]} /></div>
            <div className={styles.uptime}><strong>{service.uptimePercentage}</strong><span>{t.uptime}</span></div>
          </div>
          <UptimeHistory serviceName={service.name[locale]} days={service.history} locale={locale} labels={{ history: t.last60Days.replace("{days}", String(snapshot.uptimeIntervalDays)), noEvents: t.noDayEvents, events: t.dayEvents, states: t.status }} />
          <div className={styles.historyLabels} aria-hidden="true"><span>{t.daysAgo.replace("{days}", String(snapshot.uptimeIntervalDays))}</span><span>{t.today}</span></div>
        </article>
      ))}
    </div>,
  }));
  return (
    <main id="main-content">
      <section className={styles.hero} aria-labelledby="page-title">
        <p className={styles.eyebrow}>{t.liveHealth}</p>
        <h1 id="page-title">{title}</h1>
        <p className={styles.intro}>{t.intro}</p>
        <div className={`${styles.statusBanner} ${styles[overall]}`}>
          <div className={styles.statusHeadline} role="status">
            <span className={styles.statusIcon} aria-hidden="true">{overall === "operational" ? <Check /> : <AlertTriangle />}</span>
            <span className={styles.statusCopy}><strong>{t.overall[overall]}</strong><span>{t.lastUpdated} <time dateTime={snapshot.lastUpdatedAt}>{formatDateTime(snapshot.lastUpdatedAt, locale)}</time></span></span>
            <span className={styles.current}><Radio size={14} aria-hidden="true" /> {t.live}</span>
          </div>
          {snapshot.activeIncidents.length ? <div className={styles.eventPreviewList} role="group" aria-label={t.activeTitle}>{snapshot.activeIncidents.map((event) => <EventPreview key={event.slug} event={event} locale={locale} />)}</div> : null}
        </div>
        {snapshot.maintenancePreview.length ? <section className={styles.maintenanceBanner} aria-labelledby="maintenance-preview-title">
          <div className={styles.maintenanceHeadline}>
            <span className={styles.maintenanceIcon} aria-hidden="true"><CalendarClock /></span>
            <span><strong id="maintenance-preview-title">{t.maintenanceTitle}</strong><span>{t.maintenancePreviewWindow.replace("{days}", String(snapshot.maintenancePreviewDays))}</span></span>
          </div>
          <div className={styles.eventPreviewList}>{snapshot.maintenancePreview.map((event) => <EventPreview key={event.slug} event={event} locale={locale} />)}</div>
        </section> : null}
      </section>

      <section className={styles.section} aria-labelledby="services-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.servicesEyebrow}</p><h2 id="services-title">{t.servicesTitle}</h2></div><span>{t.uptimePeriod}: {snapshot.uptimeIntervalDays} {t.days}</span></div>
        <div className={styles.legend} aria-label={t.historyLegend}>
          {(["operational", "degraded", "outage", "maintenance"] as const).map((state) => <span key={state}><i className={styles[state]} />{t.availability[state]}</span>)}
        </div>
        <ServiceCategories categoryContent={categoryContent} collapsedCategoryIds={collapsedCategoryIds} labels={{ expandCategory: t.expandCategory, collapseCategory: t.collapseCategory }} />
      </section>

      <section className={styles.section} aria-labelledby="active-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.activeEyebrow}</p><h2 id="active-title">{t.activeTitle}</h2></div></div>
        {snapshot.activeIncidents.length ? <div className={styles.eventList}>{snapshot.activeIncidents.map((event) => <EventCard key={event.slug} event={event} locale={locale} />)}</div> : <div className={styles.empty}><Check aria-hidden="true" /><div><strong>{t.noActive}</strong><p>{t.noActiveBody}</p></div></div>}
      </section>

      <section className={styles.section} aria-labelledby="maintenance-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.maintenanceEyebrow}</p><h2 id="maintenance-title">{t.maintenanceTitle}</h2></div><MaintenanceCalendarSubscription feedUrl={maintenanceFeedUrl(locale)} locale={locale} /></div>
        {snapshot.upcomingMaintenance.length ? <UpcomingMaintenanceList events={snapshot.upcomingMaintenance} locale={locale} /> : <div className={styles.empty}>{t.noMaintenance}</div>}
      </section>

      <section className={styles.section} aria-labelledby="recent-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.recentEyebrow}</p><h2 id="recent-title">{t.recentTitle}</h2></div><div className={styles.historyLinks}><Link href={`/${locale}/incidents`}>{t.viewAllIncidents}</Link><Link href={`/${locale}/maintenance`}>{t.viewAllMaintenance}</Link></div></div>
        <div className={styles.eventList}>{snapshot.recentEvents.map((event) => <EventCard key={event.slug} event={event} locale={locale} />)}</div>
      </section>

      <section className={styles.subscribePanel} id="subscribe" aria-labelledby="subscribe-title">
        <div><p className={styles.eyebrow}>{t.subscribe}</p><h2 id="subscribe-title">{t.subscribeTitle}</h2><p>{t.subscribeBody}</p></div>
        <SubscribeForm locale={locale} telegramUsername={process.env.TELEGRAM_BOT_USERNAME} turnstileSiteKey={turnstileSiteKey()} webexBotEmail={process.env.WEBEX_BOT_EMAIL} />
      </section>
    </main>
  );
}
