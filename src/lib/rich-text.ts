const ALLOWED_TAGS = new Set(["a", "b", "br", "code", "em", "i", "s", "strong", "sub", "sup", "u"]);
const SAFE_URL_PATTERN = /^(https?:|mailto:|\/|#)/i;

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function richTextToPlainText(html: string) {
  return sanitizeRichText(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function textToRichText(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function sanitizeAnchorAttributes(attributes: string) {
  const hrefMatch = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
  const href = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? "";
  if (!href || !SAFE_URL_PATTERN.test(href.trim())) {
    return "";
  }
  return ` href="${escapeHtml(href.trim())}" rel="noopener noreferrer"`;
}

/**
 * Small inline sanitizer for admin-authored rich text. This intentionally
 * supports only inline formatting used inside structured blocks; larger page
 * structure must remain in the ContentBlock model.
 */
export function sanitizeRichText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (full, slash: string, rawTag: string, attributes: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        return "";
      }
      if (slash) {
        return tag === "br" ? "" : `</${tag}>`;
      }
      if (tag === "br") {
        return "<br>";
      }
      if (tag === "a") {
        const safeAttributes = sanitizeAnchorAttributes(attributes);
        return safeAttributes ? `<a${safeAttributes}>` : "";
      }
      return `<${tag}>`;
    });
}
