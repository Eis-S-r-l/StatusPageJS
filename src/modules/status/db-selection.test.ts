import { afterEach, describe, expect, it, vi } from "vitest";

describe("public repository selection", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("remains safe to import during a production build without DATABASE_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");

    await expect(import("./repository")).resolves.toHaveProperty(
      "publicStatusRepository",
    );
  });
});
