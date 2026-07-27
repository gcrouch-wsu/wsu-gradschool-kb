import { describe, expect, it } from "vitest";
import { collectExcerptBlocks } from "@/lib/excerpt-index";
import type { ContentBlock } from "@/lib/types";

describe("collectExcerptBlocks", () => {
  it("finds top-level excerpts", () => {
    const blocks: ContentBlock[] = [
      { blockId: "e1", type: "excerpt", sourcePageId: "page-a", label: "A" },
      { blockId: "p1", type: "paragraph", text: "Hi", html: "<p>Hi</p>" },
    ];
    expect(collectExcerptBlocks(blocks).map((b) => b.blockId)).toEqual(["e1"]);
  });

  it("finds excerpts nested in card, procedure, and sourced containers", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "card-1",
        type: "card",
        title: "Card",
        background: "paper",
        blocks: [{ blockId: "e-card", type: "excerpt", sourcePageId: "page-b" }],
      },
      {
        blockId: "proc-1",
        type: "procedure_section",
        title: "Procedure",
        level: 2,
        blocks: [{ blockId: "e-proc", type: "excerpt", sourcePageId: "page-c" }],
      },
      {
        blockId: "src-1",
        type: "sourced",
        sourceUrl: "https://example.com",
        blocks: [{ blockId: "e-src", type: "excerpt", sourcePageId: "page-d", label: "Nested" }],
      },
    ];
    expect(collectExcerptBlocks(blocks).map((b) => b.blockId)).toEqual(["e-card", "e-proc", "e-src"]);
  });

  it("does not treat sourced blocks themselves as excerpts", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "src-1",
        type: "sourced",
        sourceUrl: "https://gradschool.wsu.edu/graduate-school-policies-and-procedures/",
        label: "Faculty of the Graduate School",
        headingText: "Faculty of the Graduate School",
        blocks: [{ blockId: "p1", type: "paragraph", text: "Imported", html: "<p>Imported</p>" }],
      },
    ];
    expect(collectExcerptBlocks(blocks)).toEqual([]);
  });
});
