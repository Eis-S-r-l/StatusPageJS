import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TurnstileConfigurationError, verifyTurnstileToken } from "./turnstile";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Turnstile verification", () => {
  it("accepts only a successful response with the expected action and hostname", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "server-secret");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "status.example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      action: "subscribe",
      hostname: "status.example.com",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstileToken({
      token: "visitor-token",
      expectedAction: "subscribe",
      remoteIp: "203.0.113.8",
    })).resolves.toBe(true);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.body as URLSearchParams).toString()).toBe("secret=server-secret&response=visitor-token&remoteip=203.0.113.8");
  });

  it.each([
    { action: "unsubscribe", hostname: "status.example.com" },
    { action: "subscribe", hostname: "other.example.com" },
  ])("rejects an unexpected action or hostname", async (siteverify) => {
    vi.stubEnv("TURNSTILE_SECRET", "server-secret");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "status.example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, ...siteverify }), { status: 200 })));

    await expect(verifyTurnstileToken({ token: "visitor-token", expectedAction: "subscribe" })).resolves.toBe(false);
  });

  it("fails closed when Siteverify is unavailable", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "server-secret");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "status.example.com");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    await expect(verifyTurnstileToken({ token: "visitor-token", expectedAction: "subscribe" })).resolves.toBe(false);
  });

  it("reports missing server configuration", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "status.example.com");

    await expect(verifyTurnstileToken({ token: "visitor-token", expectedAction: "subscribe" }))
      .rejects.toBeInstanceOf(TurnstileConfigurationError);
  });
});
