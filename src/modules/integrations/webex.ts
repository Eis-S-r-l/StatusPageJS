const MAX_WEBEX_TEXT_BYTES = 22_000;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function descriptions(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(descriptions);
  const record = asRecord(value);
  if (!record) return [];
  return [record.description, record.reason, record.message].flatMap(descriptions);
}

export function describeWebexError(body: unknown): string {
  const record = asRecord(body);
  if (!record) return "request rejected";
  const details = [record.message, record.errors, record.error].flatMap(descriptions)
    .map((value) => value.trim()).filter(Boolean);
  const trackingId = typeof record.trackingId === "string" ? record.trackingId.trim() : "";
  const unique = [...new Set(details)];
  const message = unique.length ? unique.join(": ") : "request rejected";
  return `${message}${trackingId ? ` (tracking ID: ${trackingId})` : ""}`.slice(0, 900);
}

export async function webexErrorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return "request rejected";
  try {
    return describeWebexError(JSON.parse(text));
  } catch {
    return text.replace(/\s+/g, " ").trim().slice(0, 900) || "request rejected";
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  const suffix = "…";
  const target = maxBytes - Buffer.byteLength(suffix, "utf8");
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > target) break;
    result += character;
    bytes += size;
  }
  return `${result}${suffix}`;
}

export function createWebexMessagePayload(roomId: string, text: string) {
  return { roomId, text: truncateUtf8(text, MAX_WEBEX_TEXT_BYTES) };
}
