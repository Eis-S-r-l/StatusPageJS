import Link from "next/link";

import { loadNotificationQueue, type NotificationQuery } from "@/modules/admin/data";
import { loadPublicAppearance } from "@/modules/appearance/server";
import { requireAdmin } from "@/modules/auth/guard";
import { retryNotification } from "@/modules/notifications/actions";
import { formatDateTime } from "@/components/public/format";
import { PageHeader, Unavailable } from "../_components";
import styles from "../admin.module.css";

type Query = { status?: string; channel?: string; page?: string; error?: string; queued?: string };
const statuses = ["all", "pending", "processing", "failed", "sent", "cancelled"] as const;
const channels = ["all", "email", "telegram", "webex"] as const;
const typeLabels = {
  subscription_confirmation: "Subscription confirmation", unsubscription_confirmation: "Unsubscription confirmation",
  incident: "Incident", incident_update: "Incident update", maintenance_announcement: "Maintenance announcement", maintenance_reminder: "Maintenance reminder",
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const status = statuses.includes(query.status as typeof statuses[number]) ? query.status as NotificationQuery["status"] : "failed";
  const channel = channels.includes(query.channel as typeof channels[number]) ? query.channel as NotificationQuery["channel"] : "all";
  const [result, appearance] = await Promise.all([loadNotificationQueue({ status, channel, page: Number(query.page) }), loadPublicAppearance()]);
  const format = (date: Date) => formatDateTime(date.toISOString(), "en", appearance.publicTimezone);
  const pageHref = (page: number) => `/admin/notifications?${new URLSearchParams({ status: status!, channel: channel!, page: String(page) })}`;
  return <>
    <PageHeader title="Notification deliveries" description="Review delivery progress, inspect failures, and queue failed messages for another attempt." />
    {query.error && <p role="alert" className={styles.alert}>{query.error}</p>}
    {query.queued && <p role="status" className={styles.success}>The delivery has been queued for another attempt.</p>}
    {!result.available ? <Unavailable message={result.message} /> : <>
      <section className={styles.panel}>
        <form key={`${status}:${channel}`} className={styles.notificationFilters} method="get">
          <label className={styles.field}>Status<select name="status" defaultValue={status}>{statuses.map((value) => <option key={value} value={value}>{value === "all" ? "All statuses" : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <label className={styles.field}>Channel<select name="channel" defaultValue={channel}>{channels.map((value) => <option key={value} value={value}>{value === "all" ? "All channels" : value === "email" ? "Email" : value === "telegram" ? "Telegram" : "Webex"}</option>)}</select></label>
          <button className={styles.button} type="submit">Filter</button>
        </form>
      </section>
      <section className={styles.panel}>
        <p className={styles.panelIntro}>{result.data.total} matching {result.data.total === 1 ? "delivery" : "deliveries"} · All times in {appearance.publicTimezone}</p>
        <div className={styles.list}>{result.data.rows.length ? result.data.rows.map((job) => <article className={`${styles.row} ${styles.notificationRow}`} key={job.id}>
          <div className={styles.subscriberIdentity}>
            <strong>{job.subject || typeLabels[job.type]}</strong>
            <small>{job.destination} · {job.channel} · {typeLabels[job.type]}</small>
            <small>{job.status} · {job.attemptCount} attempt{job.attemptCount === 1 ? "" : "s"} · Updated {format(job.updatedAt)}</small>
            {job.status === "pending" && <small>{job.nextRetryAt ? `Next attempt: ${format(job.nextRetryAt)}` : `Queued for ${format(job.scheduledAt)}`}</small>}
            {job.sentAt && <small>Sent {format(job.sentAt)}</small>}
            {job.lastError && <p className={styles.deliveryFailure}>{job.lastError}</p>}
          </div>
          {job.status === "failed" && <form action={retryNotification}>
            <input type="hidden" name="id" value={job.id} />
            <button className={styles.secondaryButton} type="submit">Retry delivery</button>
          </form>}
        </article>) : <div className={styles.empty}>No deliveries match these filters.</div>}</div>
        {result.data.pages > 1 && <nav className={styles.pagination} aria-label="Notification pages">
          {result.data.page > 1 && <Link href={pageHref(result.data.page - 1)}>Previous</Link>}
          <span>Page {result.data.page} of {result.data.pages}</span>
          {result.data.page < result.data.pages && <Link href={pageHref(result.data.page + 1)}>Next</Link>}
        </nav>}
      </section>
    </>}
  </>;
}
