import { NextResponse } from "next/server";
import { z } from "zod";

import { readAsset } from "@/modules/appearance/assets";
import { loadPublicAppearance, type BrandingAssetKind } from "@/modules/appearance/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const kindSchema = z.enum(["logo-light", "logo-dark", "favicon"]);

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const parsed = kindSchema.safeParse((await params).kind);
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  const appearance = await loadPublicAppearance();
  const kind: BrandingAssetKind = parsed.data;
  const fileName = kind === "logo-light" ? appearance.logoLightFile : kind === "logo-dark" ? appearance.logoDarkFile : appearance.faviconFile;
  const mimeType = kind === "logo-light" ? appearance.logoLightMimeType : kind === "logo-dark" ? appearance.logoDarkMimeType : appearance.faviconMimeType;
  if (!fileName || !mimeType) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readAsset(fileName);
    return new NextResponse(Uint8Array.from(bytes).buffer, { headers: { "content-type": mimeType, "cache-control": "public, max-age=300, stale-while-revalidate=86400", "x-content-type-options": "nosniff" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
