import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import * as oidc from "openid-client";

import { getAuthConfig, OIDC_FLOW_COOKIE } from "@/modules/auth/config";
import { getOidcConfiguration } from "@/modules/auth/oidc";

export async function GET() {
  try {
    const { configuration, environment } = await getOidcConfiguration();
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const flow = Buffer.from(JSON.stringify({ verifier, state, nonce })).toString("base64url");
    (await cookies()).set(OIDC_FLOW_COOKIE, flow, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 10 * 60,
    });
    const url = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: environment.COGNITO_REDIRECT_URI,
      scope: "openid email profile",
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });
    return NextResponse.redirect(url);
  } catch {
    const path = getAuthConfig() ? "/admin/login-error" : "/admin/setup-required";
    return NextResponse.redirect(new URL(path, process.env.APP_URL ?? "http://localhost:3000"));
  }
}
