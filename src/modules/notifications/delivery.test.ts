import { describe, expect, it } from "vitest";

import { isPermanentTelegramFailure } from "./delivery";

describe("Telegram delivery failure classification", () => {
  it("recognizes blocked and missing destinations as permanent", () => {
    expect(isPermanentTelegramFailure(403, "Forbidden: bot was blocked by the user")).toBe(true);
    expect(isPermanentTelegramFailure(400, "Bad Request: chat not found")).toBe(true);
    expect(isPermanentTelegramFailure(400, "Bad Request: user is deactivated")).toBe(true);
  });

  it("keeps transient Telegram failures retryable", () => {
    expect(isPermanentTelegramFailure(429, "Too Many Requests")).toBe(false);
    expect(isPermanentTelegramFailure(500, "Internal Server Error")).toBe(false);
  });
});
