"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { auditLogs, systemSettings } from "@/db/schema";
import { requireAdmin } from "@/modules/auth/guard";

import { prepareAsset, removeAsset, storeAsset, type PendingAsset } from "./assets";
import { contrastRatio, PALETTE_FIELDS, type ThemePalette } from "./palette";

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Choose a valid six-digit color.").transform((value) => value.toLowerCase());
class SafeAppearanceError extends Error {}

function parsePalette(form: FormData, theme: "light" | "dark"): ThemePalette {
  const palette = Object.fromEntries(PALETTE_FIELDS.map((field) => [field, hexColor.parse(form.get(`${theme}_${field}`))])) as ThemePalette;
  const label = theme === "light" ? "Light mode" : "Dark mode";
  if (contrastRatio(palette.text, palette.background) < 4.5 || contrastRatio(palette.text, palette.surface) < 4.5) throw new SafeAppearanceError(`${label} text needs more contrast against its background and cards.`);
  if (contrastRatio(palette.primaryText, palette.primary) < 4.5) throw new SafeAppearanceError(`${label} primary text needs more contrast against the primary accent.`);
  return palette;
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Review the selected colors.";
  if (error instanceof SafeAppearanceError) return error.message;
  if (error instanceof Error && [
    "Images must be 2 MB or smaller.",
    "The favicon must be a PNG or ICO image.",
    "Logos must be PNG, JPEG, or WebP images.",
  ].includes(error.message)) return error.message;
  return "The appearance could not be saved. Please try again.";
}

function finish(error?: unknown): never {
  revalidatePath("/admin/appearance");
  revalidatePath("/en", "layout");
  revalidatePath("/it", "layout");
  redirect(error ? `/admin/appearance?error=${encodeURIComponent(errorMessage(error))}` : "/admin/appearance?saved=1");
}

export async function updateAppearance(form: FormData) {
  const admin = await requireAdmin();
  const stored: PendingAsset[] = [];
  try {
    const lightPalette = parsePalette(form, "light");
    const darkPalette = parsePalette(form, "dark");
    const [lightUpload, darkUpload, faviconUpload] = await Promise.all([
      prepareAsset(form.get("logoLight"), "logo-light"),
      prepareAsset(form.get("logoDark"), "logo-dark"),
      prepareAsset(form.get("favicon"), "favicon"),
    ]);
    const db = getDb();
    const [current] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
    for (const asset of [lightUpload, darkUpload, faviconUpload]) if (asset) { await storeAsset(asset); stored.push(asset); }

    const removeLight = form.get("removeLogoLight") === "on";
    const removeDark = form.get("removeLogoDark") === "on";
    const removeFavicon = form.get("removeFavicon") === "on";
    const next = {
      lightPalette,
      darkPalette,
      logoLightFile: lightUpload?.fileName ?? (removeLight ? null : current?.logoLightFile ?? null),
      logoLightMimeType: lightUpload?.mimeType ?? (removeLight ? null : current?.logoLightMimeType ?? null),
      logoDarkFile: darkUpload?.fileName ?? (removeDark ? null : current?.logoDarkFile ?? null),
      logoDarkMimeType: darkUpload?.mimeType ?? (removeDark ? null : current?.logoDarkMimeType ?? null),
      faviconFile: faviconUpload?.fileName ?? (removeFavicon ? null : current?.faviconFile ?? null),
      faviconMimeType: faviconUpload?.mimeType ?? (removeFavicon ? null : current?.faviconMimeType ?? null),
      updatedAt: new Date(),
    };
    await db.transaction(async (tx) => {
      await tx.insert(systemSettings).values({ id: 1, ...next }).onConflictDoUpdate({ target: systemSettings.id, set: next });
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "update", entityType: "appearance", entityId: "1", after: { lightPalette, darkPalette, logoLightChanged: Boolean(lightUpload || removeLight), logoDarkChanged: Boolean(darkUpload || removeDark), faviconChanged: Boolean(faviconUpload || removeFavicon) } });
    });
    const superseded = [
      lightUpload || removeLight ? current?.logoLightFile : null,
      darkUpload || removeDark ? current?.logoDarkFile : null,
      faviconUpload || removeFavicon ? current?.faviconFile : null,
    ];
    await Promise.all(superseded.map(removeAsset));
  } catch (error) {
    await Promise.all(stored.map((asset) => removeAsset(asset.fileName)));
    finish(error);
  }
  finish();
}
