import { loadSubscribers } from "@/modules/admin/data";
import { requireAdmin } from "@/modules/auth/guard";
import { PageHeader, Unavailable } from "../_components";
import styles from "../admin.module.css";

export default async function SubscribersPage() {
  await requireAdmin();
  const result = await loadSubscribers();
  return <><PageHeader title="Subscribers" description="Review notification destinations and confirmation status. Sensitive tokens are never shown." />{!result.available ? <Unavailable message={result.message} /> : <section className={styles.panel}><div className={styles.list}>{result.data.length ? result.data.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.destination}</strong><small>{item.channel} · {item.language.toUpperCase()} · {item.unsubscribedAt ? "Unsubscribed" : item.confirmedAt ? "Confirmed" : "Awaiting confirmation"}</small></div></div>) : <div className={styles.empty}>No subscriptions yet.</div>}</div></section>}</>;
}
