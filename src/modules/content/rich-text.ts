import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "p", "br", "strong", "em", "s", "u", "span", "h2", "h3", "h4",
  "ul", "ol", "li", "blockquote", "a", "table", "thead", "tbody", "tfoot",
  "tr", "th", "td", "colgroup", "col",
];

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
    allowedAttributes: {
      a: ["href", "title", "rel"],
      span: ["style"],
      ol: ["start"],
      li: ["value"],
      th: ["colspan", "rowspan", "colwidth"],
      td: ["colspan", "rowspan", "colwidth"],
    },
    allowedStyles: { span: { "font-size": [/^(?:13|16|20|24)px$/] } },
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
    .replace(/<\/(?:td|th)>/gi, "\t")
    .replace(/<\/(?:p|li|blockquote|h[2-4]|tr)>/gi, "\n");
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

/** Produces the safe subset accepted by Telegram Bot API rich HTML messages. */
export function richTextToTelegramHtml(value: string): string {
  return sanitizeHtml(sanitizeRichText(value), {
    allowedTags: ["p", "br", "strong", "em", "s", "u", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "table", "tr", "th", "td"],
    allowedAttributes: {
      a: ["href"],
      ol: ["start"],
      li: ["value"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  }).trim();
}
