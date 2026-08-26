import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { z } from "zod";

const payloadSchema = z.object({
  subject: z.string().min(1).max(998), text: z.string().min(1), html: z.string().optional(),
});

export interface DeliveryTarget { channel: "email" | "telegram" | "webex"; destination: string; payload: Record<string, unknown> }

function assertDeliveryAllowed() {
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PHASE?.includes("build")) {
    throw new Error("External delivery is disabled during tests and builds");
  }
}

export async function deliver(target: DeliveryTarget): Promise<void> {
  assertDeliveryAllowed();
  const content = payloadSchema.parse(target.payload);
  if (target.channel === "email") {
    const from = process.env.SES_FROM_EMAIL;
    const region = process.env.AWS_REGION;
    if (!from || !region) throw new Error("SES is not configured");
    await new SESv2Client({ region }).send(new SendEmailCommand({
      FromEmailAddress: from, Destination: { ToAddresses: [target.destination] },
      Content: { Simple: { Subject: { Data: content.subject, Charset: "UTF-8" }, Body: { Text: { Data: content.text, Charset: "UTF-8" }, ...(content.html ? { Html: { Data: content.html, Charset: "UTF-8" } } : {}) } } },
    }));
    return;
  }
  if (target.channel === "telegram") {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Telegram is not configured");
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: target.destination, text: content.text }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Telegram rejected delivery (${response.status})`);
    return;
  }
  const token = process.env.WEBEX_BOT_TOKEN;
  if (!token) throw new Error("Webex is not configured");
  const response = await fetch("https://webexapis.com/v1/messages", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ roomId: target.destination, text: content.text }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Webex rejected delivery (${response.status})`);
}
