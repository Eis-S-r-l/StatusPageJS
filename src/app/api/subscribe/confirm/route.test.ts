import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { clearRateLimitsForTests } from "@/modules/subscriptions/rate-limit";

const mocks = vi.hoisted(() => ({
  confirmEmailSubscription: vi.fn(),
  pendingEmailSubscriptionLocale: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@/modules/subscriptions/service", () => ({
  confirmEmailSubscription: mocks.confirmEmailSubscription,
  pendingEmailSubscriptionLocale: mocks.pendingEmailSubscriptionLocale,
}));

vi.mock("@/modules/subscriptions/turnstile", () => ({
  TurnstileConfigurationError: class TurnstileConfigurationError extends Error {},
  verifyTurnstileToken: mocks.verifyTurnstileToken,
}));

vi.mock("@/modules/subscriptions/turnstile-config", () => ({
  turnstileSiteKey: () => "test-site-key",
}));

import { GET, POST } from "./route";

function confirmationRequest(method: "GET" | "POST", body?: URLSearchParams) {
  return new NextRequest(`https://status.example/api/subscribe/confirm?token=pending-token&lang=en`, {
    method,
    body,
    headers: body ? { "content-type": "application/x-www-form-urlencoded", "x-real-ip": "203.0.113.8" } : undefined,
  });
}

describe("email subscription confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitsForTests();
    mocks.pendingEmailSubscriptionLocale.mockResolvedValue("en");
  });

  it("renders a Turnstile confirmation form without consuming the link on GET", async () => {
    const response = await GET(confirmationRequest("GET"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(html).toContain('method="post"');
    expect(html).toContain('name="token" value="pending-token"');
    expect(html).toContain('data-sitekey="test-site-key"');
    expect(html).toContain('data-action="confirm_subscription"');
    expect(mocks.confirmEmailSubscription).not.toHaveBeenCalled();
  });

  it("keeps the link pending when the second Turnstile check fails", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue(false);
    const body = new URLSearchParams({ token: "pending-token", "cf-turnstile-response": "failed-challenge" });
    const response = await POST(confirmationRequest("POST", body));
    const html = await response.text();

    expect(response.status).toBe(403);
    expect(html).toContain("Security verification failed");
    expect(html).toContain('name="token" value="pending-token"');
    expect(mocks.confirmEmailSubscription).not.toHaveBeenCalled();
  });

  it("consumes the link only after a successful confirmation POST", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue(true);
    mocks.confirmEmailSubscription.mockResolvedValue("en");
    const body = new URLSearchParams({ token: "pending-token", "cf-turnstile-response": "valid-challenge" });
    const request = confirmationRequest("POST", body);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith({
      token: "valid-challenge",
      expectedAction: "confirm_subscription",
      remoteIp: "203.0.113.8",
    });
    expect(mocks.confirmEmailSubscription).toHaveBeenCalledWith("pending-token");
    expect(await response.text()).toContain("Subscription confirmed");
  });

  it("does not render a form for an expired or already-used link", async () => {
    mocks.pendingEmailSubscriptionLocale.mockResolvedValue(null);
    const response = await GET(confirmationRequest("GET"));
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain("Expired link");
    expect(html).not.toContain("cf-turnstile");
  });

  it("escapes the bearer token before placing it in the form", async () => {
    const token = '\"><script>alert("token")</script>';
    const request = new NextRequest(`https://status.example/api/subscribe/confirm?token=${encodeURIComponent(token)}&lang=en`);
    const response = await GET(request);
    const html = await response.text();

    expect(html).not.toContain(`value="${token}"`);
    expect(html).toContain('value="&quot;&gt;&lt;script&gt;alert(&quot;token&quot;)&lt;/script&gt;"');
    expect(mocks.confirmEmailSubscription).not.toHaveBeenCalled();
  });
});
