export type BotCommand = { action: "subscribe"; language: "en" | "it" } | { action: "unsubscribe" } | { action: "help" };

export function parseBotCommand(value: unknown): BotCommand {
  if (typeof value !== "string") return { action: "help" };
  const [rawCommand = "", rawLanguage = ""] = value.trim().toLowerCase().split(/\s+/, 2);
  const command = rawCommand.replace(/^\//, "").split("@")[0];
  if (["stop", "unsubscribe", "annulla", "disiscriviti"].includes(command)) return { action: "unsubscribe" };
  if (["start", "subscribe", "iscriviti"].includes(command)) return { action: "subscribe", language: rawLanguage === "it" ? "it" : "en" };
  return { action: "help" };
}

export function parseWebexBotCommand(value: unknown): BotCommand {
  if (typeof value !== "string") return { action: "help" };
  const tokens = value.trim().split(/\s+/);
  const commandIndex = tokens.findIndex((token) => {
    const command = token.toLowerCase().replace(/^\//, "").split("@")[0];
    return ["start", "subscribe", "iscriviti", "stop", "unsubscribe", "annulla", "disiscriviti"].includes(command);
  });
  if (commandIndex < 0) return { action: "help" };
  return parseBotCommand(tokens.slice(commandIndex, commandIndex + 2).join(" "));
}
