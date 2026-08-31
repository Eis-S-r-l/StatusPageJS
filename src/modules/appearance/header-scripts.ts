import type { ScriptProps } from "next/script";

export interface HeaderScriptDefinition {
  attributes: Record<string, string | boolean>;
  content: string;
}

const BOOLEAN_ATTRIBUTES = new Map<string, string>([
  ["async", "async"],
  ["defer", "defer"],
  ["nomodule", "noModule"],
]);

const STRING_ATTRIBUTES = new Map<string, string>([
  ["id", "id"],
  ["src", "src"],
  ["type", "type"],
  ["nonce", "nonce"],
  ["integrity", "integrity"],
  ["crossorigin", "crossOrigin"],
  ["referrerpolicy", "referrerPolicy"],
  ["charset", "charSet"],
  ["fetchpriority", "fetchPriority"],
  ["blocking", "blocking"],
]);

function decodeAttribute(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function parseAttributes(value: string): Record<string, string | boolean> {
  const attributes: Record<string, string | boolean> = {};
  let cursor = 0;

  while (cursor < value.length) {
    const whitespace = value.slice(cursor).match(/^\s+/)?.[0].length ?? 0;
    cursor += whitespace;
    if (cursor >= value.length) break;

    const match = /^([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(value.slice(cursor));
    if (!match) throw new Error("A custom script contains an invalid attribute.");
    cursor += match[0].length;

    const sourceName = match[1]!.toLowerCase();
    const targetName = BOOLEAN_ATTRIBUTES.get(sourceName);
    if (targetName) {
      attributes[targetName] = true;
      continue;
    }

    const stringTargetName = STRING_ATTRIBUTES.get(sourceName);
    const isDataAttribute = /^data-[a-z0-9_.:-]+$/.test(sourceName);
    if (!stringTargetName && !isDataAttribute) {
      throw new Error(`The custom script attribute "${sourceName}" is not supported.`);
    }

    const sourceValue = match[2] ?? match[3] ?? match[4];
    if (sourceValue === undefined) {
      throw new Error(`The custom script attribute "${sourceName}" requires a value.`);
    }
    attributes[stringTargetName ?? sourceName] = decodeAttribute(sourceValue);
  }

  return attributes;
}

function containsMarkup(value: string): boolean {
  return value.replace(/<!--[\s\S]*?-->/g, "").trim().length > 0;
}

/**
 * Accepts either plain JavaScript or complete script elements. Script elements
 * are converted to Next.js Script props so they can be emitted by a root layout.
 */
export function parseHeaderScripts(value: string): HeaderScriptDefinition[] {
  const source = value.trim();
  if (!source) return [];
  if (!/<script\b/i.test(source)) return [{ attributes: {}, content: source }];

  const scripts: HeaderScriptDefinition[] = [];
  const pattern = /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (containsMarkup(source.slice(cursor, match.index))) {
      throw new Error("Use JavaScript code or complete <script> elements only.");
    }
    scripts.push({
      attributes: parseAttributes(match[1] ?? ""),
      content: match[2] ?? "",
    });
    cursor = pattern.lastIndex;
  }

  if (!scripts.length || containsMarkup(source.slice(cursor))) {
    throw new Error("Use JavaScript code or complete <script> elements only.");
  }
  return scripts;
}

export function safeParseHeaderScripts(value: string): HeaderScriptDefinition[] {
  try {
    return parseHeaderScripts(value);
  } catch {
    return [];
  }
}

export function scriptProps(
  definition: HeaderScriptDefinition,
): Pick<ScriptProps, "id" | "src"> & Omit<ScriptProps, "id" | "src" | "strategy" | "children" | "dangerouslySetInnerHTML"> {
  return definition.attributes as ScriptProps;
}
