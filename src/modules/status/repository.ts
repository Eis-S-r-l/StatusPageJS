import { DatabasePublicStatusRepository } from "./db-repository";
import { eventsFixture, snapshotFixture } from "./fixtures";
import type { PaginatedStatusEvents, PublicStatusRepository, StatusEvent } from "./types";

export function paginatePublicEvents(events: StatusEvent[], page: number, pageSize: number): PaginatedStatusEvents {
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 1;
  const ordered = [...events].sort((a, b) =>
    Date.parse(b.startsAt) - Date.parse(a.startsAt) || b.slug.localeCompare(a.slug),
  );
  const totalPages = Math.max(1, Math.ceil(ordered.length / safePageSize));
  const requestedPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const currentPage = Math.min(requestedPage, totalPages);
  return { events: ordered.slice((currentPage - 1) * safePageSize, currentPage * safePageSize), page: currentPage, pageSize: safePageSize, totalItems: ordered.length, totalPages };
}

class FixturePublicStatusRepository implements PublicStatusRepository {
  async getSnapshot() {
    return snapshotFixture;
  }

  async getIncident(slug: string): Promise<StatusEvent | null> {
    return (
      eventsFixture.find(
        (event) => event.kind === "incident" && event.slug === slug,
      ) ?? null
    );
  }

  async getMaintenance(slug: string): Promise<StatusEvent | null> {
    return (
      eventsFixture.find(
        (event) => event.kind === "maintenance" && event.slug === slug,
      ) ?? null
    );
  }

  async listIncidents(page: number, pageSize: number): Promise<PaginatedStatusEvents> {
    return paginatePublicEvents(eventsFixture.filter((event) => event.kind === "incident"), page, pageSize);
  }

  async listMaintenances(page: number, pageSize: number): Promise<PaginatedStatusEvents> {
    return paginatePublicEvents(eventsFixture.filter((event) => event.kind === "maintenance"), page, pageSize);
  }
}

// Fixtures are intentionally a development/test convenience. A production
// deployment with a missing DATABASE_URL must fail when it attempts DB access.
const useFixtures =
  !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";

export const publicStatusRepository: PublicStatusRepository = useFixtures
  ? new FixturePublicStatusRepository()
  : new DatabasePublicStatusRepository();
