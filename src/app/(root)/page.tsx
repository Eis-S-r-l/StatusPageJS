import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LANGUAGE_COOKIE, parseLanguagePreference } from "@/modules/i18n/preference";

export default async function Home() {
  const preferredLocale = parseLanguagePreference((await cookies()).get(LANGUAGE_COOKIE)?.value);
  redirect(`/${preferredLocale}`);
}
