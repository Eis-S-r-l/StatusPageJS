import Image from "next/image";

import { updateAppearance } from "@/modules/appearance/actions";
import { PALETTE_FIELDS, type PaletteField, type ThemePalette } from "@/modules/appearance/palette";
import { brandingAssetUrl, type PublicAppearance } from "@/modules/appearance/server";
import { loadAppearanceSettings } from "@/modules/admin/data";
import { requireAdmin } from "@/modules/auth/guard";

import { Notice, PageHeader, Unavailable } from "../_components";
import styles from "../admin.module.css";

const labels: Record<PaletteField, string> = {
  background: "Page background",
  surface: "Cards and surfaces",
  text: "Primary text",
  muted: "Secondary text",
  primary: "Primary accent",
  primaryText: "Text on primary",
  serviceStatusText: "Service status text",
  border: "Borders",
  success: "Operational / success",
  warning: "Degraded / warning",
  danger: "Outage / error",
};

function PaletteEditor({ name, palette }: { name: "light" | "dark"; palette: ThemePalette }) {
  return <section className={styles.palettePanel}>
    <div className={styles.paletteHeading}><div><h2>{name === "light" ? "Light mode" : "Dark mode"}</h2><p>Colors are applied after saving. Choose any combination you want.</p></div><div className={styles.palettePreview} style={{ background: palette.background, color: palette.text, borderColor: palette.border }}><span style={{ background: palette.surface, borderColor: palette.border }} /><i style={{ background: palette.primary }} /><b style={{ color: palette.serviceStatusText }}><em style={{ background: palette.success }} />Status</b></div></div>
    <div className={styles.colorGrid}>{PALETTE_FIELDS.map((field) => <label className={styles.colorField} key={field}><span>{labels[field]}</span><div><input name={`${name}_${field}`} type="color" defaultValue={palette[field]} aria-label={`${name} ${labels[field]}`} /><code>{palette[field]}</code></div></label>)}</div>
  </section>;
}

function AssetField({ title, description, inputName, removeName, accept, imageUrl, favicon = false }: { title: string; description: string; inputName: string; removeName: string; accept: string; imageUrl: string | null; favicon?: boolean }) {
  return <section className={styles.assetField}><div><h3>{title}</h3><p>{description}</p></div>{imageUrl ? <div className={favicon ? styles.faviconPreview : styles.logoPreview}><Image src={imageUrl} alt={`Current ${title.toLowerCase()}`} width={favicon ? 48 : 220} height={favicon ? 48 : 72} unoptimized /></div> : <div className={styles.noAsset}>No image uploaded</div>}<label className={styles.field}>Choose replacement<input name={inputName} type="file" accept={accept} /></label>{imageUrl && <label className={styles.check}><input name={removeName} type="checkbox" />Remove current image</label>}</section>;
}

export default async function AppearancePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin();
  const [result, params] = await Promise.all([loadAppearanceSettings(), searchParams]);
  if (!result.available) return <><PageHeader title="Appearance" description="Customize light and dark colors, logos, and the browser icon." /><Notice {...params} /><Unavailable message={result.message} /></>;
  const appearance: PublicAppearance = result.data;
  return <><PageHeader title="Appearance" description="Customize the public brand and color palette for both light and dark mode." /><Notice {...params} /><form action={updateAppearance} className={styles.appearanceForm}>
    <div className={styles.appearanceGrid}><PaletteEditor name="light" palette={appearance.lightPalette} /><PaletteEditor name="dark" palette={appearance.darkPalette} /></div>
    <section className={styles.panel}><h2>Brand assets</h2><p className={styles.panelIntro}>Images are validated before storage. Use transparent PNG or WebP logos where possible; uploads are limited to 2 MB.</p><div className={styles.assetGrid}>
      <AssetField title="Logo for light mode" description="Shown when the public page uses the light palette." inputName="logoLight" removeName="removeLogoLight" accept="image/png,image/jpeg,image/webp" imageUrl={brandingAssetUrl("logo-light", appearance)} />
      <AssetField title="Logo for dark mode" description="Shown when the public page uses the dark palette." inputName="logoDark" removeName="removeLogoDark" accept="image/png,image/jpeg,image/webp" imageUrl={brandingAssetUrl("logo-dark", appearance)} />
      <AssetField title="Favicon" description="Shown in browser tabs and bookmarks. PNG or ICO only." inputName="favicon" removeName="removeFavicon" accept="image/png,image/x-icon,.ico" imageUrl={brandingAssetUrl("favicon", appearance)} favicon />
    </div></section>
    <button className={`${styles.button} ${styles.saveAppearance}`}>Save appearance</button>
  </form></>;
}
