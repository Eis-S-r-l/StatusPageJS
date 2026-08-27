import { createHmac, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { webexErrorDetail } from "@/modules/integrations/webex";
import { parseWebexBotCommand } from "@/modules/subscriptions/bot-command";
import { subscribeBot, unsubscribeBot } from "@/modules/subscriptions/bot-service";
import { webexSubscriberProfile } from "@/modules/subscriptions/webex-profile";

const eventSchema = z.object({ data: z.object({ id: z.string().min(1), roomId: z.string().min(1) }) });
const messageSchema = z.object({ text: z.string().optional(), personId: z.string().optional(), personEmail: z.string().optional(), roomType: z.enum(["direct", "group"]).optional() });
const personSchema = z.object({
  emails: z.array(z.string()).optional(), displayName: z.string().optional(), nickName: z.string().optional(),
  firstName: z.string().optional(), lastName: z.string().optional(),
});

async function webexRequest(path: string, init?: RequestInit) {
  const token = process.env.WEBEX_BOT_TOKEN;
  if (!token) throw new Error("Webex is not configured");
  const response = await fetch(`https://webexapis.com/v1${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Webex rejected the request (${response.status}): ${await webexErrorDetail(response)}`);
  return response;
}

async function loadPersonProfile(personId?: string) {
  if (!personId) return null;
  try {
    return personSchema.parse(await (await webexRequest(`/people/${encodeURIComponent(personId)}`)).json());
  } catch (error) {
    console.warn("Webex subscriber profile lookup failed; continuing with message identity", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}

async function reply(roomId: string, text: string) {
  await webexRequest("/messages", { method: "POST", body: JSON.stringify({ roomId, text }) });
}

function subscriptionConfirmation(language: "en" | "it", roomType?: "direct" | "group") {
  if (language === "it") return roomType === "group"
    ? "Iscrizione confermata per questo spazio. Menziona questo bot e scrivi ‘stop’ per annullare."
    : "Iscrizione confermata. Scrivi ‘stop’ per annullare.";
  return roomType === "group"
    ? "Subscription confirmed for this space. Mention this bot with ‘stop’ to unsubscribe."
    : "Subscription confirmed. Send ‘stop’ to unsubscribe.";
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
    const command = parseWebexBotCommand(message.text);
    if (command.action === "subscribe") {
      const profile = webexSubscriberProfile(message, await loadPersonProfile(message.personId));
      await subscribeBot({ channel: "webex", destination: event.data.roomId, language: command.language, ...profile });
      await reply(event.data.roomId, subscriptionConfirmation(command.language, message.roomType));
    } else if (command.action === "unsubscribe") {
      await unsubscribeBot("webex", event.data.roomId);
      await reply(event.data.roomId, "Notifications disabled. / Notifiche disattivate.");
    } else await reply(event.data.roomId, message.roomType === "group"
      ? "Mention this bot with ‘subscribe en’ or ‘subscribe it’. Mention it with ‘stop’ to unsubscribe."
      : "Send ‘subscribe en’ or ‘subscribe it’. Send ‘stop’ to unsubscribe.");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Webex webhook failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
