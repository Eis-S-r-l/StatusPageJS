export type BotCommand = { action: "subscribe"; language: "en" | "it" } | { action: "unsubscribe" } | { action: "help" };

export function parseBotCommand(value: unknown): BotCommand {
  if (typeof value !== "string") return { action: "help" };
  const [rawCommand = "", rawLanguage = ""] = value.trim().toLowerCase().split(/\s+/, 2);
  const command = rawCommand.replace(/^\//, "").split("@")[0];
  if (["stop", "unsubscribe", "annulla", "disiscriviti"].includes(command)) return { action: "unsubscribe" };
  if (["start", "subscribe", "iscriviti"].includes(command)) return { action: "subscribe", language: rawLanguage === "it" ? "it" : "en" };
  return { action: "help" };
}
