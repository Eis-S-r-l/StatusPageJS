import Link from "next/link";

import { deleteSubscriber, refreshTelegramSubscriber, updateSubscriber } from "@/modules/admin/actions";
import { loadSubscribers } from "@/modules/admin/data";
import { requireAdmin } from "@/modules/auth/guard";
import { Notice, PageHeader, Unavailable } from "../_components";
import styles from "../admin.module.css";
import { ConfirmDelete } from "./ConfirmDelete";

type Query = { q?: string; channel?: string; status?: string; page?: string; error?: string; saved?: string };

function pageHref(query: Query, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.channel && query.channel !== "all") params.set("channel", query.channel);
  if (query.status && query.status !== "all") params.set("status", query.status);
  params.set("page", String(page));
  return `/admin/subscribers?${params}`;
}

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const channel = ["email", "telegram", "webex"].includes(query.channel ?? "") ? query.channel as "email" | "telegram" | "webex" : "all";
  const status = ["confirmed", "pending"].includes(query.status ?? "") ? query.status as "confirmed" | "pending" : "all";
  const result = await loadSubscribers({ query: query.q, channel, status, page: Number(query.page) || 1 });
  return <>
    <PageHeader title="Subscribers" description="Search notification destinations, update delivery preferences, and permanently remove subscriptions." />
    <Notice error={query.error} saved={query.saved} />
    {!result.available ? <Unavailable message={result.message} /> : <>
      <section className={styles.panel}>
        <form className={styles.subscriberFilters} method="get">
          <label className={styles.field}>Search<input name="q" defaultValue={query.q} placeholder="Email, Telegram name, username, or chat ID" /></label>
          <label className={styles.field}>Channel<select name="channel" defaultValue={channel}><option value="all">All channels</option><option value="email">Email</option><option value="telegram">Telegram</option><option value="webex">Webex</option></select></label>
          <label className={styles.field}>Status<select name="status" defaultValue={status}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="pending">Awaiting confirmation</option></select></label>
          <button className={styles.button} type="submit">Filter</button>
        </form>
      </section>
      <section className={styles.panel}>
        <p className={styles.panelIntro}>{result.data.total} subscription{result.data.total === 1 ? "" : "s"}</p>
        <div className={styles.list}>{result.data.rows.length ? result.data.rows.map((item) => {
          const identity = item.channel === "telegram" ? item.channelDisplayName || (item.channelUsername ? `@${item.channelUsername}` : null) : null;
          return <div className={`${styles.row} ${styles.subscriberRow}`} key={item.id}>
            <div className={styles.subscriberIdentity}><strong>{identity ?? item.destination}</strong>{identity && <small>{item.channelUsername ? `@${item.channelUsername} · ` : ""}Chat ID {item.destination}</small>}<small>{item.channel} · {item.unsubscribedAt ? "Unsubscribed (legacy)" : item.confirmedAt ? "Confirmed" : "Awaiting confirmation"}</small></div>
            <details className={styles.eventActions}><summary>Edit</summary>
              <form className={styles.compactForm} action={updateSubscriber}><input type="hidden" name="id" value={item.id} /><label className={styles.field}>Language<select name="language" defaultValue={item.language}><option value="en">English</option><option value="it">Italian</option></select></label><div className={styles.checks}><label className={styles.check}><input name="receiveIncidents" type="checkbox" defaultChecked={item.receiveIncidents} /> Incidents</label><label className={styles.check}><input name="receiveMaintenance" type="checkbox" defaultChecked={item.receiveMaintenance} /> Maintenance</label></div><button className={styles.button} type="submit">Save preferences</button></form>
              {item.channel === "telegram" && <form action={refreshTelegramSubscriber}><input type="hidden" name="id" value={item.id} /><button className={styles.dangerButton} type="submit">Refresh Telegram profile</button></form>}
              <ConfirmDelete action={deleteSubscriber} id={item.id} className={styles.dangerButton} />
            </details>
          </div>;
        }) : <div className={styles.empty}>No matching subscriptions.</div>}</div>
        {result.data.pages > 1 && <nav className={styles.pagination} aria-label="Subscriber pages">{result.data.page > 1 && <Link href={pageHref(query, result.data.page - 1)}>Previous</Link>}<span>Page {result.data.page} of {result.data.pages}</span>{result.data.page < result.data.pages && <Link href={pageHref(query, result.data.page + 1)}>Next</Link>}</nav>}
      </section>
    </>}
  </>;
}
