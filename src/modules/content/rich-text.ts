import sanitizeHtml from "sanitize-html";

const allowedTags = ["p", "br", "strong", "em", "s", "ul", "ol", "li", "blockquote", "a"];

function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${sanitizeHtml(paragraph, { allowedTags: [], allowedAttributes: {} }).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** Sanitizes rich text at every trust boundary. Existing plain-text records remain readable. */
export function sanitizeRichText(value: string): string {
  const source = /<\/?[a-z][\s\S]*>/i.test(value) ? value : plainTextToHtml(value);
  return sanitizeHtml(source, {
    allowedTags,
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer" },
      }),
    },
  }).trim();
}

export function richTextToPlainText(value: string): string {
  const withSeparators = sanitizeRichText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|blockquote)>/gi, "\n");
  return sanitizeHtml(withSeparators, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text) => text,
  })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
