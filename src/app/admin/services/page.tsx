import { archiveEntity, createCategory, createService } from "@/modules/admin/actions";
import { loadServiceManagement } from "@/modules/admin/data";
import { requireAdmin } from "@/modules/auth/guard";
import { Notice, PageHeader, Unavailable } from "../_components";
import { AutoSlugFields } from "../_slug-fields";
import styles from "../admin.module.css";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin();
  const [result, params] = await Promise.all([loadServiceManagement(), searchParams]);
  return <><PageHeader title="Services & categories" description="Organise the services shown publicly and define when availability tracking starts." /><Notice {...params} />
    {!result.available ? <Unavailable message={result.message} /> : <>
      <div className={styles.two}>
        <section className={styles.panel}><h2>Add category</h2><form action={createCategory} className={styles.form}>
          <AutoSlugFields sourceLabel="English name" sourceName="nameEn" slugPlaceholder="platform" />
          <label className={styles.field}>Italian name<input name="nameIt" required /></label><label className={styles.field}>Display order<input name="displayOrder" type="number" min="0" defaultValue="0" /></label><button className={`${styles.button} ${styles.full}`}>Add category</button>
        </form></section>
        <section className={styles.panel}><h2>Categories</h2><div className={styles.list}>{result.data.categories.length ? result.data.categories.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.nameEn}</strong><small>{item.nameIt} · {item.slug}</small></div><form action={archiveEntity}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="type" value="category" /><button className={styles.dangerButton}>Archive</button></form></div>) : <div className={styles.empty}>No categories yet.</div>}</div></section>
      </div>
      <section className={styles.panel}><h2>Add service</h2><form action={createService} className={styles.form}>
        <label className={styles.field}>Category<select name="categoryId" required><option value="">Select category</option>{result.data.categories.map((item) => <option key={item.id} value={item.id}>{item.nameEn}</option>)}</select></label>
        <label className={styles.field}>Display order<input name="displayOrder" type="number" min="0" defaultValue="0" /></label>
        <AutoSlugFields sourceLabel="English name" sourceName="nameEn" slugPlaceholder="customer-portal" /><label className={styles.field}>Italian name<input name="nameIt" required /></label>
        <label className={styles.field}>English description<textarea name="descriptionEn" /></label><label className={styles.field}>Italian description<textarea name="descriptionIt" /></label>
        <label className={styles.field}>Monitoring started (UTC)<input name="monitoringStartedAt" type="datetime-local" required /></label><button className={`${styles.button} ${styles.full}`}>Add service</button>
      </form></section>
      <section className={styles.panel}><h2>Current services</h2><div className={styles.list}>{result.data.services.length ? result.data.services.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.nameEn}</strong><small>{item.nameIt} · Tracking since {item.monitoringStartedAt.toLocaleDateString("en-GB")}</small></div><form action={archiveEntity}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="type" value="service" /><button className={styles.dangerButton}>Archive</button></form></div>) : <div className={styles.empty}>No services yet.</div>}</div></section>
    </>}
  </>;
}
