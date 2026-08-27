export interface WebexMessageAuthor {
  personId?: string;
  personEmail?: string;
}

export interface WebexPersonProfile {
  emails?: string[];
  displayName?: string;
  nickName?: string;
  firstName?: string;
  lastName?: string;
}

function clean(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function webexSubscriberProfile(message: WebexMessageAuthor, person?: WebexPersonProfile | null) {
  const email = person?.emails?.map(clean).find((value): value is string => Boolean(value)) ?? clean(message.personEmail);
  const fullName = [clean(person?.firstName), clean(person?.lastName)].filter(Boolean).join(" ");
  const displayName = clean(person?.displayName) ?? clean(person?.nickName) ?? clean(fullName);
  return { username: email, displayName };
}
