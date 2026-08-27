import { describe, expect, it } from "vitest";

import { eventNotificationTelegramHtml } from "./telegram-message";

describe("eventNotificationTelegramHtml", () => {
  it("preserves supported headings, lists, links, and tables", () => {
    const html = eventNotificationTelegramHtml({
      locale: "en",
      kind: "incident",
      title: "API <degraded>",
      body: "Fallback",
      bodyHtml: '<h3>Progress</h3><ul><li><strong>Recovered</strong></li></ul><table><tbody><tr><th>Region</th><td><span style="font-size: 20px">EU</span></td></tr></tbody></table>',
      details: [{ label: "Status", value: "Monitoring & stable" }],
      eventUrl: "https://status.example/en/incidents/api-degraded?a=1&b=2",
    });

    expect(html).toContain("<h3>Progress</h3>");
    expect(html).toContain("<table><tr><th>Region</th><td>EU</td></tr></table>");
    expect(html).toContain("Monitoring &amp; stable");
    expect(html).toContain("API &lt;degraded&gt;");
    expect(html).not.toContain("font-size");
  });
});
