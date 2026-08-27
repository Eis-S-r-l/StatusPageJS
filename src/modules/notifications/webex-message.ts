interface WebexEventMessage {
  locale: "en" | "it";
  kind: "incident" | "maintenance";
  title: string;
  body: string;
  eventUrl: string;
  details?: Array<{ label: string; value: string }>;
}

export function eventNotificationWebexText(input: WebexEventMessage): string {
  const italian = input.locale === "it";
  const kind = input.kind === "incident"
    ? italian ? "Incidente" : "Incident"
    : italian ? "Manutenzione" : "Maintenance";
  const actionLabel = italian ? "Visualizza dettagli" : "View details";
  const unsubscribe = italian
    ? 'Per annullare l’iscrizione in una chat diretta, invia "unsubscribe" al bot. Se il bot è stato aggiunto a uno spazio di gruppo, menzionalo e scrivi "unsubscribe".'
    : 'To unsubscribe in a direct chat, send "unsubscribe" to the bot. If the bot was added to a group space, mention it and write "unsubscribe".';
  const details = input.details?.map((detail) => `${detail.label}: ${detail.value}`).join("\n") ?? "";
  return [
    `${kind}: ${input.title}`,
    input.body,
    details,
    `${actionLabel}: ${input.eventUrl}`,
    unsubscribe,
  ].filter(Boolean).join("\n\n");
}
