import { describe, expect, it } from "vitest";

import { buildOidcCallbackUrl, buildPublicAppUrl } from "./urls";

describe("authentication URLs", () => {
  it("uses the configured public callback origin and preserves Cognito parameters", () => {
    const result = buildOidcCallbackUrl(
      "https://status.example.com/api/auth/callback",
      "https://0.0.0.0:3000/api/auth/callback?code=abc&state=def",
    );

    expect(result.href).toBe(
      "https://status.example.com/api/auth/callback?code=abc&state=def",
    );
  });

  it("uses APP_URL for public error redirects", () => {
    const result = buildPublicAppUrl(
      "/admin/login-error",
      "https://status.example.com",
      "https://0.0.0.0:3000/api/auth/callback",
    );

    expect(result.href).toBe("https://status.example.com/admin/login-error");
  });

  it("falls back safely when APP_URL is invalid", () => {
    const result = buildPublicAppUrl(
      "/admin/login-error",
      "not a URL",
      "https://status.example.com/api/auth/callback",
    );

    expect(result.href).toBe("https://status.example.com/admin/login-error");
  });
});
