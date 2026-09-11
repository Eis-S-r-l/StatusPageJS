import Link from "next/link";
import { requireAdmin } from "@/modules/auth/guard";
import { loadDashboard } from "@/modules/admin/data";
import { loadPublicAppearance } from "@/modules/appearance/server";
import { formatDateTime } from "@/components/public/format";
import { PageHeader, Unavailable } from "./_components";
import styles from "./admin.module.css";

export default async function DashboardPage() {
  await requireAdmin();
  const [result, appearance] = await Promise.all([loadDashboard(), loadPublicAppearance()]);
  if (!result.available) return <><PageHeader title="Operations overview" description="Manage the service information customers see and the messages they receive." /><Unavailable message={result.message} /></>;
  const operations = result.data.operations;
  const format = (date: Date) => formatDateTime(date.toISOString(), "en", appearance.publicTimezone);
  return <><PageHeader title="Operations overview" description="Manage the service information customers see and the messages they receive." />
    <div className={styles.grid}>
      {[["Services", result.data.services], ["Incidents", result.data.incidents], ["Maintenance", result.data.maintenances], ["Subscribers", result.data.subscribers]].map(([label, value]) => <div className={styles.stat} key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
    <section className={`${styles.panel} ${styles.operationsPanel}`} aria-labelledby="worker-health">
      <h2 id="worker-health">Background processing</h2>
      <p className={operations.workerHealthy ? styles.success : styles.alert} role={operations.workerHealthy ? "status" : "alert"}>
        {operations.workerHealthy ? "Worker is responding." : "Worker is not responding. Notifications and uptime updates may be delayed."}
        {operations.heartbeatAt ? ` Last heartbeat: ${format(operations.heartbeatAt)} (${appearance.publicTimezone}).` : " No heartbeat has been recorded."}
      </p>
      <p><Link href="/admin/notifications?status=pending">{operations.pendingJobs} pending {operations.pendingJobs === 1 ? "delivery" : "deliveries"}</Link>{operations.oldestPendingAt ? ` · Oldest queued: ${format(operations.oldestPendingAt)}` : ""}</p>
      {operations.interruptedJobs > 0 && <p className={styles.alert}>{operations.interruptedJobs} interrupted {operations.interruptedJobs === 1 ? "delivery is" : "deliveries are"} waiting for recovery. <Link href="/admin/notifications?status=processing">Inspect deliveries</Link></p>}
      {operations.failedJobs > 0 && <p className={styles.alert}>{operations.failedJobs} {operations.failedJobs === 1 ? "delivery needs" : "deliveries need"} attention. <Link href="/admin/notifications?status=failed">Review and retry</Link></p>}
      {!operations.failedJobs && <p>No failed deliveries.</p>}
    </section>
    <section className={`${styles.panel} ${styles.operationsPanel}`} aria-labelledby="uptime-health">
      <h2 id="uptime-health">Uptime calculations</h2>
      {operations.staleServices.length ? <>
        <p className={styles.alert} role="alert">{operations.staleServices.length} service{operations.staleServices.length === 1 ? " has" : "s have"} missing or stale uptime figures.</p>
        <ul className={styles.staleServices}>{operations.staleServices.map((service) => <li key={service.id}>
          <strong>{service.name}</strong><span>{service.reason}{service.calculatedAt ? ` Last calculated: ${format(service.calculatedAt)}.` : ""}</span>
        </li>)}</ul>
      </> : <p className={styles.success}>All uptime calculations are up to date.</p>}
    </section>
  </>;
}
