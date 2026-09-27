import { describe, expect, it } from "vitest";
import { blocksToDocumentHtml, blocksToSourceHtml, documentHtmlToBlocks } from "@/lib/page-document";
import { sanitizeCalloutHtml, sanitizeListItemHtml, sanitizeRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

const following: ContentBlock[] = [
  { type: "heading", blockId: "surviving-heading", level: 2, text: "This heading should survive" },
  { type: "list", blockId: "surviving-list", ordered: false, items: ["Sources", "Validation"] },
  { type: "paragraph", blockId: "surviving-tail", text: "Related pages remain here." },
];

describe("literal angle brackets cannot consume sibling content", () => {
  it.each(["<placeholder>", "<your-key>", "<WORD>", "<a:b>", "<placeholder/>", "<placeholder>value</placeholder>"])(
    "preserves %s and every following block through both editor HTML paths", (literal) => {
      const blocks: ContentBlock[] = [
        { type: "paragraph", blockId: "literal", text: `Set token to ${literal}.`, html: `Set token to ${literal}.` },
        ...following,
      ];
      for (const serialize of [blocksToDocumentHtml, blocksToSourceHtml]) {
        const saved = documentHtmlToBlocks(serialize(blocks));
        expect(saved).toMatchObject([
          { type: "paragraph", blockId: "literal", text: `Set token to ${literal}.` },
          ...following,
        ]);
        expect(saved).toHaveLength(4);
        expect(documentHtmlToBlocks(serialize(saved))).toEqual(saved);
      }
    },
  );

  it("protects raw HTML source before its first parse", () => {
    const saved = documentHtmlToBlocks('<p data-block-id="literal">Set token to <placeholder>.</p>' + blocksToDocumentHtml(following));
    expect(saved).toMatchObject([
      { type: "paragraph", blockId: "literal", text: "Set token to <placeholder>." },
      ...following,
    ]);
    expect(saved).toHaveLength(4);
  });

  it.each([sanitizeRichText, sanitizeListItemHtml, sanitizeCalloutHtml])(
    "preserves placeholders in shared rich text sanitizers (%#)", (sanitize) => {
      expect(sanitize('Use <your-key> and <strong>keep this emphasis</strong>.')).toBe(
        'Use &lt;your-key&gt; and <strong>keep this emphasis</strong>.',
      );
      expect(sanitize('Use &lt;your-key&gt; and 1 < 2 > 0.')).toBe('Use &lt;your-key&gt; and 1 &lt; 2 &gt; 0.');
      expect(sanitize('<a href="https://example.edu/?q=<placeholder>">Source</a>')).toContain('q=&lt;placeholder&gt;');
      expect(sanitize('Before<script>const token = "<placeholder>";</script>After')).toBe('BeforeAfter');
    },
  );
});
