import { describe, expect, it } from "vitest";

import { parseBotCommand, parseWebexBotCommand } from "./bot-command";

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

describe("parseWebexBotCommand", () => {
  it("extracts commands that follow a bot mention in a group space", () => {
    expect(parseWebexBotCommand("EIS subscribe en")).toEqual({ action: "subscribe", language: "en" });
    expect(parseWebexBotCommand("EIS Status subscribe it")).toEqual({ action: "subscribe", language: "it" });
    expect(parseWebexBotCommand("EIS stop")).toEqual({ action: "unsubscribe" });
  });

  it("preserves direct-message commands and rejects messages without a command", () => {
    expect(parseWebexBotCommand("subscribe it")).toEqual({ action: "subscribe", language: "it" });
    expect(parseWebexBotCommand("EIS hello")).toEqual({ action: "help" });
  });
});
