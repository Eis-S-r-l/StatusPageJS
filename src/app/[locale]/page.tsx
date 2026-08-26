import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/PublicShell";
import { StatusDashboard } from "@/components/public/StatusDashboard";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { isLocale, otherLocale } from "@/modules/i18n/config";
import { publicStatusRepository } from "@/modules/status/repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.metadata.title, description: t.metadata.description, alternates: { canonical: `/${locale}`, languages: { en: "/en", it: "/it" } } };
}

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const snapshot = await publicStatusRepository.getSnapshot();
  return <PublicShell locale={locale} alternatePath={`/${otherLocale(locale)}`}><StatusDashboard snapshot={snapshot} locale={locale} /></PublicShell>;
}
