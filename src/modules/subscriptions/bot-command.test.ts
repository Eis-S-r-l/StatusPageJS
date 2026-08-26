import { describe, expect, it } from "vitest";

import { parseBotCommand } from "./bot-command";

describe("parseBotCommand", () => {
  it("accepts commands with an optional bot name and language", () => {
    expect(parseBotCommand("/start@EisBot it")).toEqual({ action: "subscribe", language: "it" });
    expect(parseBotCommand("subscribe en")).toEqual({ action: "subscribe", language: "en" });
  });

  it("recognizes opt-out commands and falls back to help", () => {
    expect(parseBotCommand("disiscriviti")).toEqual({ action: "unsubscribe" });
    expect(parseBotCommand("anything else")).toEqual({ action: "help" });
  });
});
