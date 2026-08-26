import { afterEach, describe, expect, it, vi } from "vitest";

describe("database client", () => {
  afterEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("can be imported without DATABASE_URL and fails only when used", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const client = await import("./client");

    expect(() => client.getDb()).toThrow(/DATABASE_URL/);
  });
});
