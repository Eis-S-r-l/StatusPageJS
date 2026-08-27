export const DEFAULT_TURNSTILE_SITE_KEY = "0x4AAAAAAEdj1rvMcjmnbsjH";

export function turnstileSiteKey(): string {
  return process.env.TURNSTILE_SITE_KEY?.trim() || DEFAULT_TURNSTILE_SITE_KEY;
}
