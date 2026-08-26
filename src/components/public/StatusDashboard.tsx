import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Info, Radio } from "lucide-react";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { PublicStatusSnapshot, ServiceCategory, StatusEvent } from "@/modules/status/types";
import { eventStateLabel, formatDateTime } from "./format";
import { SubscribeForm } from "./SubscribeForm";
import { SafeRichText } from "@/components/content/SafeRichText";
import styles from "./public.module.css";

function EventCard({ event, locale, categories }: { event: StatusEvent; locale: Locale; categories: ServiceCategory[] }) {
  const t = getDictionary(locale);
  const serviceNames = categories.flatMap((category) => category.services).filter((service) => event.affectedServiceIds.includes(service.id)).map((service) => service.name[locale]);
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
        <span>{t.affectedServices}: {serviceNames.join(", ")}</span>
        <Link href={href}>{t.viewDetails} <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    </article>
  );
}

export function StatusDashboard({ snapshot, locale }: { snapshot: PublicStatusSnapshot; locale: Locale }) {
  const t = getDictionary(locale);
  const overall = snapshot.overallState;
  return (
    <main id="main-content">
      <section className={styles.hero} aria-labelledby="page-title">
        <p className={styles.eyebrow}>{t.liveHealth}</p>
        <h1 id="page-title">{t.overview}</h1>
        <p className={styles.intro}>{t.intro}</p>
        <div className={`${styles.statusBanner} ${styles[overall]}`} role="status">
          <span className={styles.statusIcon} aria-hidden="true">{overall === "operational" ? <Check /> : <AlertTriangle />}</span>
          <div><strong>{t.overall[overall]}</strong><span>{t.lastUpdated} <time dateTime={snapshot.lastUpdatedAt}>{formatDateTime(snapshot.lastUpdatedAt, locale)}</time></span></div>
          <span className={styles.current}><Radio size={14} aria-hidden="true" /> {t.live}</span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="services-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.servicesEyebrow}</p><h2 id="services-title">{t.servicesTitle}</h2></div><span>{t.uptimePeriod}: {snapshot.uptimeIntervalDays} {t.days}</span></div>
        <div className={styles.legend} aria-label={t.historyLegend}>
          {(["operational", "degraded", "outage", "maintenance"] as const).map((state) => <span key={state}><i className={styles[state]} />{t.availability[state]}</span>)}
        </div>
        {snapshot.categories.map((category) => (
          <div className={styles.category} key={category.id}>
            <h3>{category.name[locale]}</h3>
            <div className={styles.serviceList}>
              {category.services.map((service) => (
                <article className={styles.service} key={service.id}>
                  <div className={styles.serviceMeta}>
                    <div><h4>{service.name[locale]}</h4><p>{service.description[locale]}</p><span className={`${styles.serviceState} ${styles[service.state]}`}><i />{t.status[service.state]}</span></div>
                    <div className={styles.uptime}><strong>{service.uptimePercentage}</strong><span>{t.uptime}</span></div>
                  </div>
                  <div className={styles.history} role="img" aria-label={`${service.name[locale]}: ${t.last60Days}, ${service.uptimePercentage} ${t.uptime}`}>
                    {service.history.map((state, index) => <i className={styles[state]} key={`${service.id}-${index}`} title={t.availability[state]} />)}
                  </div>
                  <div className={styles.historyLabels} aria-hidden="true"><span>{t.daysAgo}</span><span>{t.today}</span></div>
                </article>
              ))}
            </div>
          </div>
        ))}
        <aside className={styles.disclosure}><Info size={18} aria-hidden="true" /><p>{t.disclosure}</p></aside>
      </section>

      <section className={styles.section} aria-labelledby="active-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.activeEyebrow}</p><h2 id="active-title">{t.activeTitle}</h2></div></div>
        {snapshot.activeIncidents.length ? <div className={styles.eventList}>{snapshot.activeIncidents.map((event) => <EventCard key={event.slug} event={event} locale={locale} categories={snapshot.categories} />)}</div> : <div className={styles.empty}><Check aria-hidden="true" /><div><strong>{t.noActive}</strong><p>{t.noActiveBody}</p></div></div>}
      </section>

      <section className={styles.section} aria-labelledby="maintenance-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.maintenanceEyebrow}</p><h2 id="maintenance-title">{t.maintenanceTitle}</h2></div><CalendarClock aria-hidden="true" /></div>
        {snapshot.upcomingMaintenance.length ? <div className={styles.eventList}>{snapshot.upcomingMaintenance.map((event) => <EventCard key={event.slug} event={event} locale={locale} categories={snapshot.categories} />)}</div> : <div className={styles.empty}>{t.noMaintenance}</div>}
      </section>

      <section className={styles.section} aria-labelledby="recent-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.recentEyebrow}</p><h2 id="recent-title">{t.recentTitle}</h2></div></div>
        <div className={styles.eventList}>{snapshot.recentEvents.map((event) => <EventCard key={event.slug} event={event} locale={locale} categories={snapshot.categories} />)}</div>
      </section>

      <section className={styles.subscribePanel} id="subscribe" aria-labelledby="subscribe-title">
        <div><p className={styles.eyebrow}>{t.subscribe}</p><h2 id="subscribe-title">{t.subscribeTitle}</h2><p>{t.subscribeBody}</p></div>
        <SubscribeForm locale={locale} telegramUsername={process.env.TELEGRAM_BOT_USERNAME} webexBotEmail={process.env.WEBEX_BOT_EMAIL} />
      </section>
    </main>
  );
}
