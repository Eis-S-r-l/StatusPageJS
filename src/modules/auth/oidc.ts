import "server-only";

import * as oidc from "openid-client";

import { getAuthConfig } from "./config";

export async function getOidcConfiguration() {
  const environment = getAuthConfig();
  if (!environment) throw new Error("Administrator authentication is not configured");

  const authentication = environment.COGNITO_CLIENT_SECRET
    ? oidc.ClientSecretPost(environment.COGNITO_CLIENT_SECRET)
    : oidc.None();
  const configuration = await oidc.discovery(
    new URL(environment.COGNITO_ISSUER),
    environment.COGNITO_CLIENT_ID,
    undefined,
    authentication,
  );
  return { configuration, environment };
}
