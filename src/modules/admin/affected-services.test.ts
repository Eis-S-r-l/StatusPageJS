import { describe, expect, it } from "vitest";

import { affectedServiceUnion } from "./affected-services";

describe("affectedServiceUnion", () => {
  it("includes removed and newly added services once", () => {
    expect(affectedServiceUnion(["old", "shared"], ["shared", "new"]))
      .toEqual(["old", "shared", "new"]);
  });
});
