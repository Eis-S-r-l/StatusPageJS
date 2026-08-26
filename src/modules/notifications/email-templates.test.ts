import { describe, expect, it } from "vitest";

import { eventNotificationEmail, subscriptionConfirmationEmail, unsubscriptionConfirmationEmail } from "./email-templates";

const brand = { companyName: "EIS & Partners", logoUrl: "https://status.example/api/branding/logo-dark" };

describe("notification email templates", () => {
  it("renders escaped localized subscription and unsubscription action emails", () => {
    const subscription = subscriptionConfirmationEmail({ ...brand, locale: "en", actionUrl: "https://status.example/confirm?a=1&b=2" });
    const unsubscription = unsubscriptionConfirmationEmail({ ...brand, locale: "it", actionUrl: "https://status.example/unsubscribe" });
    expect(subscription.html).toContain("EIS &amp; Partners");
    expect(subscription.html).toContain("a=1&amp;b=2");
    expect(subscription.text).toContain("Confirm subscription");
    expect(unsubscription.subject).toBe("Conferma la disiscrizione");
    expect(unsubscription.html).toContain("Conferma disiscrizione");
  });

  it("preserves sanitized rich event markup and includes details and unsubscription links", () => {
    const email = eventNotificationEmail({
      ...brand, locale: "en", kind: "incident", title: "API <down>", body: "API unavailable",
      bodyHtml: '<p><strong>API</strong> unavailable<script>alert(1)</script></p>', eventUrl: "https://status.example/en/incidents/api-down",
      unsubscribeUrl: "https://status.example/en/unsubscribe", details: [{ label: "Affected services", value: "Public API & Gateway" }],
    });
    expect(email.html).toContain("<p><strong>API</strong> unavailable</p>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("API &lt;down&gt;");
    expect(email.html).toContain("Public API &amp; Gateway");
    expect(email.html).toContain("https://status.example/en/unsubscribe");
    expect(email.text).toContain("https://status.example/en/incidents/api-down");
    const maintenance = eventNotificationEmail({ ...brand, locale: "it", kind: "maintenance", title: "Rete", body: "Intervento", eventUrl: "https://status.example/it/maintenance/rete", unsubscribeUrl: "https://status.example/it/unsubscribe" });
    expect(maintenance.subject).toBe("Manutenzione: Rete");
  });
});
