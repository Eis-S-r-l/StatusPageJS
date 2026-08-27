import { loadServiceManagement } from "@/modules/admin/data";
import { requireAdmin } from "@/modules/auth/guard";
import { PageHeader, Unavailable } from "../_components";
import { ServiceAdmin } from "../_service-admin";

export default async function ServicesPage() {
  await requireAdmin();
  const result = await loadServiceManagement();
  return <><PageHeader title="Services & categories" description="Organise the services shown publicly and define when availability tracking starts." />
    {!result.available ? <Unavailable message={result.message} /> : <ServiceAdmin categories={result.data.categories} services={result.data.services.map((service) => ({ ...service, monitoringStartedAt: service.monitoringStartedAt.toISOString() }))} />}
  </>;
}
