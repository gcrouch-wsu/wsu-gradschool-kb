import { describe, expect, it } from "vitest";
import { blocksToDocumentHtml, documentHtmlToBlocks } from "@/lib/page-document";
import type { ContentBlock } from "@/lib/types";

/** Phase 0 gate: ContentBlock HTML boundary stays the source of truth for Lexical import/export. */
describe("Lexical spike ContentBlock round-trip fixtures", () => {
  it("round-trips paragraph, heading, and list through HTML boundary", () => {
    const blocks: ContentBlock[] = [
      { blockId: "h", type: "heading", level: 2, text: "Heading", html: "Heading" },
      {
        blockId: "p",
        type: "paragraph",
        text: "Hello world",
        html: "Hello world",
      },
      {
        blockId: "l",
        type: "list",
        ordered: false,
        items: ["One", "Two"],
        itemHtml: ["One", "Two"],
      },
    ];
    const html = blocksToDocumentHtml(blocks);
    const parsed = documentHtmlToBlocks(html);
    expect(parsed.some((b) => b.type === "heading")).toBe(true);
    expect(parsed.some((b) => b.type === "paragraph")).toBe(true);
    expect(parsed.some((b) => b.type === "list")).toBe(true);
    const again = documentHtmlToBlocks(blocksToDocumentHtml(parsed));
    expect(again.map(typeOf)).toEqual(parsed.map(typeOf));
  });
});

function typeOf(block: ContentBlock) {
  return block.type;
}
