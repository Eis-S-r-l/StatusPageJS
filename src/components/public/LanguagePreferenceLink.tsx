"use client";

import { Languages } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import type { Locale } from "@/modules/i18n/config";
import { LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE } from "@/modules/i18n/preference";

function writeLanguageCookie(locale: Locale) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANGUAGE_COOKIE}=${locale}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function LanguagePreferenceLink({ currentLocale, targetLocale, href, label, className }: { currentLocale: Locale; targetLocale: Locale; href: string; label: string; className: string }) {
  useEffect(() => writeLanguageCookie(currentLocale), [currentLocale]);

  return <Link className={className} href={href} hrefLang={targetLocale} onClick={() => writeLanguageCookie(targetLocale)}>
    <Languages size={17} aria-hidden="true" /> {label}
  </Link>;
}
