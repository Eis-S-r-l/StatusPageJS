import { createHmac, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseBotCommand } from "@/modules/subscriptions/bot-command";
import { subscribeBot, unsubscribeBot } from "@/modules/subscriptions/bot-service";

const eventSchema = z.object({ data: z.object({ id: z.string().min(1), roomId: z.string().min(1) }) });
const messageSchema = z.object({ text: z.string().optional(), personEmail: z.string().optional() });

async function webexRequest(path: string, init?: RequestInit) {
  const token = process.env.WEBEX_BOT_TOKEN;
  if (!token) throw new Error("Webex is not configured");
  const response = await fetch(`https://webexapis.com/v1${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Webex rejected the request (${response.status})`);
  return response;
}

async function reply(roomId: string, text: string) {
  await webexRequest("/messages", { method: "POST", body: JSON.stringify({ roomId, text }) });
}

export async function POST(request: NextRequest) {
  const secret = process.env.WEBEX_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  const body = await request.text();
  const received = request.headers.get("x-spark-signature") ?? "";
  const calculated = createHmac("sha1", secret).update(body).digest("hex");
  const left = Buffer.from(received, "utf8");
  const right = Buffer.from(calculated, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const event = eventSchema.parse(JSON.parse(body));
    const message = messageSchema.parse(await (await webexRequest(`/messages/${encodeURIComponent(event.data.id)}`)).json());
    if (process.env.WEBEX_BOT_EMAIL && message.personEmail?.toLowerCase() === process.env.WEBEX_BOT_EMAIL.toLowerCase()) return new NextResponse(null, { status: 204 });
    const command = parseBotCommand(message.text);
    if (command.action === "subscribe") {
      await subscribeBot({ channel: "webex", destination: event.data.roomId, language: command.language });
      await reply(event.data.roomId, command.language === "it" ? "Iscrizione confermata. Scrivi ‘stop’ per annullare." : "Subscription confirmed. Send ‘stop’ to unsubscribe.");
    } else if (command.action === "unsubscribe") {
      await unsubscribeBot("webex", event.data.roomId);
      await reply(event.data.roomId, "Notifications disabled. / Notifiche disattivate.");
    } else await reply(event.data.roomId, "Send ‘subscribe en’ or ‘subscribe it’. Send ‘stop’ to unsubscribe.");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Webex webhook failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
