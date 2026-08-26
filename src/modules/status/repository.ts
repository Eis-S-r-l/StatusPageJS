import { DatabasePublicStatusRepository } from "./db-repository";
import { eventsFixture, snapshotFixture } from "./fixtures";
import type { PublicStatusRepository, StatusEvent } from "./types";

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
}

// Fixtures are intentionally a development/test convenience. A production
// deployment with a missing DATABASE_URL must fail when it attempts DB access.
const useFixtures =
  !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";

export const publicStatusRepository: PublicStatusRepository = useFixtures
  ? new FixturePublicStatusRepository()
  : new DatabasePublicStatusRepository();
