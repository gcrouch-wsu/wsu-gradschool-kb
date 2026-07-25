import type { ContentBlock } from "@/lib/types";

/**
 * Rewrite absolute `/kb/{fromSlug}/…` hrefs in stored HTML to `/kb/{toSlug}/…`
 * after a cross-KB copy/move. Relative and external links are left alone.
 */
export function rewriteKbSlugInHtml(html: string, fromSlug: string, toSlug: string): string {
  if (!html || fromSlug === toSlug) return html;
  const escaped = fromSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(href=["'])(/kb/${escaped}/)`, "gi");
  return html.replace(pattern, `$1/kb/${toSlug}/`);
}

export function rewriteKbLinksInBlocks(
  blocks: ContentBlock[],
  fromSlug: string,
  toSlug: string,
): ContentBlock[] {
  if (fromSlug === toSlug) return blocks;
  return blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
      case "alert":
        return {
          ...block,
          html: block.html ? rewriteKbSlugInHtml(block.html, fromSlug, toSlug) : block.html,
          text: block.text ? rewriteKbSlugInHtml(block.text, fromSlug, toSlug) : block.text,
        };
      case "heading":
        return {
          ...block,
          html: block.html ? rewriteKbSlugInHtml(block.html, fromSlug, toSlug) : block.html,
          text: block.text ? rewriteKbSlugInHtml(block.text, fromSlug, toSlug) : block.text,
        };
      case "list":
        return {
          ...block,
          items: block.items.map((item) => rewriteKbSlugInHtml(item, fromSlug, toSlug)),
          itemHtml: block.itemHtml?.map((item) => rewriteKbSlugInHtml(item, fromSlug, toSlug)),
        };
      case "table":
        return {
          ...block,
          rows: block.rows.map((row) => row.map((cell) => rewriteKbSlugInHtml(cell, fromSlug, toSlug))),
          rowsHtml: block.rowsHtml?.map((row) =>
            row.map((cell) => rewriteKbSlugInHtml(cell, fromSlug, toSlug)),
          ),
        };
      case "card":
      case "procedure_section":
      case "sourced":
        return {
          ...block,
          blocks: rewriteKbLinksInBlocks(block.blocks, fromSlug, toSlug),
        };
      default:
        return block;
    }
  });
}
