import type { Metadata } from "next";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { connection } from "next/server";
import { CalendarClock, Gauge, Globe2, LogOut, Palette, Settings, Siren, Users, Wrench } from "lucide-react";

import { fontClassName } from "@/app/fonts";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brandingAssetUrl, loadPublicAppearance } from "@/modules/appearance/server";
import { appearanceStyle, bootThemeScript, themeFromCookie } from "@/modules/appearance/theme";
import { getAuthConfig, isDevAuthEnabled } from "@/modules/auth/config";
import { readAdminSession } from "@/modules/auth/session";

import "../globals.css";
import styles from "./admin.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const appearance = await loadPublicAppearance();
  const favicon = brandingAssetUrl("favicon", appearance);
  return { title: `${appearance.companyName} Status Admin`, description: `Administration for the ${appearance.companyName} service status page.`, robots: { index: false, follow: false }, icons: favicon ? { icon: favicon } : undefined };
}

const links = [
  ["Admin dashboard", "/admin", Gauge], ["Public dashboard", "/", Globe2], ["Services", "/admin/services", Wrench],
  ["Incidents", "/admin/incidents", Siren], ["Maintenance", "/admin/maintenance", CalendarClock],
  ["Subscribers", "/admin/subscribers", Users], ["Appearance", "/admin/appearance", Palette], ["Settings", "/admin/settings", Settings],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Authentication and appearance configuration are supplied to the Docker
  // container at runtime, not while the reusable image is being built.
  await connection();
  const configured = Boolean(getAuthConfig()) || isDevAuthEnabled();
  const session = configured ? await readAdminSession() : null;
  const appearance = await loadPublicAppearance();
  const initialTheme = themeFromCookie((await cookies()).get("eis-theme")?.value);
  const lightLogo = brandingAssetUrl("logo-light", appearance) ?? brandingAssetUrl("logo-dark", appearance);
  const darkLogo = brandingAssetUrl("logo-dark", appearance) ?? lightLogo;
  const statusPageTitle = appearance.statusPageTitle.trim() || `${appearance.companyName} Service Status`;
  return (
    <html lang="en" className={fontClassName} data-theme={initialTheme} style={appearanceStyle(appearance)} suppressHydrationWarning>
      <head><Script id="eis-theme-boot" strategy="beforeInteractive">{bootThemeScript}</Script></head>
      <body>
        {!session ? children : <div className={styles.frame}>
          <aside className={styles.sidebar}>
            <Link className={styles.brand} href="/admin" aria-label={`${statusPageTitle} administration`}>
              {lightLogo && darkLogo ? <span className={styles.brandImages} aria-hidden="true">
                <Image className={`${styles.brandLogo} ${styles.brandLogoLight}`} src={lightLogo} width={160} height={40} unoptimized alt="" />
                <Image className={`${styles.brandLogo} ${styles.brandLogoDark}`} src={darkLogo} width={160} height={40} unoptimized alt="" />
              </span> : <span className={styles.mark} aria-hidden="true">{appearance.companyName.slice(0, 1).toUpperCase()}</span>}
              <span className={styles.brandTitle}>{statusPageTitle}</span>
            </Link>
            <nav className={styles.nav}>{links.map(([label, href, Icon]) => <Link href={href} key={href}><Icon aria-hidden="true" />{label}</Link>)}</nav>
            <div className={styles.sidebarFoot}><ThemeToggle className={styles.themeToggle} /><span>{session.email ?? session.name ?? session.subject}</span><form action="/api/auth/logout" method="get"><button className={styles.logoutButton} type="submit"><LogOut size={13} /> Sign out</button></form></div>
          </aside>
          <main className={styles.content}>{children}</main>
        </div>}
      </body>
    </html>
  );
}
