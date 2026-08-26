import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { allowSubscriptionRequest, requestClientKey } from "@/modules/subscriptions/rate-limit";
import { requestEmailUnsubscription } from "@/modules/subscriptions/service";

const schema = z.object({ email: z.email().max(320), language: z.enum(["en", "it"]).default("en") });
const generic = "If that address has an active subscription, a confirmation email has been queued.";

export async function POST(request: NextRequest) {
  try {
    const raw = (request.headers.get("content-type") ?? "").includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    const input = schema.parse(raw);
    if (allowSubscriptionRequest(requestClientKey(request, "unsubscribe"))) await requestEmailUnsubscription(input);
    return NextResponse.json({ ok: true, message: generic }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, message: "Enter a valid email address and language." }, { status: 400 });
    return NextResponse.json({ ok: false, message: "Unsubscription is temporarily unavailable." }, { status: 503 });
  }
}
