import { buildMaintenanceCalendar, calendarResponse } from "@/modules/calendar/maintenance-calendar";
import { isLocale } from "@/modules/i18n/config";
import { publicStatusRepository } from "@/modules/status/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });
  const events = await publicStatusRepository.listCalendarMaintenances();
  const calendar = buildMaintenanceCalendar(events, locale);
  return calendarResponse(calendar, `eis-maintenance-${locale}.ics`, "inline");
}
