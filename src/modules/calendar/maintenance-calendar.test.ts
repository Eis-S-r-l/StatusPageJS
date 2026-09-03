import { describe, expect, it } from "vitest";

import type { CalendarMaintenanceEvent } from "@/modules/status/types";

import { buildMaintenanceCalendar, calendarResponse, maintenanceCalendarLinks, maintenanceFeedUrl } from "./maintenance-calendar";

const appUrl = new URL("https://status.eis.example");
const event: CalendarMaintenanceEvent = {
  kind: "maintenance",
  calendarId: "7ec6c92a-4766-4a9b-8a81-9dd51b6a5d89",
  slug: "database-upgrade",
  title: { en: "Database upgrade", it: "Aggiornamento database" },
  summary: { en: "<p>Capacity will increase.</p>", it: "<p>La capacità aumenterà.</p>" },
  state: "scheduled",
  startsAt: "2026-09-12T20:00:00.000Z",
  endsAt: "2026-09-12T21:30:00.000Z",
  scheduledStartsAt: "2026-09-12T20:00:00.000Z",
  scheduledEndsAt: "2026-09-12T21:30:00.000Z",
  updatedAt: "2026-09-03T08:15:30.000Z",
  affectedServices: [{ id: "api", name: { en: "Public API", it: "API pubblica" } }],
  affectsUptime: false,
  timeline: [],
};

describe("maintenance calendar", () => {
  it("builds pre-filled Google and Outlook event links", () => {
    const links = maintenanceCalendarLinks(event, "en", appUrl);
    const google = new URL(links.google);
    const outlook = new URL(links.outlook);

    expect(google.origin + google.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(google.searchParams.get("text")).toBe("Database upgrade");
    expect(google.searchParams.get("dates")).toBe("20260912T200000Z/20260912T213000Z");
    expect(google.searchParams.get("details")).toContain("Affected services: Public API");
    expect(outlook.origin + outlook.pathname).toBe("https://outlook.office.com/calendar/deeplink/compose");
    expect(outlook.searchParams.get("startdt")).toBe("2026-09-12T20:00:00.000Z");
    expect(outlook.searchParams.get("body")).toContain("https://status.eis.example/en/maintenance/database-upgrade");
    expect(links.download).toBe("/en/maintenance/database-upgrade/calendar.ics");
  });

  it("publishes a localized, updateable iCalendar feed with safe line folding", () => {
    const cancelled = {
      ...event,
      state: "cancelled" as const,
      title: { ...event.title, it: "Database, rete; e capacità 🚀" },
      summary: { ...event.summary, it: "Prima riga\nSeconda riga" },
    };
    const calendar = buildMaintenanceCalendar([cancelled], "it", { appUrl });

    expect(calendar).toContain("UID:maintenance-7ec6c92a-4766-4a9b-8a81-9dd51b6a5d89@status.eis.example");
    expect(calendar).toContain("DTSTART:20260912T200000Z");
    expect(calendar).toContain("LAST-MODIFIED:20260903T081530Z");
    expect(calendar).toContain("STATUS:CANCELLED");
    expect(calendar).toContain("SUMMARY:Database\\, rete\\; e capacità 🚀");
    expect(calendar).toContain("Prima riga\\nSeconda riga");
    expect(calendar).not.toContain("METHOD:PUBLISH");
    expect(calendar.replace(/\r\n/g, "")).not.toContain("\n");
    for (const line of calendar.trimEnd().split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("marks a single-event download for publishing and exposes the localized feed URL", () => {
    const body = buildMaintenanceCalendar([event], "en", { appUrl, singleEvent: true });
    const response = calendarResponse(body, "database-upgrade.ics", "attachment");

    expect(body).toContain("METHOD:PUBLISH");
    expect(maintenanceFeedUrl("it", appUrl)).toBe("https://status.eis.example/it/maintenance/calendar.ics");
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="database-upgrade.ics"');
  });
});
