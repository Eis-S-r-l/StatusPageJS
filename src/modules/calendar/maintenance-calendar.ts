import { richTextToPlainText } from "@/modules/content/rich-text";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { CalendarMaintenanceEvent, StatusEvent } from "@/modules/status/types";

const GOOGLE_CALENDAR_URL = "https://calendar.google.com/calendar/render";
const OUTLOOK_CALENDAR_URL = "https://outlook.office.com/calendar/deeplink/compose";
const ICAL_LINE_BYTES = 75;
const SEQUENCE_EPOCH = Date.UTC(2020, 0, 1);

export function publicAppUrl(): URL {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export function maintenanceFeedUrl(locale: Locale, appUrl = publicAppUrl()): string {
  return new URL(`/${locale}/maintenance/calendar.ics`, appUrl).toString();
}

export function maintenanceDetailUrl(event: Pick<StatusEvent, "slug">, locale: Locale, appUrl = publicAppUrl()): string {
  return new URL(`/${locale}/maintenance/${encodeURIComponent(event.slug)}`, appUrl).toString();
}

function calendarDescription(event: StatusEvent, locale: Locale, detailUrl: string): string {
  const t = getDictionary(locale);
  const services = event.affectedServices.map((service) => service.name[locale]).join(", ");
  return [
    richTextToPlainText(event.summary[locale]),
    services ? `${t.affectedServices}: ${services}` : "",
    `${t.viewDetails}: ${detailUrl}`,
  ].filter(Boolean).join("\n\n");
}

function providerDescription(value: string): string {
  const limit = 1_200;
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

function compactUtcDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid calendar date");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function maintenanceCalendarLinks(event: StatusEvent, locale: Locale, appUrl = publicAppUrl()) {
  if (!event.endsAt) throw new Error("A calendar event needs an end time");
  const detailUrl = maintenanceDetailUrl(event, locale, appUrl);
  const description = providerDescription(calendarDescription(event, locale, detailUrl));

  const google = new URL(GOOGLE_CALENDAR_URL);
  google.searchParams.set("action", "TEMPLATE");
  google.searchParams.set("text", event.title[locale]);
  google.searchParams.set("dates", `${compactUtcDate(event.startsAt)}/${compactUtcDate(event.endsAt)}`);
  google.searchParams.set("details", description);
  google.searchParams.set("ctz", "Europe/Rome");

  const outlook = new URL(OUTLOOK_CALENDAR_URL);
  outlook.searchParams.set("path", "/calendar/action/compose");
  outlook.searchParams.set("rru", "addevent");
  outlook.searchParams.set("subject", event.title[locale]);
  outlook.searchParams.set("startdt", new Date(event.startsAt).toISOString());
  outlook.searchParams.set("enddt", new Date(event.endsAt).toISOString());
  outlook.searchParams.set("body", description);

  return {
    google: google.toString(),
    outlook: outlook.toString(),
    download: `/${locale}/maintenance/${encodeURIComponent(event.slug)}/calendar.ics`,
  };
}

function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function foldIcalLine(line: string): string {
  const chunks: string[] = [];
  let chunk = "";
  let limit = ICAL_LINE_BYTES;
  for (const character of line) {
    if (chunk && byteLength(chunk + character) > limit) {
      chunks.push(chunk);
      chunk = character;
      limit = ICAL_LINE_BYTES - 1;
    } else {
      chunk += character;
    }
  }
  chunks.push(chunk);
  return chunks.join("\r\n ");
}

function sequenceFor(value: string): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Invalid calendar revision date");
  return Math.max(0, Math.floor((timestamp - SEQUENCE_EPOCH) / 1_000));
}

function eventLines(event: CalendarMaintenanceEvent, locale: Locale, appUrl: URL): string[] {
  const detailUrl = maintenanceDetailUrl(event, locale, appUrl);
  const uidDomain = appUrl.hostname || "localhost";
  return [
    "BEGIN:VEVENT",
    `UID:maintenance-${event.calendarId}@${uidDomain}`,
    `DTSTAMP:${compactUtcDate(event.updatedAt)}`,
    `LAST-MODIFIED:${compactUtcDate(event.updatedAt)}`,
    `SEQUENCE:${sequenceFor(event.updatedAt)}`,
    `DTSTART:${compactUtcDate(event.scheduledStartsAt)}`,
    `DTEND:${compactUtcDate(event.scheduledEndsAt)}`,
    `SUMMARY:${escapeIcalText(event.title[locale])}`,
    `DESCRIPTION:${escapeIcalText(calendarDescription(event, locale, detailUrl))}`,
    `URL:${detailUrl}`,
    `STATUS:${event.state === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

export function buildMaintenanceCalendar(
  events: CalendarMaintenanceEvent[],
  locale: Locale,
  options: { appUrl?: URL; singleEvent?: boolean } = {},
): string {
  const appUrl = options.appUrl ?? publicAppUrl();
  const t = getDictionary(locale);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EIS//Service Status Maintenance//EN",
    "CALSCALE:GREGORIAN",
    ...(options.singleEvent ? ["METHOD:PUBLISH"] : []),
    `X-WR-CALNAME:${escapeIcalText(t.maintenanceTitle)}`,
    ...[...events]
      .sort((left, right) => Date.parse(left.scheduledStartsAt) - Date.parse(right.scheduledStartsAt))
      .flatMap((event) => eventLines(event, locale, appUrl)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcalLine).join("\r\n")}\r\n`;
}

export function calendarResponse(body: string, filename: string, disposition: "attachment" | "inline"): Response {
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
      "Content-Disposition": `${disposition}; filename="${filename.replace(/[^a-z0-9._-]/gi, "-")}"`,
      "Content-Type": "text/calendar; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
