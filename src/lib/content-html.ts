import { parse } from "node-html-parser";

// Recognized HTML (including legacy paste markup and tags the sanitizers discard).
// This is a parsing vocabulary, NOT a security allowlist: the serializers still
// decide which elements, attributes, and URLs may reach storage or the reader.
const HTML_TAGS = new Set((
  "a abbr acronym address applet area article aside audio b base basefont bdi bdo big " +
  "blockquote body br button canvas caption center cite code col colgroup data datalist " +
  "dd del details dfn dialog dir div dl dt em embed fieldset figcaption figure font footer " +
  "form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins " +
  "kbd label legend li link main map mark marquee menu meta meter nav nobr noembed noframes " +
  "noscript object ol optgroup option output p param picture pre progress q rb rp rt rtc ruby " +
  "s samp script search section select slot small source span strike strong style sub summary " +
  "sup table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr"
).split(" "));

/**
 * An unclosed <placeholder> otherwise changes node-html-parser's tree BEFORE
 * sanitization: later sibling headings/lists can become paragraph children.
 * Escape unknown tag tokens while they are still text. Consume whole quoted
 * attributes/comments so their contents are never mistaken for separate tags.
 */
export function escapeUnknownHtmlTags(html: string): string {
  return html.replace(
    /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][a-z0-9:._-]*)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gi,
    (token: string, tag: string | undefined) => {
      if (!tag || HTML_TAGS.has(tag.toLowerCase())) return token;
      return token.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },
  );
}

export function parseContentHtml(html: string) {
  return parse(escapeUnknownHtmlTags(html));
}
