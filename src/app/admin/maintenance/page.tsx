import { loadEventFormData, loadMaintenances } from "@/modules/admin/data";
import { requireAdmin } from "@/modules/auth/guard";
import { PageHeader, Unavailable } from "../_components";
import { MaintenanceAdmin } from "../_event-admin";

export default async function MaintenancePage() {
  await requireAdmin();
  const [formData, records] = await Promise.all([loadEventFormData(), loadMaintenances()]);
  if (!formData.available) return <><PageHeader title="Maintenance" description="Plan and record maintenance windows." /><Unavailable message={formData.message} /></>;
  if (!records.available) return <><PageHeader title="Maintenance" description="Plan and record maintenance windows." /><Unavailable message={records.message} /></>;

  const items = records.data.map((item) => ({
    ...item,
    scheduledStartAt: item.scheduledStartAt.toISOString(),
    scheduledEndAt: item.scheduledEndAt.toISOString(),
    actualStartAt: item.actualStartAt?.toISOString() ?? null,
    actualEndAt: item.actualEndAt?.toISOString() ?? null,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));
  const current = items.filter((item) => item.status === "scheduled" || item.status === "in_progress");
  const currentIds = new Set(current.map((item) => item.id));
  const past = items.filter((item) => !currentIds.has(item.id));
  return <>
    <PageHeader title="Maintenance" description="Plan windows, edit event details, and record actual timing separately. Scheduled dates may be in the future; actual dates may not." />
    <MaintenanceAdmin services={formData.data.services} current={current} past={past} defaultAffectsUptime={formData.data.plannedMaintenanceAffectsUptime} />
  </>;
}
