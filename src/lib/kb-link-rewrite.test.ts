import { describe, expect, it } from "vitest";
import { rewriteKbLinksInBlocks, rewriteKbSlugInHtml } from "@/lib/kb-link-rewrite";
import type { ContentBlock } from "@/lib/types";

describe("kb-link-rewrite", () => {
  it("rewrites absolute KB article hrefs", () => {
    const html = '<p>See <a href="/kb/old-kb/policy">policy</a>.</p>';
    expect(rewriteKbSlugInHtml(html, "old-kb", "new-kb")).toBe(
      '<p>See <a href="/kb/new-kb/policy">policy</a>.</p>',
    );
  });

  it("leaves external and other-KB links alone", () => {
    const html = '<a href="https://wsu.edu">WSU</a><a href="/kb/other/x">x</a>';
    expect(rewriteKbSlugInHtml(html, "old-kb", "new-kb")).toBe(html);
  });

  it("rewrites nested card HTML", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "c1",
        type: "card",
        background: "paper",
        blocks: [
          {
            blockId: "p1",
            type: "paragraph",
            text: "x",
            html: '<a href="/kb/grad/help">Help</a>',
          },
        ],
      },
    ];
    const next = rewriteKbLinksInBlocks(blocks, "grad", "research");
    expect(next[0].type).toBe("card");
    if (next[0].type === "card") {
      expect(next[0].blocks[0]).toMatchObject({
        html: '<a href="/kb/research/help">Help</a>',
      });
    }
  });
});
