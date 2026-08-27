import "server-only";

import { z } from "zod";

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

export class TurnstileConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnstileConfigurationError";
  }
}

function configuredHostnames(): Set<string> {
  return new Set(
    (process.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function verifyTurnstileToken({
  token,
  expectedAction,
  remoteIp,
}: {
  token: string;
  expectedAction: "subscribe" | "unsubscribe";
  remoteIp?: string;
}): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  const hostnames = configuredHostnames();

  if (!secret) throw new TurnstileConfigurationError("TURNSTILE_SECRET is not configured.");
  if (hostnames.size === 0) throw new TurnstileConfigurationError("TURNSTILE_HOSTNAMES is not configured.");
  if (!token || token.length > 2048) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;

    const parsed = siteverifyResponseSchema.safeParse(await response.json());
    if (!parsed.success) return false;

    const hostname = parsed.data.hostname?.trim().toLowerCase();
    return parsed.data.success === true
      && parsed.data.action === expectedAction
      && typeof hostname === "string"
      && hostnames.has(hostname);
  } catch {
    return false;
  }
}
