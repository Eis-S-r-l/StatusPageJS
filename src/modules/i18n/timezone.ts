export const DEFAULT_PUBLIC_TIMEZONE = "Europe/Rome";

export function publicTimezone(value: string | null | undefined): string {
  if (!value) return DEFAULT_PUBLIC_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    return DEFAULT_PUBLIC_TIMEZONE;
  }
}
