import { describe, expect, it } from "vitest";

import { webexSubscriberProfile } from "./webex-profile";

describe("webexSubscriberProfile", () => {
  it("uses the person profile name and email", () => {
    expect(webexSubscriberProfile(
      { personId: "person", personEmail: "message@example.com" },
      { emails: ["profile@example.com"], displayName: "Ada Lovelace" },
    )).toEqual({ username: "profile@example.com", displayName: "Ada Lovelace" });
  });

  it("falls back to the message email when profile lookup is unavailable", () => {
    expect(webexSubscriberProfile({ personEmail: " user@example.com " })).toEqual({
      username: "user@example.com",
      displayName: null,
    });
  });
});
