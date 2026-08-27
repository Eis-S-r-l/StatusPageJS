import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicEventIndex } from "@/components/public/PublicEventIndex";
import { PublicShell } from "@/components/public/PublicShell";
import { otherLocale, isLocale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { parsePage } from "@/modules/status/pagination";
import { publicStatusRepository } from "@/modules/status/repository";

const PAGE_SIZE = 20;
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.incidentsMetadata.title, description: t.incidentsMetadata.description, alternates: { canonical: `/${locale}/incidents`, languages: { en: "/en/incidents", it: "/it/incidents" } } };
}

export default async function IncidentsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const result = await publicStatusRepository.listIncidents(parsePage(query.page), PAGE_SIZE);
  const queryString = `?page=${result.page}`;
  return <PublicShell locale={locale} alternatePath={`/${otherLocale(locale)}/incidents${queryString}`}><PublicEventIndex locale={locale} kind="incident" result={result} /></PublicShell>;
}
