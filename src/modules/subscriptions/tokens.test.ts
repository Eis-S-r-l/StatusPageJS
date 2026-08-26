import { describe, expect, it } from "vitest";

import { createSubscriptionToken, hashSubscriptionToken, tokenHashesMatch } from "./tokens";

describe("subscription tokens", () => {
  it("creates high-entropy tokens and only stores a deterministic hash", () => {
    const first = createSubscriptionToken();
    const second = createSubscriptionToken();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashSubscriptionToken(first.token));
    expect(first.hash).not.toContain(first.token);
  });

  it("compares token hashes without accepting different lengths", () => {
    const hash = hashSubscriptionToken("valid-token");
    expect(tokenHashesMatch(hash, hashSubscriptionToken("valid-token"))).toBe(true);
    expect(tokenHashesMatch(hash, hashSubscriptionToken("other-token"))).toBe(false);
    expect(tokenHashesMatch(hash, "00")).toBe(false);
  });
});
