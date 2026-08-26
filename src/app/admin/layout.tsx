import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Bell, CalendarClock, Gauge, LogOut, Palette, Settings, Siren, Users, Wrench } from "lucide-react";

import { fontClassName } from "@/app/fonts";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brandingAssetUrl, loadPublicAppearance } from "@/modules/appearance/server";
import { appearanceStyle, bootThemeScript } from "@/modules/appearance/theme";
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
  ["Dashboard", "/admin", Gauge], ["Services", "/admin/services", Wrench],
  ["Incidents", "/admin/incidents", Siren], ["Maintenance", "/admin/maintenance", CalendarClock],
  ["Subscribers", "/admin/subscribers", Users], ["Appearance", "/admin/appearance", Palette], ["Settings", "/admin/settings", Settings],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const configured = Boolean(getAuthConfig()) || isDevAuthEnabled();
  const session = configured ? await readAdminSession() : null;
  const appearance = await loadPublicAppearance();
  return (
    <html lang="en" className={fontClassName} style={appearanceStyle(appearance)} suppressHydrationWarning>
      <head><Script id="eis-theme-boot" strategy="beforeInteractive">{bootThemeScript}</Script></head>
      <body>
        {!session ? children : <div className={styles.frame}>
          <aside className={styles.sidebar}>
            <Link className={styles.brand} href="/admin"><span className={styles.mark}>{appearance.companyName.slice(0, 1).toUpperCase()}</span><span>{appearance.companyName} Status Admin</span></Link>
            <nav className={styles.nav}>{links.map(([label, href, Icon]) => <Link href={href} key={href}><Icon aria-hidden="true" />{label}</Link>)}</nav>
            <div className={styles.sidebarFoot}><ThemeToggle className={styles.themeToggle} /><Bell size={16} aria-hidden="true" /><span>{session.email ?? session.name ?? session.subject}</span><Link href="/api/auth/logout"><LogOut size={13} /> Sign out</Link></div>
          </aside>
          <main className={styles.content}>{children}</main>
        </div>}
      </body>
    </html>
  );
}
