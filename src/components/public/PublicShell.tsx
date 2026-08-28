import Image from "next/image";
import Link from "next/link";
import { Bell, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { Locale } from "@/modules/i18n/config";
import { otherLocale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { brandingAssetUrl, loadPublicAppearance } from "@/modules/appearance/server";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LanguagePreferenceLink } from "./LanguagePreferenceLink";
import styles from "./public.module.css";

interface PublicShellProps { locale: Locale; alternatePath: string; children: ReactNode; }

export async function PublicShell({ locale, alternatePath, children }: PublicShellProps) {
  const t = getDictionary(locale);
  const appearance = await loadPublicAppearance();
  const lightLogo = brandingAssetUrl("logo-light", appearance) ?? brandingAssetUrl("logo-dark", appearance);
  const darkLogo = brandingAssetUrl("logo-dark", appearance) ?? lightLogo;
  const brandLabel = appearance.statusPageTitle.trim() || (locale === "it" ? `Stato dei servizi ${appearance.companyName}` : `${appearance.companyName} Service Status`);
  return (
    <div className={styles.page} lang={locale}>
      <a className={styles.skipLink} href="#main-content">{t.skip}</a>
      <header className={styles.header}>
        <Link className={styles.brand} href={`/${locale}`} aria-label={brandLabel}>
          {lightLogo && darkLogo ? <>
            <Image className={`${styles.brandLogo} ${styles.brandLogoLight}`} src={lightLogo} width={180} height={42} unoptimized alt="" aria-hidden="true" />
            <Image className={`${styles.brandLogo} ${styles.brandLogoDark}`} src={darkLogo} width={180} height={42} unoptimized alt="" aria-hidden="true" />
          </> : <span className={styles.brandMark} aria-hidden="true">{appearance.companyName.slice(0, 1).toUpperCase()}</span>}
        </Link>
        <nav className={styles.actions} aria-label={locale === "en" ? "Page actions" : "Azioni della pagina"}>
          <ThemeToggle className={styles.themeToggle} labelLight={locale === "it" ? "Usa tema chiaro" : "Use light mode"} labelDark={locale === "it" ? "Usa tema scuro" : "Use dark mode"} />
          <Link className={styles.adminAccess} href="/admin" aria-label={t.admin} title={t.admin}><ShieldCheck size={17} aria-hidden="true" /></Link>
          <LanguagePreferenceLink className={styles.language} currentLocale={locale} targetLocale={otherLocale(locale)} href={alternatePath} label={t.language} />
          <Link className={styles.subscribe} href={`/${locale}#subscribe`} aria-label={t.subscribe}>
            <Bell size={16} aria-hidden="true" /> <span>{t.subscribe}</span>
          </Link>
        </nav>
      </header>
      {children}
      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} {appearance.companyName}</span>
        <span>{t.footerNote}</span>
      </footer>
    </div>
  );
}
