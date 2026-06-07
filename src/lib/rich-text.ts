import { parse, type HTMLElement, type Node } from "node-html-parser";
import { SAFE_FONTS } from "@/lib/kb-theme";

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "br",
  "code",
  "em",
  "i",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);
const SAFE_URL_PATTERN = /^(https?:|mailto:|\/|#)/i;

const DROP_CONTENT_TAGS = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed"]);

export const RICH_TEXT_FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
] as const;

export const RICH_TEXT_FONT_SIZES = [
  { label: "Default", value: "" },
  { label: "Small", value: "0.875rem" },
  { label: "Normal", value: "1rem" },
  { label: "Large", value: "1.125rem" },
  { label: "X-Large", value: "1.375rem" },
] as const;

export const RICH_TEXT_COLORS = [
  { label: "Default", value: "" },
  { label: "Crimson", value: "#981e32" },
  { label: "Gray", value: "#5e6a71" },
  { label: "Black", value: "#000000" },
] as const;

const ALLOWED_FONT_FAMILY = new Set<string>([
  ...RICH_TEXT_FONT_FAMILIES.map((item) => item.value).filter((value) => value.length > 0),
  ...Object.values(SAFE_FONTS).map((font) => font.stack),
]);

const MIN_REM = 0.5;
const MAX_REM = 3;

const LEGACY_FONT_SIZE: Record<string, string> = {
  "1": "0.75rem",
  "2": "0.875rem",
  "3": "1rem",
  "4": "1.125rem",
  "5": "1.375rem",
  "6": "1.5rem",
  "7": "1.75rem",
};

function clampRem(rem: number): string | null {
  if (!Number.isFinite(rem)) {
    return null;
  }
  const clamped = Math.min(MAX_REM, Math.max(MIN_REM, rem));
  return `${Math.round(clamped * 1000) / 1000}rem`;
}

const LIST_ITEM_TAGS = new Set(["ul", "ol", "li"]);

type RichTextMode = "inline" | "list-item";

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isElement(node: Node): node is HTMLElement {
  return (node as HTMLElement).tagName !== undefined && (node as HTMLElement).tagName !== null;
}

function safeHref(raw: string | undefined): string | null {
  const href = (raw ?? "").trim();
  if (!href || !SAFE_URL_PATTERN.test(href)) {
    return null;
  }
  return href;
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stripFontQuotes(value: string) {
  return value.replace(/["']/g, "").trim();
}

function normalizeFontFamily(value: string): string | null {
  const normalized = stripFontQuotes(normalizeWhitespace(value));
  for (const allowed of ALLOWED_FONT_FAMILY) {
    const allowedNorm = stripFontQuotes(allowed);
    if (normalized.toLowerCase() === allowedNorm.toLowerCase()) {
      return allowed;
    }
  }
  const primary = normalized.split(",")[0]?.trim().toLowerCase();
  if (!primary) {
    return null;
  }
  for (const allowed of ALLOWED_FONT_FAMILY) {
    const allowedPrimary = stripFontQuotes(allowed).split(",")[0]?.trim().toLowerCase();
    if (primary === allowedPrimary) {
      return allowed;
    }
  }
  return null;
}

function normalizeFontSize(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  const rem = normalized.match(/^(\d+(?:\.\d+)?)rem$/i);
  if (rem) {
    return clampRem(Number(rem[1]));
  }
  const legacy = LEGACY_FONT_SIZE[normalized];
  if (legacy) {
    return clampRem(Number(legacy.replace("rem", "")));
  }
  const px = normalized.match(/^(\d+(?:\.\d+)?)px$/i);
  if (px) {
    return clampRem(Number(px[1]) / 16);
  }
  const pt = normalized.match(/^(\d+(?:\.\d+)?)pt$/i);
  if (pt) {
    return clampRem((Number(pt[1]) * 96) / 72 / 16);
  }
  return null;
}

function rgbChannelToHex(channel: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(channel)));
  return clamped.toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${rgbChannelToHex(r)}${rgbChannelToHex(g)}${rgbChannelToHex(b)}`;
}

function normalizeColor(value: string): string | null {
  const normalized = normalizeWhitespace(value).toLowerCase();

  const rgb = normalized.match(
    /^rgba?\(\s*(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})(?:\s*(?:,|\/)\s*[\d.]+%?)?\s*\)$/,
  );
  if (rgb) {
    return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }

  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) {
    return null;
  }
  return hex[1].length === 3
    ? `#${hex[1]
        .split("")
        .map((ch) => ch + ch)
        .join("")}`
    : `#${hex[1]}`;
}

export function canonicalInlineStyle(raw: string | undefined): string | null {
  return safeStyleAttribute(raw);
}

