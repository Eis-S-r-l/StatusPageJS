import { richTextToPlainText } from "../../modules/content/rich-text";

const DEFAULT_PREVIEW_LENGTH = 180;

export function eventPreviewExcerpt(
  value: string,
  maxLength = DEFAULT_PREVIEW_LENGTH,
): string {
  const plainText = richTextToPlainText(value).replace(/\s+/g, " ").trim();
  if (plainText.length <= maxLength) return plainText;

  const availableLength = Math.max(1, maxLength - 1);
  const candidate = plainText.slice(0, availableLength).trimEnd();
  const lastSpace = candidate.lastIndexOf(" ");
  const excerpt = lastSpace >= Math.floor(availableLength * 0.6)
    ? candidate.slice(0, lastSpace)
    : candidate;
  return `${excerpt}…`;
}
