import { describe, expect, it } from "vitest";
import { richTextToPlainText, sanitizeRichText } from "./rich-text";

describe("sanitizeRichText", () => {
  it("keeps the restricted formatting and removes executable content", () => {
    const result = sanitizeRichText('<p>Hello <strong>world</strong><script>alert(1)</script><a href="javascript:alert(1)" onclick="x">bad</a></p>');
    expect(result).toContain("<strong>world</strong>");
    expect(result).not.toMatch(/script|javascript|onclick/);
  });

  it("wraps legacy plain text safely", () => {
    expect(sanitizeRichText("one & two\nnext")).toBe("<p>one &amp; two<br />next</p>");
  });

  it("keeps block boundaries and decodes common entities in plain text", () => {
    expect(richTextToPlainText("<ul><li>one &amp; two</li><li>three</li></ul>"))
      .toBe("one & two\nthree");
  });
});
