import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Script from "next/script";
import type { ReactNode } from "react";
import { fontClassName } from "@/app/fonts";
import { brandingAssetUrl, loadPublicAppearance } from "@/modules/appearance/server";
import { appearanceStyle, bootThemeScript, themeFromCookie } from "@/modules/appearance/theme";
import { isLocale, locales } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import "../globals.css";

export const dynamicParams = false;
export const dynamic = "force-dynamic";
export function generateStaticParams() { return locales.map((locale) => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const appearance = await loadPublicAppearance();
  const title = appearance.statusPageTitle.trim() || t.metadata.title;
  const favicon = brandingAssetUrl("favicon", appearance);
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title,
    description: t.metadata.description,
    icons: favicon ? { icon: favicon } : undefined,
    openGraph: {
      title,
      description: t.metadata.description,
      locale: locale === "it" ? "it_IT" : "en_US",
      images: [{ url: "/og.png", width: 1731, height: 909, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: t.metadata.description,
      images: ["/og.png"],
    },
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const appearance = await loadPublicAppearance();
  const initialTheme = themeFromCookie((await cookies()).get("eis-theme")?.value);
  return (
    <html lang={locale} className={fontClassName} data-theme={initialTheme} style={appearanceStyle(appearance)} suppressHydrationWarning>
      <head><Script id="eis-theme-boot" strategy="beforeInteractive">{bootThemeScript}</Script></head>
      <body>{children}</body>
    </html>
  );
}
