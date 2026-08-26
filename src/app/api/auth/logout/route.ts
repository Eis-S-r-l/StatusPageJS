import { NextRequest, NextResponse } from "next/server";

import { getAuthConfig, SESSION_COOKIE } from "@/modules/auth/config";

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  const fallback = new URL("/", request.url);
  const destination = config
    ? new URL(`/logout?client_id=${encodeURIComponent(config.COGNITO_CLIENT_ID)}&logout_uri=${encodeURIComponent(config.COGNITO_LOGOUT_REDIRECT_URI)}`, config.COGNITO_DOMAIN)
    : fallback;
  const response = NextResponse.redirect(destination);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
