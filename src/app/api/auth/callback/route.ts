import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import * as oidc from "openid-client";

import { belongsToCognitoGroup } from "@/modules/auth/authorization";
import { OIDC_FLOW_COOKIE, SESSION_COOKIE } from "@/modules/auth/config";
import { getOidcConfiguration } from "@/modules/auth/oidc";
import { adminSessionCookieOptions, createSessionToken } from "@/modules/auth/session";

interface FlowState { verifier: string; state: string; nonce: string }

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  try {
    const encoded = cookieStore.get(OIDC_FLOW_COOKIE)?.value;
    if (!encoded) throw new Error("Login flow expired");
    const flow = JSON.parse(Buffer.from(encoded, "base64url").toString()) as FlowState;
    const { configuration, environment } = await getOidcConfiguration();
    const tokens = await oidc.authorizationCodeGrant(configuration, new URL(request.url), {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
    });
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error("Identity token is missing a subject");
    if (!belongsToCognitoGroup(claims, environment.COGNITO_ADMIN_GROUP)) {
      throw new Error("Identity is not in the configured administrator group");
    }
    const token = await createSessionToken({
      subject: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
      name: typeof claims.name === "string" ? claims.name : undefined,
    });
    const response = NextResponse.redirect(new URL("/admin", environment.COGNITO_REDIRECT_URI));
    response.cookies.set(SESSION_COOKIE, token, adminSessionCookieOptions);
    response.cookies.delete(OIDC_FLOW_COOKIE);
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/admin/login-error", request.url));
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(OIDC_FLOW_COOKIE);
    return response;
  }
}
