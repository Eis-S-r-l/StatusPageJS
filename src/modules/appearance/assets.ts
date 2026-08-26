import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrandingAssetKind } from "./server";

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const ASSET_DIRECTORY = path.join(process.cwd(), "data", "branding");

interface DetectedImage { extension: "png" | "jpg" | "webp" | "ico"; mimeType: string }
export interface PendingAsset extends DetectedImage { fileName: string; bytes: Buffer }

export function brandingAssetDirectory(): string {
  return ASSET_DIRECTORY;
}

export function detectImage(bytes: Buffer): DetectedImage | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: "png", mimeType: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", mimeType: "image/jpeg" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { extension: "webp", mimeType: "image/webp" };
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) return { extension: "ico", mimeType: "image/x-icon" };
  return null;
}

export async function prepareAsset(file: FormDataEntryValue | null, kind: BrandingAssetKind): Promise<PendingAsset | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_ASSET_BYTES) throw new Error("Images must be 2 MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(bytes);
  const allowed = kind === "favicon" ? ["png", "ico"] : ["png", "jpg", "webp"];
  if (!detected || !allowed.includes(detected.extension)) throw new Error(kind === "favicon" ? "The favicon must be a PNG or ICO image." : "Logos must be PNG, JPEG, or WebP images.");
  return { ...detected, fileName: `${kind}-${randomUUID()}.${detected.extension}`, bytes };
}

export async function storeAsset(asset: PendingAsset): Promise<void> {
  const directory = brandingAssetDirectory();
  await mkdir(directory, { recursive: true, mode: 0o750 });
  await writeFile(path.join(process.cwd(), "data", "branding", asset.fileName), asset.bytes, { flag: "wx", mode: 0o640 });
}

export async function readAsset(fileName: string): Promise<Buffer> {
  if (path.basename(fileName) !== fileName) throw new Error("Invalid asset path");
  return readFile(path.join(process.cwd(), "data", "branding", fileName));
}

export async function removeAsset(fileName: string | null | undefined): Promise<void> {
  if (!fileName || path.basename(fileName) !== fileName) return;
  try { await unlink(path.join(process.cwd(), "data", "branding", fileName)); } catch { /* Missing and locked files are left for operational cleanup. */ }
}
