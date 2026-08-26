import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createSubscriptionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSubscriptionToken(token) };
}

export function hashSubscriptionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenHashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
