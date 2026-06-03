import { parse, type HTMLElement, type Node } from "node-html-parser";

const ALLOWED_TAGS = new Set(["a", "b", "br", "code", "em", "i", "s", "strong", "sub", "sup", "u"]);
const SAFE_URL_PATTERN = /^(https?:|mailto:|\/|#)/i;
// Tags whose entire contents must be discarded, not unwrapped.
const DROP_CONTENT_TAGS = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed"]);

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

function serializeChildren(node: HTMLElement): string {
  return node.childNodes.map(serializeNode).join("");
}

function serializeNode(node: Node): string {
  if (!isElement(node)) {
    // Text node: re-escape the decoded text so no markup can survive.
    return escapeHtml(node.text ?? "");
  }

  const tag = node.tagName?.toLowerCase();
  if (!tag) {
    return escapeHtml(node.text ?? "");
  }

  if (DROP_CONTENT_TAGS.has(tag)) {
    return "";
  }

  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap disallowed tags: keep their (sanitized) text content, drop the tag.
    return serializeChildren(node);
  }

  if (tag === "br") {
    return "<br>";
  }

  if (tag === "a") {
    const href = safeHref(node.getAttribute("href"));
    const inner = serializeChildren(node);
    if (!href) {
      return inner;
    }
    return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${inner}</a>`;
  }

  return `<${tag}>${serializeChildren(node)}</${tag}>`;
}

/**
 * Sanitizer for admin-authored inline rich text. Parses the input into a DOM and
 * rebuilds it from an allowlist of inline formatting tags, dropping every
 * attribute except a validated `href` on anchors. Larger page structure must
 * stay in the ContentBlock model rather than in this inline HTML.
 */
export function sanitizeRichText(value: string) {
  if (!value) {
    return "";
  }
  const root = parse(value);
  return root.childNodes.map(serializeNode).join("");
}

export function richTextToPlainText(html: string) {
  const clean = sanitizeRichText(html).replace(/<br\s*\/?>/gi, " ");
  const text = parse(clean).text;
  return text.replace(/\s+/g, " ").trim();
}

export function textToRichText(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}
