import type { Locale } from "@/modules/i18n/config";
import type { LocalizedText } from "./types";

export function sortLocalizedByOrder<T extends { id: string; displayOrder: number; name: LocalizedText }>(items: readonly T[], locale: Locale): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return [...items].sort((left, right) =>
    left.displayOrder - right.displayOrder
    || collator.compare(left.name[locale], right.name[locale])
    || left.id.localeCompare(right.id),
  );
}
