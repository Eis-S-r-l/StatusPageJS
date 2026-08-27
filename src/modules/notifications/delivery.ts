import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { z } from "zod";

const payloadSchema = z.object({
  subject: z.string().min(1).max(998), text: z.string().min(1), html: z.string().optional(), telegramHtml: z.string().max(32768).optional(),
});

export interface DeliveryTarget { channel: "email" | "telegram" | "webex"; destination: string; payload: Record<string, unknown> }

export class PermanentDeliveryError extends Error {
  readonly permanent = true;
}

export function isPermanentTelegramFailure(status: number, description: string): boolean {
  return status === 403 || (status === 400 && /chat not found|bot was blocked|user is deactivated/i.test(description));
}

export function createTelegramDeliveryRequest(destination: string, content: { text: string; telegramHtml?: string }) {
  const fallbackText = content.text.length <= 4096 ? content.text : `${content.text.slice(0, 4095)}…`;
  return content.telegramHtml
    ? { method: "sendRichMessage", body: { chat_id: destination, rich_message: { html: content.telegramHtml } } }
    : { method: "sendMessage", body: { chat_id: destination, text: fallbackText } };
}

async function telegramRequest(token: string, method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function telegramError(response: Response) {
  const result = await response.json().catch(() => null) as { error_code?: number; description?: string } | null;
  return { code: result?.error_code ?? response.status, description: result?.description ?? "delivery rejected" };
}

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
    const request = createTelegramDeliveryRequest(target.destination, content);
    let response = await telegramRequest(token, request.method, request.body);
    if (!response.ok && request.method === "sendRichMessage" && (response.status === 400 || response.status === 404)) {
      const richFailure = await telegramError(response);
      if (isPermanentTelegramFailure(response.status, richFailure.description)) throw new PermanentDeliveryError(`Telegram permanently rejected delivery (${richFailure.code}): ${richFailure.description}`);
      response = await telegramRequest(token, "sendMessage", createTelegramDeliveryRequest(target.destination, { text: content.text }).body);
    }
    if (!response.ok) {
      const result = await telegramError(response);
      const description = result.description;
      const permanent = isPermanentTelegramFailure(response.status, description);
      if (permanent) throw new PermanentDeliveryError(`Telegram permanently rejected delivery (${result.code}): ${description}`);
      throw new Error(`Telegram rejected delivery (${response.status}): ${description}`);
    }
    return;
  }
  const token = process.env.WEBEX_BOT_TOKEN;
  if (!token) throw new Error("Webex is not configured");
  const response = await fetch("https://webexapis.com/v1/messages", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ roomId: target.destination, text: content.text }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Webex rejected delivery (${response.status})`);
}
