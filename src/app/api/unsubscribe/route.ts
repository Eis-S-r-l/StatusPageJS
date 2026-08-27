import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { allowSubscriptionRequest, requestClientIp, requestClientKey } from "@/modules/subscriptions/rate-limit";
import { requestEmailUnsubscription } from "@/modules/subscriptions/service";
import { TurnstileConfigurationError, verifyTurnstileToken } from "@/modules/subscriptions/turnstile";

const schema = z.object({ email: z.email().max(320), language: z.enum(["en", "it"]).default("en") });
const generic = "If that address has an active subscription, a confirmation email has been queued.";

export async function POST(request: NextRequest) {
  try {
    const raw = (request.headers.get("content-type") ?? "").includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    const token = raw && typeof raw === "object" ? (raw as Record<string, unknown>)["cf-turnstile-response"] : undefined;
    if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
      return NextResponse.json({ ok: false, message: "Security verification failed. Please try again." }, { status: 403 });
    }
    const input = schema.parse(raw);
    if (!allowSubscriptionRequest(requestClientKey(request, "unsubscribe"))) {
      return NextResponse.json({ ok: false, message: "Too many requests. Please try again later." }, { status: 429, headers: { "retry-after": "900" } });
    }
    const verified = await verifyTurnstileToken({ token, expectedAction: "unsubscribe", remoteIp: requestClientIp(request) });
    if (!verified) return NextResponse.json({ ok: false, message: "Security verification failed. Please try again." }, { status: 403 });
    await requestEmailUnsubscription({ email: input.email, language: input.language });
    return NextResponse.json({ ok: true, message: generic }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, message: "Enter a valid email address and language." }, { status: 400 });
    if (error instanceof TurnstileConfigurationError) console.error(error.message);
    return NextResponse.json({ ok: false, message: "Unsubscription is temporarily unavailable." }, { status: 503 });
  }
}
