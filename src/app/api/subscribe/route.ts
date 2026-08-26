import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requestEmailSubscription } from "@/modules/subscriptions/service";

const schema = z.object({
  email: z.email().max(320), language: z.enum(["en", "it"]).default("en"),
  receiveIncidents: z.boolean().default(true), receiveMaintenance: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const raw = contentType.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    const parsed = schema.parse({ ...raw, receiveIncidents: raw.receiveIncidents !== false && raw.receiveIncidents !== "false", receiveMaintenance: raw.receiveMaintenance !== false && raw.receiveMaintenance !== "false" });
    await requestEmailSubscription(parsed);
    return NextResponse.json({ ok: true, message: "If the address can receive mail, a confirmation has been queued." }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, message: "Enter a valid email address and language." }, { status: 400 });
    return NextResponse.json({ ok: false, message: "Subscriptions are temporarily unavailable." }, { status: 503 });
  }
}
