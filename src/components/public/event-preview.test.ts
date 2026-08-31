import { describe, expect, it } from "vitest";

import { eventPreviewExcerpt } from "./event-preview";

describe("eventPreviewExcerpt", () => {
  it("turns rich text into a compact plain-text preview", () => {
    expect(eventPreviewExcerpt("<h2>Planned work</h2><p>Second line</p>"))
      .toBe("Planned work Second line");
  });

  it("truncates long descriptions on a word boundary", () => {
    const excerpt = eventPreviewExcerpt(
      "This maintenance description contains enough words to require a shorter preview.",
      40,
    );

    expect(excerpt).toBe("This maintenance description contains…");
    expect(excerpt.length).toBeLessThanOrEqual(40);
  });
});
