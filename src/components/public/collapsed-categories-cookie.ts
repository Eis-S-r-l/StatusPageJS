export const COLLAPSED_CATEGORIES_COOKIE = "eis-collapsed-categories";
export const COLLAPSED_CATEGORIES_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const MAX_COLLAPSED_CATEGORY_IDS = 100;
export const MAX_COLLAPSED_CATEGORIES_COOKIE_LENGTH = 2_048;

function decodeCookieValue(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Returns only known IDs, so new categories always start expanded. */
export function parseCollapsedCategoryIds(value: string | undefined, knownCategoryIds: readonly string[]): string[] {
  if (!value || value.length > MAX_COLLAPSED_CATEGORIES_COOKIE_LENGTH) return [];

  const decoded = decodeCookieValue(value);
  if (!decoded || decoded.length > MAX_COLLAPSED_CATEGORIES_COOKIE_LENGTH) return [];

  try {
    const parsed: unknown = JSON.parse(decoded);
    if (!Array.isArray(parsed) || parsed.length > MAX_COLLAPSED_CATEGORY_IDS) return [];
    const known = new Set(knownCategoryIds);
    return [...new Set(parsed)].filter((id): id is string => typeof id === "string" && known.has(id));
  } catch {
    return [];
  }
}

/** Serializes a bounded, de-duplicated preference value for client-side storage. */
export function serializeCollapsedCategoryIds(categoryIds: Iterable<string>): string {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of categoryIds) {
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    if (ids.length === MAX_COLLAPSED_CATEGORY_IDS) continue;
    const candidate = JSON.stringify([...ids, id]);
    if (encodeURIComponent(candidate).length <= MAX_COLLAPSED_CATEGORIES_COOKIE_LENGTH) ids.push(id);
  }

  return JSON.stringify(ids);
}
