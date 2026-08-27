import { describe, expect, it } from "vitest";

import { eventNotificationWebexText } from "./webex-message";

describe("eventNotificationWebexText", () => {
  it("uses bot commands instead of the email unsubscription page", () => {
    const message = eventNotificationWebexText({
      locale: "en", kind: "incident", title: "API degraded", body: "Requests are delayed.",
      eventUrl: "https://status.example/en/incidents/api-degraded",
      details: [{ label: "Status", value: "Monitoring" }],
    });

    expect(message).toContain('send "unsubscribe" to the bot');
    expect(message).toContain('mention it and write "unsubscribe"');
    expect(message).toContain("Status: Monitoring");
    expect(message).not.toContain("/unsubscribe");
  });

  it("localizes the instructions for Italian subscribers", () => {
    const message = eventNotificationWebexText({
      locale: "it", kind: "maintenance", title: "Rete", body: "Intervento programmato.",
      eventUrl: "https://status.example/it/maintenance/rete",
    });

    expect(message).toContain("Per annullare l’iscrizione");
    expect(message).toContain('scrivi "unsubscribe"');
  });
});
