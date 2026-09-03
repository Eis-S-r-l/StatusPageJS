import { CalendarPlus, ChevronDown, Download, ExternalLink } from "lucide-react";

import { maintenanceCalendarLinks } from "@/modules/calendar/maintenance-calendar";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { StatusEvent } from "@/modules/status/types";

import styles from "./public.module.css";

export function MaintenanceCalendarActions({ event, locale }: { event: StatusEvent; locale: Locale }) {
  const t = getDictionary(locale);
  const links = maintenanceCalendarLinks(event, locale);

  return (
    <div className={styles.detailActions}>
      <details className={styles.calendarActionMenu}>
        <summary><CalendarPlus size={17} aria-hidden="true" />{t.addToCalendar}<ChevronDown className={styles.calendarMenuChevron} size={16} aria-hidden="true" /></summary>
        <div className={styles.calendarActionPopover}>
          <a href={links.google} target="_blank" rel="noopener noreferrer">{t.googleCalendar}<ExternalLink size={14} aria-hidden="true" /></a>
          <a href={links.outlook} target="_blank" rel="noopener noreferrer">{t.outlookCalendar}<ExternalLink size={14} aria-hidden="true" /></a>
          <a href={links.download}>{t.downloadCalendarFile}<Download size={14} aria-hidden="true" /></a>
        </div>
      </details>
    </div>
  );
}
