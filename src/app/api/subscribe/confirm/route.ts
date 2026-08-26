import { NextRequest, NextResponse } from "next/server";

import { confirmEmailSubscription } from "@/modules/subscriptions/service";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length > 200) return NextResponse.json({ ok: false, message: "Invalid confirmation link." }, { status: 400 });
  try {
    const confirmed = await confirmEmailSubscription(token);
    return NextResponse.json(confirmed ? { ok: true, message: "Your subscription is confirmed." } : { ok: false, message: "This confirmation link is invalid or has already been used." }, { status: confirmed ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false, message: "Confirmation is temporarily unavailable." }, { status: 503 });
  }
}
