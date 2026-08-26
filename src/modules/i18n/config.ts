export const locales = ["en", "it"] as const;
export type Locale = (typeof locales)[number];
export function isLocale(value: string): value is Locale { return locales.includes(value as Locale); }
export function otherLocale(locale: Locale): Locale { return locale === "en" ? "it" : "en"; }
