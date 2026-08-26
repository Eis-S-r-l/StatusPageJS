/**
 * Cognito places the user's group names in the signed ID token under the
 * `cognito:groups` claim. Group names are matched exactly and case-sensitively.
 */
export function belongsToCognitoGroup(
  claims: unknown,
  requiredGroup: string,
): boolean {
  if (!claims || typeof claims !== "object" || !requiredGroup) return false;

  const groups = (claims as Record<string, unknown>)["cognito:groups"];
  return Array.isArray(groups)
    && groups.every((group) => typeof group === "string")
    && groups.includes(requiredGroup);
}
