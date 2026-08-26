import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventDetail } from "@/components/public/EventDetail";
import { PublicShell } from "@/components/public/PublicShell";
import { isLocale, otherLocale } from "@/modules/i18n/config";
import { publicStatusRepository } from "@/modules/status/repository";
import { richTextToPlainText } from "@/modules/content/rich-text";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const event = await publicStatusRepository.getMaintenance(slug);
  if (!event) return {};
  const title = `${event.title[locale]} · EIS`;
  const description = richTextToPlainText(event.summary[locale]);
  return {
    title,
    description,
    alternates: { languages: { en: `/en/maintenance/${slug}`, it: `/it/maintenance/${slug}` } },
    openGraph: { title, description, images: [] },
    twitter: { title, description, images: [] },
  };
}

export default async function MaintenancePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const [event, snapshot] = await Promise.all([publicStatusRepository.getMaintenance(slug), publicStatusRepository.getSnapshot()]);
  if (!event) notFound();
  const alternatePath = `/${otherLocale(locale)}/maintenance/${slug}`;
  return <PublicShell locale={locale} alternatePath={alternatePath}><EventDetail event={event} categories={snapshot.categories} locale={locale} /></PublicShell>;
}
