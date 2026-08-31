import { describe, expect, it } from "vitest";

import { parseHeaderScripts, safeParseHeaderScripts } from "./header-scripts";

describe("parseHeaderScripts", () => {
  it("accepts plain JavaScript as one inline script", () => {
    expect(parseHeaderScripts("window.analyticsEnabled = true;"))
      .toEqual([{ attributes: {}, content: "window.analyticsEnabled = true;" }]);
  });

  it("parses external and inline script snippets", () => {
    expect(parseHeaderScripts(`
      <!-- Tracking -->
      <script async src="https://example.com/tracker.js?a=1&amp;b=2" data-site-id="status"></script>
      <script>window.trackerQueue = window.trackerQueue || [];</script>
    `)).toEqual([
      {
        attributes: {
          async: true,
          src: "https://example.com/tracker.js?a=1&b=2",
          "data-site-id": "status",
        },
        content: "",
      },
      {
        attributes: {},
        content: "window.trackerQueue = window.trackerQueue || [];",
      },
    ]);
  });

  it("rejects non-script markup and unsupported event attributes", () => {
    expect(() => parseHeaderScripts("<script src=\"/tracker.js\"></script><div>Unexpected</div>"))
      .toThrow("complete <script> elements only");
    expect(() => parseHeaderScripts("<script onload=\"start()\"></script>"))
      .toThrow('attribute "onload" is not supported');
    expect(safeParseHeaderScripts("<script>incomplete")).toEqual([]);
  });
});
