import { sanitizeRichText } from "@/modules/content/rich-text";

export function SafeRichText({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />;
}
