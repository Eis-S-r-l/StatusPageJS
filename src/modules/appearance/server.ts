import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { systemSettings } from "@/db/schema";

import { DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE, normalizePalette, type ThemePalette } from "./palette";

export type BrandingAssetKind = "logo-light" | "logo-dark" | "favicon";

export interface PublicAppearance {
  companyName: string;
  lightPalette: ThemePalette;
  darkPalette: ThemePalette;
  logoLightFile: string | null;
  logoLightMimeType: string | null;
  logoDarkFile: string | null;
  logoDarkMimeType: string | null;
  faviconFile: string | null;
  faviconMimeType: string | null;
  version: string;
}

export const DEFAULT_APPEARANCE: PublicAppearance = {
  companyName: "EIS",
  lightPalette: DEFAULT_LIGHT_PALETTE,
  darkPalette: DEFAULT_DARK_PALETTE,
  logoLightFile: null,
  logoLightMimeType: null,
  logoDarkFile: null,
  logoDarkMimeType: null,
  faviconFile: null,
  faviconMimeType: null,
  version: "default",
};

export async function loadPublicAppearance(): Promise<PublicAppearance> {
  if (!process.env.DATABASE_URL) return DEFAULT_APPEARANCE;
  try {
    const [row] = await getDb().select({
      companyName: systemSettings.companyName,
      lightPalette: systemSettings.lightPalette,
      darkPalette: systemSettings.darkPalette,
      logoLightFile: systemSettings.logoLightFile,
      logoLightMimeType: systemSettings.logoLightMimeType,
      logoDarkFile: systemSettings.logoDarkFile,
      logoDarkMimeType: systemSettings.logoDarkMimeType,
      faviconFile: systemSettings.faviconFile,
      faviconMimeType: systemSettings.faviconMimeType,
      updatedAt: systemSettings.updatedAt,
    }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
    if (!row) return DEFAULT_APPEARANCE;
    return {
      ...row,
      lightPalette: normalizePalette(row.lightPalette, DEFAULT_LIGHT_PALETTE),
      darkPalette: normalizePalette(row.darkPalette, DEFAULT_DARK_PALETTE),
      version: row.updatedAt.getTime().toString(36),
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function brandingAssetUrl(kind: BrandingAssetKind, appearance: PublicAppearance): string | null {
  const exists = kind === "logo-light" ? appearance.logoLightFile : kind === "logo-dark" ? appearance.logoDarkFile : appearance.faviconFile;
  return exists ? `/api/branding/${kind}?v=${appearance.version}` : null;
}
