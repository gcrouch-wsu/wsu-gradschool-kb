import { describe, expect, it } from "vitest";
import {
  analyzeDocumentQuality,
  cleanDocumentLayout,
  isBlankParagraphBlock,
} from "@/lib/page-document-quality";
import type { ContentBlock } from "@/lib/types";

describe("page-document-quality", () => {
  it("detects layout issues that make editor pages read poorly", () => {
    const blocks: ContentBlock[] = [
      { blockId: "heading-ish", type: "paragraph", text: "Create Service Request", html: "<strong>Create Service Request</strong>" },
      { blockId: "blank", type: "paragraph", text: "", html: "<br>" },
      {
        blockId: "dupe",
        type: "paragraph",
        text: "The search returns all 4+1 service requests.The search returns all 4+1 service requests.",
      },
      {
        blockId: "list",
        type: "list",
        items: ["Complete the Request Subtype as this determines the admission term. Subtype: term code Description: long term description Order number: sequential number Message Set Number: 29000 Message Number: 101 Subtype: term code Description: long term description Order number: sequential number Message Set Number: 29000 Message Number: 101"],
        itemHtml: [
          "Complete the Request Subtype as this determines the admission term. Subtype: term code Description: long term description Order number: sequential number Message Set Number: 29000 Message Number: 101<ul><li>Subtype: term code</li><li>Description: long term description</li><li>Order number: sequential number</li><li>Message Set Number: 29000</li><li>Message Number: 101</li></ul>",
        ],
      },
    ];

    expect(analyzeDocumentQuality(blocks).map((issue) => issue.code)).toEqual([
      "bold-paragraph-heading",
      "blank-spacer-paragraph",
      "duplicated-text",
      "dense-nested-list",
    ]);
  });

  it("removes safe spacer paragraphs recursively without deleting the final editable blank", () => {
    const blocks: ContentBlock[] = [
      { blockId: "blank", type: "paragraph", text: "", html: "<br>" },
      {
        blockId: "card",
        type: "card",
        background: "paper",
        blocks: [
          { blockId: "nested-blank", type: "paragraph", text: "", html: "<br>" },
          { blockId: "nested-body", type: "paragraph", text: "Body" },
        ],
      },
      { blockId: "body", type: "paragraph", text: "Outside" },
    ];

    const cleaned = cleanDocumentLayout(blocks);
    expect(cleaned.map((block) => block.blockId)).toEqual(["card", "body"]);
    const card = cleaned[0] as Extract<ContentBlock, { type: "card" }>;
    expect(card.blocks.map((block) => block.blockId)).toEqual(["nested-body"]);

    const empty = cleanDocumentLayout([{ blockId: "only", type: "paragraph", text: "", html: "<br>" }]);
    expect(empty).toHaveLength(1);
    expect(isBlankParagraphBlock(empty[0]!)).toBe(true);
  });
});
