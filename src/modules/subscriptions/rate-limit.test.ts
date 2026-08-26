import { beforeEach, describe, expect, it } from "vitest";

import { allowSubscriptionRequest, clearRateLimitsForTests, requestClientKey } from "./rate-limit";

describe("subscription request rate limiting", () => {
  beforeEach(clearRateLimitsForTests);

  it("limits a client inside the window and permits it after expiry", () => {
    expect(allowSubscriptionRequest("unsubscribe:client", 1_000, 2, 1_000)).toBe(true);
    expect(allowSubscriptionRequest("unsubscribe:client", 1_100, 2, 1_000)).toBe(true);
    expect(allowSubscriptionRequest("unsubscribe:client", 1_200, 2, 1_000)).toBe(false);
    expect(allowSubscriptionRequest("unsubscribe:client", 2_101, 2, 1_000)).toBe(true);
  });

  it("prefers the proxy-authenticated address without mixing request purposes", () => {
    const request = new Request("https://status.example", { headers: {
      "x-forwarded-for": "198.51.100.99, 10.0.0.2",
      "x-real-ip": "203.0.113.8",
    } });
    expect(requestClientKey(request, "subscribe")).toBe("subscribe:203.0.113.8");
    expect(requestClientKey(request, "unsubscribe")).toBe("unsubscribe:203.0.113.8");
  });
});
