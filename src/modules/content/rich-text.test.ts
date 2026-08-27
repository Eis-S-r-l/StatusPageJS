import { describe, expect, it } from "vitest";
import { richTextToPlainText, richTextToTelegramHtml, sanitizeRichText } from "./rich-text";

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

  it("preserves safe headings, font sizes, and tables", () => {
    const result = sanitizeRichText('<h2>Impact</h2><p><span style="font-size: 20px; color: red">Large</span></p><table onclick="x"><tbody><tr><th colspan="2">Service</th></tr><tr><td>API</td><td><script>x</script>Down</td></tr></tbody></table>');
    expect(result).toContain('<h2>Impact</h2>');
    expect(result).toContain('<span style="font-size:20px">Large</span>');
    expect(result).toContain('<table><tbody><tr><th colspan="2">Service</th>');
    expect(result).not.toMatch(/color|onclick|script/);
  });

  it("keeps Telegram-supported structure while removing web-only font spans", () => {
    const result = richTextToTelegramHtml('<h3>Update</h3><p><span style="font-size: 24px">Stable</span></p><table><tbody><tr><td>EU</td></tr></tbody></table>');
    expect(result).toBe('<h3>Update</h3><p>Stable</p><table><tr><td>EU</td></tr></table>');
  });
});
