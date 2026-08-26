export const PALETTE_FIELDS = [
  "background",
  "surface",
  "text",
  "muted",
  "primary",
  "primaryText",
  "border",
  "success",
  "warning",
  "danger",
] as const;

export type PaletteField = (typeof PALETTE_FIELDS)[number];
export type ThemePalette = Record<PaletteField, string>;

export const DEFAULT_LIGHT_PALETTE: ThemePalette = {
  background: "#f8faf8",
  surface: "#ffffff",
  text: "#14221d",
  muted: "#66756e",
  primary: "#087f5b",
  primaryText: "#ffffff",
  border: "#dfe7e2",
  success: "#15946c",
  warning: "#d49b28",
  danger: "#c85148",
};

export const DEFAULT_DARK_PALETTE: ThemePalette = {
  background: "#0d1512",
  surface: "#15201b",
  text: "#eef6f1",
  muted: "#9caea5",
  primary: "#45c795",
  primaryText: "#07110d",
  border: "#2a3a33",
  success: "#45c795",
  warning: "#e1ad45",
  danger: "#ef7770",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizePalette(value: unknown, fallback: ThemePalette): ThemePalette {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(PALETTE_FIELDS.map((field) => [
    field,
    typeof input[field] === "string" && HEX_COLOR.test(input[field]) ? input[field].toLowerCase() : fallback[field],
  ])) as ThemePalette;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}
