import { describe, expect, it } from "vitest";

import { belongsToCognitoGroup } from "./authorization";

describe("belongsToCognitoGroup", () => {
  it("allows a user in the configured group", () => {
    expect(belongsToCognitoGroup(
      { sub: "user-1", "cognito:groups": ["Operators", "StatusAdmins"] },
      "StatusAdmins",
    )).toBe(true);
  });

  it("rejects a user in other groups", () => {
    expect(belongsToCognitoGroup(
      { sub: "user-1", "cognito:groups": ["Operators"] },
      "StatusAdmins",
    )).toBe(false);
  });

  it("rejects missing or malformed group claims", () => {
    expect(belongsToCognitoGroup({ sub: "user-1" }, "StatusAdmins")).toBe(false);
    expect(belongsToCognitoGroup(
      { sub: "user-1", "cognito:groups": "StatusAdmins" },
      "StatusAdmins",
    )).toBe(false);
  });

  it("matches group names case-sensitively", () => {
    expect(belongsToCognitoGroup(
      { sub: "user-1", "cognito:groups": ["statusadmins"] },
      "StatusAdmins",
    )).toBe(false);
  });
});
