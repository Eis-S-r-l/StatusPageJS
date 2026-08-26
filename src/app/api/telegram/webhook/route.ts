import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseBotCommand } from "@/modules/subscriptions/bot-command";
import { subscribeBot, unsubscribeBot } from "@/modules/subscriptions/bot-service";

const updateSchema = z.object({ message: z.object({ text: z.string().optional(), chat: z.object({
  id: z.union([z.string(), z.number()]), username: z.string().optional(), first_name: z.string().optional(), last_name: z.string().optional(), title: z.string().optional(),
}) }).optional() });

async function reply(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Telegram rejected the response (${response.status})`);
}

export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return NextResponse.json({ ok: false }, { status: 503 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== expected) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const update = updateSchema.parse(await request.json());
    if (!update.message) return new NextResponse(null, { status: 204 });
    const destination = String(update.message.chat.id);
    const command = parseBotCommand(update.message.text);
    if (command.action === "subscribe") {
      const chat = update.message.chat;
      const displayName = chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(" ") || null);
      await subscribeBot({ channel: "telegram", destination, language: command.language, username: chat.username ?? null, displayName });
      await reply(destination, command.language === "it" ? "Iscrizione confermata. Riceverai aggiornamenti su incidenti e manutenzioni. Invia /stop per annullare." : "Subscription confirmed. You will receive incident and maintenance updates. Send /stop to unsubscribe.");
    } else if (command.action === "unsubscribe") {
      await unsubscribeBot("telegram", destination);
      await reply(destination, "Notifications disabled. / Notifiche disattivate.");
    } else await reply(destination, "Send /start en or /start it to subscribe. Send /stop to unsubscribe.");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Telegram webhook failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
