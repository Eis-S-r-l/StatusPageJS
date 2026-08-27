import { describe, expect, it } from "vitest";

import { sortLocalizedByOrder } from "./ordering";

describe("sortLocalizedByOrder", () => {
  const items = [
    { id: "zeta", displayOrder: 0, name: { en: "Alpha", it: "Zeta" } },
    { id: "alpha", displayOrder: 0, name: { en: "Zeta", it: "Alpha" } },
    { id: "first", displayOrder: -1, name: { en: "Last", it: "Ultimo" } },
  ];

  it("keeps numeric order primary and uses the active locale as the name tie-breaker", () => {
    expect(sortLocalizedByOrder(items, "en").map((item) => item.id)).toEqual(["first", "zeta", "alpha"]);
    expect(sortLocalizedByOrder(items, "it").map((item) => item.id)).toEqual(["first", "alpha", "zeta"]);
  });
});
