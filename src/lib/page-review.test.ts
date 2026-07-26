import { describe, expect, it } from "vitest";
import { resolveAiPrompt } from "@/lib/ai-prompts";
import {
  applyPageReviewSuggestion,
  buildBlockInventory,
  parsePageReviewResponse,
  suggestionIsActionable,
  type PageReviewSuggestion,
} from "@/lib/page-review-core";
import type { ContentBlock } from "@/lib/types";

describe("resolveAiPrompt", () => {
  it("prefers KB, then site, then built-in", () => {
    expect(resolveAiPrompt("kb", "site", "built-in")).toBe("kb");
    expect(resolveAiPrompt("  ", "site", "built-in")).toBe("site");
    expect(resolveAiPrompt("", "", "built-in")).toBe("built-in");
  });
});

describe("page-review-core", () => {
  const blocks: ContentBlock[] = [
    { blockId: "p1", type: "paragraph", text: "Students must finish forms soon." },
    { blockId: "img1", type: "image", alt: "pic", decorative: false },
    {
      blockId: "list1",
      type: "list",
      ordered: false,
      items: ["First item", "Second item"],
    },
  ];

  it("builds a block inventory with image alt status", () => {
    const inventory = buildBlockInventory(blocks);
    expect(inventory).toContain("p1");
    expect(inventory).toContain("img1");
    expect(inventory).toContain("alt=pic");
  });

  it("parses JSON review payloads and strips fences", () => {
    const raw = [
      "```json",
      JSON.stringify({
        overview: "Tighten wording and improve alt text.",
        suggestions: [
          {
            id: "s1",
            severity: "should",
            kind: "prose",
            blockId: "p1",
            message: "Make the deadline clearer.",
            proposedText: "Students must finish all required forms before the deadline.",
          },
          {
            id: "s2",
            severity: "must",
            kind: "alt",
            blockId: "img1",
            message: "Alt is too vague.",
            proposedAlt: "Screenshot of the Graduate Faculty status decision tree",
          },
        ],
      }),
      "```",
    ].join("\n");
    const parsed = parsePageReviewResponse(raw);
    expect(parsed.overview).toMatch(/Tighten/);
    expect(parsed.suggestions).toHaveLength(2);
    expect(parsed.suggestions[1].proposedAlt).toMatch(/decision tree/);
  });

  it("applies prose and alt suggestions", () => {
    const prose: PageReviewSuggestion = {
      id: "s1",
      severity: "should",
      kind: "prose",
      blockId: "p1",
      message: "Clarify",
      proposedText: "Students must finish all required forms before the deadline.",
    };
    const withProse = applyPageReviewSuggestion(blocks, prose);
    expect(withProse?.[0]).toMatchObject({
      blockId: "p1",
      text: "Students must finish all required forms before the deadline.",
    });

    const alt: PageReviewSuggestion = {
      id: "s2",
      severity: "must",
      kind: "alt",
      blockId: "img1",
      message: "Better alt",
      proposedAlt: "Decision tree diagram",
    };
    const withAlt = applyPageReviewSuggestion(blocks, alt);
    expect(withAlt?.[1]).toMatchObject({
      blockId: "img1",
      alt: "Decision tree diagram",
      decorative: false,
    });
  });

  it("applies list item replacements", () => {
    const suggestion: PageReviewSuggestion = {
      id: "s3",
      severity: "optional",
      kind: "grammar",
      blockId: "list1",
      message: "Tighten item",
      itemIndex: 1,
      proposedText: "Second item, revised",
    };
    const next = applyPageReviewSuggestion(blocks, suggestion);
    expect(next?.[2]).toMatchObject({
      type: "list",
      items: ["First item", "Second item, revised"],
    });
    expect(suggestionIsActionable(suggestion)).toBe(true);
  });
});
