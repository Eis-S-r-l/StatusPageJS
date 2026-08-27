import { describe, expect, it } from "vitest";

import { createTelegramDeliveryRequest, isPermanentTelegramFailure } from "./delivery";

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

  it("uses rich messages when formatted HTML is available", () => {
    expect(createTelegramDeliveryRequest("123", { text: "Fallback", telegramHtml: "<h2>Incident</h2>" })).toEqual({
      method: "sendRichMessage",
      body: { chat_id: "123", rich_message: { html: "<h2>Incident</h2>" } },
    });
    expect(createTelegramDeliveryRequest("123", { text: "Fallback" })).toEqual({ method: "sendMessage", body: { chat_id: "123", text: "Fallback" } });
    expect((createTelegramDeliveryRequest("123", { text: "x".repeat(5000) }).body.text as string)).toHaveLength(4096);
  });
});
