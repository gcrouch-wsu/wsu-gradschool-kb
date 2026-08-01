import { describe, expect, it } from "vitest";
import { blocksToDocumentHtml, documentHtmlToBlocks } from "@/lib/page-document";
import type { ContentBlock } from "@/lib/types";

/**
 * The ContentBlock ↔ HTML boundary is the storage contract every editor surface round-trips
 * through, so it stays the source of truth regardless of which framework renders the surface.
 * Started life as the Lexical Phase 0 gate; kept after the spike route was removed.
 */
describe("ContentBlock round-trip through the document HTML boundary", () => {
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
