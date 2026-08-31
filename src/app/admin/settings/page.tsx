import { updateSettings } from "@/modules/admin/actions";
import { loadSettings } from "@/modules/admin/data";
import { requireAdmin } from "@/modules/auth/guard";
import { Notice, PageHeader, Unavailable } from "../_components";
import styles from "../admin.module.css";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin();
  const [result, params] = await Promise.all([loadSettings(), searchParams]);
  return <><PageHeader title="Settings" description="Control uptime, maintenance previews, and public integrations." /><Notice {...params} />{!result.available ? <Unavailable message={result.message} /> : <section className={styles.panel}><form action={updateSettings} className={styles.form}>
    <label className={styles.field}>Company name<input name="companyName" required defaultValue={result.data.companyName} /></label>
    <label className={styles.field}>Status page title<input name="statusPageTitle" required maxLength={200} defaultValue={result.data.statusPageTitle} /></label>
    <label className={styles.field}>Public timezone<input name="publicTimezone" required defaultValue={result.data.publicTimezone} /></label>
    <label className={styles.field}>Uptime interval (days)<input name="uptimeIntervalDays" type="number" min="1" max="3650" required defaultValue={result.data.uptimeIntervalDays} /><small className={styles.fieldHint}>Controls both the uptime calculation and the number of daily history blocks on the public page.</small></label>
    <label className={styles.field}>Upcoming maintenance preview (days)<input name="maintenancePreviewDays" type="number" min="1" max="3650" required defaultValue={result.data.maintenancePreviewDays} /><small className={styles.fieldHint}>Shows published maintenance on the public page when it starts within this many days.</small></label>
    <div className={styles.settingsCheckField}><span>Maintenance behavior</span><label className={styles.check}><input name="plannedMaintenanceAffectsUptime" type="checkbox" defaultChecked={result.data.plannedMaintenanceAffectsUptime} />Planned maintenance affects uptime by default</label></div>
    <label className={`${styles.field} ${styles.full} ${styles.codeField}`}>Custom header scripts<textarea name="customHeaderScripts" rows={8} maxLength={100_000} spellCheck={false} defaultValue={result.data.customHeaderScripts} /><small className={styles.fieldHint}>Paste JavaScript directly, or one or more complete &lt;script&gt;...&lt;/script&gt; elements. These run on every public page before it becomes interactive. Only use code you trust.</small></label>
    <p className={`${styles.full} ${styles.alert}`}>Changing the uptime interval recalculates stored uptime for every active service. Public visits continue to read the persisted result.</p><button className={`${styles.button} ${styles.full}`}>Save settings</button>
  </form></section>}</>;
}
