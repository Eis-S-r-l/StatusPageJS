import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { getAuthConfig, isDevAuthEnabled, SESSION_COOKIE } from "./config";

export interface AdminSession {
  subject: string;
  email?: string;
  name?: string;
}

function secret(): Uint8Array | null {
  const value = getAuthConfig()?.SESSION_SECRET;
  return value ? new TextEncoder().encode(value) : null;
}

export async function createSessionToken(session: AdminSession): Promise<string> {
  const key = secret();
  if (!key) throw new Error("Administrator authentication is not configured");
  return new SignJWT({ email: session.email, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.subject)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key);
}

export async function readAdminSession(): Promise<AdminSession | null> {
  if (isDevAuthEnabled()) {
    return { subject: "local-development-admin", name: "Local administrator" };
  }
  const key = secret();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    if (!payload.sub) return null;
    return {
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

export const adminSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 8,
};
