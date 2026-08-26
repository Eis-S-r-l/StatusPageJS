import type { Locale } from "@/modules/i18n/config";
import type { EventState } from "@/modules/status/types";
import type { Dictionary } from "@/modules/i18n/dictionaries";

export function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome",
  }).format(new Date(value));
}

export function eventStateLabel(state: EventState, dictionary: Dictionary): string {
  const labels: Record<EventState, string> = {
    investigating: dictionary.investigating, identified: dictionary.identified,
    monitoring: dictionary.monitoring, resolved: dictionary.resolved,
    scheduled: dictionary.scheduled, in_progress: dictionary.inProgress, completed: dictionary.completed, cancelled: dictionary.cancelled,
  };
  return labels[state];
}
