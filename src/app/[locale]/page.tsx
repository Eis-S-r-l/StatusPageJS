import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/PublicShell";
import { StatusDashboard } from "@/components/public/StatusDashboard";
import { COLLAPSED_CATEGORIES_COOKIE, parseCollapsedCategoryIds } from "@/components/public/collapsed-categories-cookie";
import { loadPublicAppearance } from "@/modules/appearance/server";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { isLocale, otherLocale } from "@/modules/i18n/config";
import { publicStatusRepository } from "@/modules/status/repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    description: t.metadata.description,
    alternates: { canonical: `/${locale}`, languages: { en: "/en", it: "/it" } },
  };
}

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [snapshot, appearance, cookieStore] = await Promise.all([publicStatusRepository.getSnapshot(), loadPublicAppearance(), cookies()]);
  const title = appearance.statusPageTitle.trim() || getDictionary(locale).metadata.title;
  const collapsedCategoryIds = parseCollapsedCategoryIds(cookieStore.get(COLLAPSED_CATEGORIES_COOKIE)?.value, snapshot.categories.map((category) => category.id));
  return <PublicShell locale={locale} alternatePath={`/${otherLocale(locale)}`}><StatusDashboard snapshot={snapshot} locale={locale} title={title} collapsedCategoryIds={collapsedCategoryIds} /></PublicShell>;
}
