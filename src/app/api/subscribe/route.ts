import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requestEmailSubscription } from "@/modules/subscriptions/service";
import { allowSubscriptionRequest, requestClientIp, requestClientKey } from "@/modules/subscriptions/rate-limit";
import { TurnstileConfigurationError, verifyTurnstileToken } from "@/modules/subscriptions/turnstile";

const schema = z.object({
  email: z.email().max(320), language: z.enum(["en", "it"]).default("en"),
  receiveIncidents: z.boolean().default(true), receiveMaintenance: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const raw = contentType.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    const token = raw && typeof raw === "object" ? (raw as Record<string, unknown>)["cf-turnstile-response"] : undefined;
    if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
      return NextResponse.json({ ok: false, message: "Security verification failed. Please try again." }, { status: 403 });
    }
    const parsed = schema.parse({ ...raw, receiveIncidents: raw.receiveIncidents !== false && raw.receiveIncidents !== "false", receiveMaintenance: raw.receiveMaintenance !== false && raw.receiveMaintenance !== "false" });
    if (!allowSubscriptionRequest(requestClientKey(request, "subscribe"))) {
      return NextResponse.json({ ok: false, message: "Too many requests. Please try again later." }, { status: 429, headers: { "retry-after": "900" } });
    }
    const verified = await verifyTurnstileToken({ token, expectedAction: "subscribe", remoteIp: requestClientIp(request) });
    if (!verified) return NextResponse.json({ ok: false, message: "Security verification failed. Please try again." }, { status: 403 });
    await requestEmailSubscription({ email: parsed.email, language: parsed.language, receiveIncidents: parsed.receiveIncidents, receiveMaintenance: parsed.receiveMaintenance });
    return NextResponse.json({ ok: true, message: "If the address can receive mail, a confirmation has been queued." }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, message: "Enter a valid email address and language." }, { status: 400 });
    if (error instanceof TurnstileConfigurationError) console.error(error.message);
    return NextResponse.json({ ok: false, message: "Subscriptions are temporarily unavailable." }, { status: 503 });
  }
}
