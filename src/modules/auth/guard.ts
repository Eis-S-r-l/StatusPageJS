import "server-only";

import { redirect } from "next/navigation";

import { getAuthConfig, isDevAuthEnabled } from "./config";
import { readAdminSession } from "./session";

export async function requireAdmin() {
  if (!getAuthConfig() && !isDevAuthEnabled()) redirect("/admin/setup-required");
  const session = await readAdminSession();
  if (!session) redirect("/api/auth/login");
  return session;
}
