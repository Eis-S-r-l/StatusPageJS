const attempts = new Map<string, number[]>();

export function allowSubscriptionRequest(key: string, now = Date.now(), limit = 5, windowMs = 15 * 60_000): boolean {
  const recent = (attempts.get(key) ?? []).filter((timestamp) => timestamp > now - windowMs);
  if (recent.length >= limit) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 10_000) {
    for (const [entry, timestamps] of attempts) if (!timestamps.some((timestamp) => timestamp > now - windowMs)) attempts.delete(entry);
  }
  return true;
}

export function requestClientKey(request: Request, purpose: string): string {
  // Nginx is the only public entry point and overwrites X-Real-IP. Prefer it
  // over the first X-Forwarded-For value, which a client can spoof before
  // Nginx appends the real peer address.
  return `${purpose}:${requestClientIp(request)}`;
}

export function requestClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return realIp || forwarded || "unknown";
}

export function clearRateLimitsForTests(): void { attempts.clear(); }
