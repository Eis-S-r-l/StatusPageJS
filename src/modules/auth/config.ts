import "server-only";

import { z } from "zod";

const authEnvironment = z.object({
  COGNITO_ISSUER: z.string().url(),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_CLIENT_SECRET: z.string().optional(),
  COGNITO_DOMAIN: z.string().url(),
  COGNITO_REDIRECT_URI: z.string().url(),
  COGNITO_LOGOUT_REDIRECT_URI: z.string().url(),
  SESSION_SECRET: z.string().min(32),
});

export type AuthConfig = z.infer<typeof authEnvironment>;

export function getAuthConfig(): AuthConfig | null {
  const result = authEnvironment.safeParse(process.env);
  return result.success ? result.data : null;
}

export function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_DEV_BYPASS === "true";
}

export const SESSION_COOKIE = "eis_admin_session";
export const OIDC_FLOW_COOKIE = "eis_oidc_flow";
