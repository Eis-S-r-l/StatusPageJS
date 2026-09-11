import { describe, expect, it } from "vitest";
import { notificationRetryProblem } from "./retry";

const now = new Date("2026-09-10T12:00:00Z");
const subscriber = { confirmedAt: now, unsubscribedAt: null, confirmationTokenHash: "current-token-hash", confirmationRequestedAt: now, unsubscribeTokenHash: "unsubscribe-hash", unsubscribeRequestedAt: now };
const job = { status: "failed" as const, type: "incident" as const, idempotencyKey: "incident:subscriber" };

describe("manual delivery retries", () => {
  it("allows a failed delivery to an active subscriber", () => {
    expect(notificationRetryProblem(job, subscriber, now)).toBeNull();
  });
  it("rejects deliveries already queued or sent", () => {
    for (const status of ["pending", "processing", "sent", "cancelled"] as const) {
      expect(notificationRetryProblem({ ...job, status }, subscriber, now)).toMatch(/Only failed/);
    }
  });
  it("rejects inactive or unconfirmed recipients for event updates", () => {
    expect(notificationRetryProblem(job, { ...subscriber, unsubscribedAt: now }, now)).toMatch(/no longer active/);
    expect(notificationRetryProblem(job, { ...subscriber, confirmedAt: null }, now)).toMatch(/not been confirmed/);
  });
  it("retries only a current, unexpired confirmation link", () => {
    const confirmation = { ...job, type: "subscription_confirmation" as const, idempotencyKey: `subscription-confirmation:subscriber:${subscriber.confirmationTokenHash.slice(0, 16)}` };
    expect(notificationRetryProblem(confirmation, { ...subscriber, confirmedAt: null }, now)).toBeNull();
    expect(notificationRetryProblem(confirmation, { ...subscriber, confirmationTokenHash: null }, now)).toMatch(/expired/);
    expect(notificationRetryProblem(confirmation, { ...subscriber, confirmationTokenHash: "different-token-hash" }, now)).toMatch(/replaced/);
    expect(notificationRetryProblem(confirmation, { ...subscriber, confirmationRequestedAt: new Date(now.getTime() - 7 * 86_400_000) }, now)).toMatch(/expired/);
  });
  it("expires unsubscribe confirmations after one day", () => {
    const confirmation = { ...job, type: "unsubscription_confirmation" as const, idempotencyKey: `unsubscription-confirmation:subscriber:${subscriber.unsubscribeTokenHash.slice(0, 16)}` };
    expect(notificationRetryProblem(confirmation, subscriber, now)).toBeNull();
    expect(notificationRetryProblem(confirmation, { ...subscriber, unsubscribeRequestedAt: new Date(now.getTime() - 86_400_000) }, now)).toMatch(/expired/);
  });
});
