import { buildMaintenanceCalendar, calendarResponse } from "@/modules/calendar/maintenance-calendar";
import { isLocale } from "@/modules/i18n/config";
import { publicStatusRepository } from "@/modules/status/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });
  const event = await publicStatusRepository.getMaintenance(slug);
  if (!event) return new Response("Not found", { status: 404 });
  const calendar = buildMaintenanceCalendar([event], locale, { singleEvent: true });
  return calendarResponse(calendar, `${event.slug}.ics`, "attachment");
}
