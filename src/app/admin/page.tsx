import { requireAdmin } from "@/modules/auth/guard";
import { loadDashboard } from "@/modules/admin/data";
import { PageHeader, Unavailable } from "./_components";
import styles from "./admin.module.css";

export default async function DashboardPage() {
  await requireAdmin();
  const result = await loadDashboard();
  return <><PageHeader title="Operations overview" description="Manage the service information customers see and the messages they receive." />
    {!result.available ? <Unavailable message={result.message} /> : <div className={styles.grid}>
      {[["Services", result.data.services], ["Incidents", result.data.incidents], ["Maintenance", result.data.maintenances], ["Subscribers", result.data.subscribers]].map(([label, value]) => <div className={styles.stat} key={label}><span>{label}</span><strong>{value}</strong></div>)}
      {result.data.failedJobs > 0 && <p className={`${styles.alert} ${styles.full}`}>{result.data.failedJobs} notification deliveries need attention.</p>}
    </div>}
  </>;
}
