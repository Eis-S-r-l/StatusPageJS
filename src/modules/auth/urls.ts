/** Build the canonical public callback URL while preserving Cognito's response. */
export function buildOidcCallbackUrl(
  configuredRedirectUri: string,
  incomingUrl: string | URL,
): URL {
  const callbackUrl = new URL(configuredRedirectUri);
  callbackUrl.search = new URL(incomingUrl).search;
  callbackUrl.hash = "";
  return callbackUrl;
}

/** Keep authentication redirects on the public application origin. */
export function buildPublicAppUrl(
  path: string,
  appUrl: string | undefined,
  fallbackUrl: string | URL,
): URL {
  if (appUrl) {
    try {
      return new URL(path, appUrl);
    } catch {
      // Fall back to the known Cognito redirect URI or incoming request URL.
    }
  }
  return new URL(path, fallbackUrl);
}
