import { isLocale, type Locale } from "./config";

export const LANGUAGE_COOKIE = "eis-language";
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseLanguagePreference(value: string | undefined): Locale {
  return value && isLocale(value) ? value : "en";
}
