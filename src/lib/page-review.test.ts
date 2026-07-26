import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAiPrompt } from "@/lib/ai-prompts";
import {
  applyPageReviewSuggestion,
  buildBlockInventory,
  parsePageReviewResponse,
  requestPageReviewFromGateway,
  suggestionIsActionable,
  type PageReviewSuggestion,
} from "@/lib/page-review-core";
import type { ContentBlock } from "@/lib/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it("makes duplicate model suggestion ids unique", () => {
    const parsed = parsePageReviewResponse(
      JSON.stringify({
        overview: "Review.",
        suggestions: [
          { id: "dup", blockId: "p1", message: "First." },
          { id: "dup", blockId: "img1", message: "Second." },
        ],
      }),
    );
    expect(parsed.suggestions.map((item) => item.id)).toEqual(["dup", "dup-2"]);
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

  it("does not inventory or mutate nested sourced snapshot blocks", () => {
    const sourcedBlocks: ContentBlock[] = [
      {
        blockId: "source-1",
        type: "sourced",
        sourceUrl: "https://gradschool.wsu.edu/policies/",
        blocks: [{ blockId: "sourced-inner", type: "paragraph", text: "Imported policy text." }],
      },
    ];
    const inventory = buildBlockInventory(sourcedBlocks);
    expect(inventory).toContain("source-1 [sourced]");
    expect(inventory).not.toContain("sourced-inner");

    const next = applyPageReviewSuggestion(sourcedBlocks, {
      id: "s4",
      severity: "should",
      kind: "prose",
      blockId: "sourced-inner",
      message: "Do not rewrite imported text.",
      proposedText: "Changed imported text.",
    });
    expect(next).toBeNull();
  });

  it("keeps nested card and procedure block suggestions actionable", () => {
    const nestedBlocks: ContentBlock[] = [
      {
        blockId: "card-1",
        type: "card",
        background: "paper",
        blocks: [{ blockId: "card-p", type: "paragraph", text: "Card text." }],
      },
      {
        blockId: "proc-1",
        type: "procedure_section",
        title: "Steps",
        level: 2,
        blocks: [{ blockId: "proc-p", type: "paragraph", text: "Procedure text." }],
      },
    ];
    const cardNext = applyPageReviewSuggestion(nestedBlocks, {
      id: "s5",
      severity: "should",
      kind: "prose",
      blockId: "card-p",
      message: "Clarify card.",
      proposedText: "Clarified card text.",
    });
    expect(cardNext?.[0]).toMatchObject({
      type: "card",
      blocks: [{ blockId: "card-p", text: "Clarified card text." }],
    });

    const procNext = applyPageReviewSuggestion(nestedBlocks, {
      id: "s6",
      severity: "should",
      kind: "prose",
      blockId: "proc-p",
      message: "Clarify procedure.",
      proposedText: "Clarified procedure text.",
    });
    expect(procNext?.[1]).toMatchObject({
      type: "procedure_section",
      blocks: [{ blockId: "proc-p", text: "Clarified procedure text." }],
    });
  });

  it("does not auto-replace nested list items and escapes rich list replacements", () => {
    const nestedList: ContentBlock[] = [
      {
        blockId: "nested-list",
        type: "list",
        items: ["Parent"],
        itemHtml: ["Parent<ul><li>Child</li></ul>"],
      },
    ];
    expect(
      applyPageReviewSuggestion(nestedList, {
        id: "s7",
        severity: "should",
        kind: "grammar",
        blockId: "nested-list",
        message: "Do not flatten children.",
        itemIndex: 0,
        proposedText: "Parent revised",
      }),
    ).toBeNull();

    const richList: ContentBlock[] = [
      {
        blockId: "rich-list",
        type: "list",
        items: ["Old"],
        itemHtml: ["Old"],
      },
    ];
    const next = applyPageReviewSuggestion(richList, {
      id: "s8",
      severity: "should",
      kind: "grammar",
      blockId: "rich-list",
      message: "Escape model text.",
      itemIndex: 0,
      proposedText: "<strong>Plain text only</strong>",
    });
    expect(next?.[0]).toMatchObject({
      type: "list",
      items: ["<strong>Plain text only</strong>"],
      itemHtml: ["&lt;strong&gt;Plain text only&lt;/strong&gt;"],
    });
  });

  it("accepts alternate AI response text shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({ overview: "Looks readable.", suggestions: [] }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      requestPageReviewFromGateway({
        title: "Ready",
        blocks,
        endpoint: "https://ai.example/v1/chat/completions",
        apiKey: "secret",
        model: "model",
      }),
    ).resolves.toEqual({ overview: "Looks readable.", suggestions: [] });
  });
});
