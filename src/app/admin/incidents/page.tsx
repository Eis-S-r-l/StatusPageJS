import { loadEventFormData, loadIncidents } from "@/modules/admin/data";
import { requireAdmin } from "@/modules/auth/guard";
import { PageHeader, Unavailable } from "../_components";
import { IncidentAdmin } from "../_event-admin";

export default async function IncidentsPage() {
  await requireAdmin();
  const [formData, records] = await Promise.all([loadEventFormData(), loadIncidents()]);
  if (!formData.available) return <><PageHeader title="Incidents" description="Manage service interruptions and publish a clear timeline." /><Unavailable message={formData.message} /></>;
  if (!records.available) return <><PageHeader title="Incidents" description="Manage service interruptions and publish a clear timeline." /><Unavailable message={records.message} /></>;

  const items = records.data.map((item) => ({
    ...item,
    startedAt: item.startedAt.toISOString(),
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    updates: item.updates.map((update) => ({ id: update.id })),
  }));
  return <>
    <PageHeader title="Incidents" description="Manage event details separately from public timeline updates. Times are shown in each administrator’s browser timezone." />
    <IncidentAdmin services={formData.data.services} current={items.filter((item) => item.status !== "resolved")} resolved={items.filter((item) => item.status === "resolved")} />
  </>;
}