function safeStyleAttribute(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const parts: string[] = [];
  for (const declaration of raw.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) {
      continue;
    }
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!value) {
      continue;
    }
    if (property === "font-family") {
      const safe = normalizeFontFamily(value);
      if (safe) {
        parts.push(`font-family: ${safe}`);
      }
    } else if (property === "font-size") {
      const safe = normalizeFontSize(value);
      if (safe) {
        parts.push(`font-size: ${safe}`);
      }
    } else if (property === "color") {
      const safe = normalizeColor(value);
      if (safe) {
        parts.push(`color: ${safe}`);
      }
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

function styleFromFontElement(node: HTMLElement): string | null {
  const parts: string[] = [];
  const face = node.getAttribute("face");
  if (face) {
    const safe = normalizeFontFamily(face);
    if (safe) {
      parts.push(`font-family: ${safe}`);
    }
  }
  const size = node.getAttribute("size");
  if (size) {
    const safe = normalizeFontSize(size) ?? (LEGACY_FONT_SIZE[size] ? normalizeFontSize(LEGACY_FONT_SIZE[size]) : null);
    if (safe) {
      parts.push(`font-size: ${safe}`);
    }
  }
  const color = node.getAttribute("color");
  if (color) {
    const safe = normalizeColor(color);
    if (safe) {
      parts.push(`color: ${safe}`);
    }
  }
  const inline = safeStyleAttribute(node.getAttribute("style"));
  if (inline) {
    for (const part of inline.split(";")) {
      const trimmed = part.trim();
      if (trimmed && !parts.some((existing) => existing.split(":")[0]?.trim() === trimmed.split(":")[0]?.trim())) {
        parts.push(trimmed);
      }
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

function serializeStyledSpan(node: HTMLElement, style: string, mode: RichTextMode = "inline") {
  return `<span style="${escapeHtml(style)}">${serializeChildren(node, mode)}</span>`;
}

function tagAllowed(tag: string, mode: RichTextMode): boolean {
  if (ALLOWED_TAGS.has(tag)) {
    return true;
  }
  return mode === "list-item" && LIST_ITEM_TAGS.has(tag);
}

function serializeChildren(node: HTMLElement, mode: RichTextMode): string {
  return node.childNodes.map((child) => serializeNode(child, mode)).join("");
}

function serializeListElement(node: HTMLElement, tag: "ul" | "ol", mode: RichTextMode): string {
  const type = node.getAttribute("type");
  const start = node.getAttribute("start");
  const typeAttr = type ? ` type="${escapeHtml(type)}"` : "";
  const startAttr = start ? ` start="${escapeHtml(start)}"` : "";
  const items = node.childNodes
    .filter((child): child is HTMLElement => isElement(child) && child.tagName?.toLowerCase() === "li")
    .map((li) => serializeNode(li, mode))
    .join("");
  return items ? `<${tag}${typeAttr}${startAttr}>${items}</${tag}>` : "";
}

function serializeNode(node: Node, mode: RichTextMode = "inline"): string {
  if (!isElement(node)) {

    return escapeHtml(node.text ?? "");
  }

  const tag = node.tagName?.toLowerCase();
  if (!tag) {
    return escapeHtml(node.text ?? "");
  }

  if (DROP_CONTENT_TAGS.has(tag)) {
    return "";
  }

  if (tag === "font") {
    const style = styleFromFontElement(node);
    if (!style) {
      return serializeChildren(node, mode);
    }
    return serializeStyledSpan(node, style, mode);
  }

  if (tag === "ul" || tag === "ol") {
    if (mode !== "list-item") {
      return serializeChildren(node, mode);
    }
    return serializeListElement(node, tag, mode);
  }

  if (tag === "li") {
    if (mode !== "list-item") {
      return serializeChildren(node, mode);
    }
    const inner = serializeChildren(node, mode);
    return inner ? `<li>${inner}</li>` : "";
  }

  if (!tagAllowed(tag, mode)) {

    return serializeChildren(node, mode);
  }

  if (tag === "br") {
    return "<br>";
  }

  if (tag === "span") {

    const cls = node.getAttribute("class") ?? "";
    if (/\bdoc-note\b/.test(cls) || node.getAttribute("data-note-id")) {
      const inner = serializeChildren(node, mode);
      if (!preserveNotes) {
        return inner;
      }
      const id = (node.getAttribute("data-note-id") ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
      const body = escapeHtml(node.getAttribute("data-note-body") ?? "");
      const idAttr = id ? ` data-note-id="${id}"` : "";
      const pointClass = /\bdoc-note--point\b/.test(cls) ? " doc-note--point" : "";
      return `<span class="doc-note${pointClass}"${idAttr} data-note-body="${body}">${inner}</span>`;
    }
    const style = safeStyleAttribute(node.getAttribute("style"));
    if (!style) {
      return serializeChildren(node, mode);
    }
    return serializeStyledSpan(node, style, mode);
  }

  if (tag === "a") {
    const href = safeHref(node.getAttribute("href"));
    const target = node.getAttribute("target") === "_blank" ? "_blank" : undefined;
    const inner = serializeChildren(node, mode);
    if (!href) {
      return inner;
    }
    const targetAttr = target ? ` target="${target}"` : "";
    return `<a href="${escapeHtml(href)}"${targetAttr} rel="noopener noreferrer">${inner}</a>`;
  }

  return `<${tag}>${serializeChildren(node, mode)}</${tag}>`;
}

let preserveNotes = false;

export interface SanitizeOptions {

  keepNotes?: boolean;
}

export function sanitizeRichText(value: string, opts?: SanitizeOptions) {
  if (!value) {
    return "";
  }
  const previous = preserveNotes;
  preserveNotes = opts?.keepNotes ?? false;
  try {
    const root = parse(value);
    return root.childNodes.map((child) => serializeNode(child, "inline")).join("");
  } finally {
    preserveNotes = previous;
  }
}

export function sanitizeListItemHtml(value: string, opts?: SanitizeOptions) {
  if (!value) {
    return "";
  }
  const previous = preserveNotes;
  preserveNotes = opts?.keepNotes ?? false;
  try {
    const root = parse(value);
    return root.childNodes.map((child) => serializeNode(child, "list-item")).join("");
  } finally {
    preserveNotes = previous;
  }
}

export function richTextToPlainText(html: string) {
  const clean = sanitizeRichText(html).replace(/<br\s*\/?>/gi, " ");
  const text = parse(clean).text;
  return text.replace(/\s+/g, " ").trim();
}

export function textToRichText(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}
