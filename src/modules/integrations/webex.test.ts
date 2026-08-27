import { describe, expect, it } from "vitest";

import { createWebexMessagePayload, describeWebexError } from "./webex";

describe("Webex integration helpers", () => {
  it("keeps the API error reason and tracking identifier", () => {
    expect(describeWebexError({
      message: "The request was invalid.",
      errors: [{ description: "The bot is not a member of the room." }],
      trackingId: "TRACK-123",
    })).toBe("The request was invalid.: The bot is not a member of the room. (tracking ID: TRACK-123)");
  });

  it("limits outgoing text without splitting multi-byte characters", () => {
    const payload = createWebexMessagePayload("room", "🙂".repeat(6_000));
    expect(Buffer.byteLength(payload.text, "utf8")).toBeLessThanOrEqual(22_000);
    expect(payload.text.endsWith("…")).toBe(true);
    expect(payload.roomId).toBe("room");
  });
});
