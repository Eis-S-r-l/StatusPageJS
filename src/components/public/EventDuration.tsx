"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/modules/i18n/config";

export function formatEventDuration(start: string, end: string | null, locale: Locale, now: string): string {
  const target = end ? Date.parse(end) : Date.parse(now);
  const totalMinutes = Math.max(0, Math.floor((target - Date.parse(start)) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [days ? `${days} ${locale === "it" ? "g" : "d"}` : "", hours ? `${hours} h` : "", minutes || (!days && !hours) ? `${minutes} min` : ""].filter(Boolean);
  return `${parts.join(" ")}${end ? "" : ` · ${locale === "it" ? "In corso" : "Ongoing"}`}`;
}

export function EventDuration({ start, end, locale, initialNow }: { start: string; end: string | null; locale: Locale; initialNow: string }) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    if (end) return;
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, [end]);

  return <span>{formatEventDuration(start, end, locale, now)}</span>;
}
