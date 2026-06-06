import { describe, expect, it } from "vitest";
import {
  blocksToDocumentHtml,
  documentHtmlToBlocks,
  mergeDocumentAndExtraBlocks,
  sanitizePageDocument,
} from "@/lib/page-document";
import { blocksToSections } from "@/lib/page-editor-list";
import type { ContentBlock } from "@/lib/types";

describe("page-document", () => {
  it("round-trips paragraph, heading, and list blocks", () => {
    const blocks: ContentBlock[] = [
      { blockId: "p1", type: "paragraph", text: "Intro text", html: "Intro text" },
      { blockId: "h1", type: "heading", level: 2, text: "Section", html: "Section" },
      {
        blockId: "l1",
        type: "list",
        ordered: true,
        items: ["One", "Two"],
        itemHtml: ["One", "Two"],
      },
    ];
    const html = blocksToDocumentHtml(blocks);
    expect(html).toContain("<h2");
    expect(html).toContain("<ol");
    const parsed = documentHtmlToBlocks(html);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.type).toBe("paragraph");
    expect(parsed[1]).toMatchObject({ type: "heading", level: 2 });
    expect(parsed[2]).toMatchObject({ type: "list", ordered: true, items: ["One", "Two"] });
  });

  it("normalizes a legacy warning callout to info (Warning removed)", () => {
    const html =
      '<aside class="doc-alert doc-alert--warning" data-block-id="a1" data-variant="warning">Heads up</aside>';
    const blocks = documentHtmlToBlocks(html);
    const alert = blocks.find((b) => b.type === "alert");
    expect(alert).toMatchObject({ type: "alert", variant: "info" });
  });

  it("preserves an anchored note span through a flow round-trip, hidden from public render", () => {
    const html =
      '<p data-block-id="p1">See <span class="doc-note" data-note-id="n1" data-note-body="fix wording">this</span> line</p>';
    const blocks = documentHtmlToBlocks(html);
    const para = blocks.find((b) => b.type === "paragraph") as { html?: string } | undefined;
    // Stored block HTML keeps the note (editor view).
    expect(para?.html).toContain("doc-note");
    expect(para?.html).toContain("fix wording");
    // Re-serializing for the editor still carries it.
    expect(blocksToDocumentHtml(blocks)).toContain("doc-note");
  });

  it("flattens over-deep card nesting instead of dropping its content (KI-2)", () => {
    const deepParagraph: ContentBlock = {
      blockId: "deep-p",
      type: "paragraph",
      text: "DEEPMARKER content",
      html: "DEEPMARKER content",
    };
    // Five levels of cards — deeper than MAX_NESTING_DEPTH (3).
    let nested: ContentBlock = deepParagraph;
    for (let i = 0; i < 5; i += 1) {
      nested = { blockId: `card-${i}`, type: "card", background: "paper", blocks: [nested] };
    }

    const html = blocksToDocumentHtml([nested]);
    const parsed = documentHtmlToBlocks(html);

    // The deep paragraph must survive (flattened up), not be silently discarded.
    expect(JSON.stringify(parsed)).toContain("DEEPMARKER");
  });

  it("sanitizes nested inline styles inside paragraphs", () => {
    const html = sanitizePageDocument(
      '<p data-block-id="p1"><span style="color: #981e32">Red</span></p>',
    );
    expect(html).toContain('style="color: #981e32"');
    const blocks = documentHtmlToBlocks(html);
    expect(blocks[0]?.type).toBe("paragraph");
    expect((blocks[0] as { html?: string }).html).toContain("#981e32");
  });

  it("preserves rgb() colors from contenteditable spans after sync", () => {
    const html = sanitizePageDocument(
      '<p data-block-id="p1"><span style="color: rgb(152, 30, 50)">Red</span></p>',
    );
    expect(html).toContain('style="color: #981e32"');
    expect(html).not.toContain("rgb(");
  });

  it("preserves nested list markup inside list items", () => {
    const html = sanitizePageDocument(
      '<ul data-block-id="l1"><li>Parent<ul><li>Child</li></ul></li></ul>',
    );
    expect(html).toContain("<ul><li>Child</li></ul>");
    const blocks = documentHtmlToBlocks(html);
    expect(blocks[0]).toMatchObject({ type: "list" });
    expect((blocks[0] as { itemHtml?: string[] }).itemHtml?.[0]).toContain("<ul>");
  });

  it("preserves px font sizes after sync", () => {
    const html = sanitizePageDocument(
      '<p data-block-id="p1"><span style="font-size: 14px">Small</span></p>',
    );
    expect(html).toContain('font-size: 0.875rem');
  });

  it("round-trips inline font styles inside a paragraph", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "p1",
        type: "paragraph",
        text: "Crimson text",
        html: '<span style="color: #981e32">Crimson text</span>',
      },
    ];
    const parsed = documentHtmlToBlocks(blocksToDocumentHtml(blocks));
    expect((parsed[0] as { html?: string }).html).toContain("#981e32");
  });

  it("round-trips text alignment on paragraphs and headings", () => {
    const blocks: ContentBlock[] = [
      { blockId: "p1", type: "paragraph", text: "Centered", html: "Centered", align: "center" },
      { blockId: "h1", type: "heading", level: 2, text: "Right", html: "Right", align: "right" },
      { blockId: "p2", type: "paragraph", text: "Default", html: "Default" },
    ];
    const html = blocksToDocumentHtml(blocks);
    expect(html).toContain("text-align: center");
    expect(html).toContain("text-align: right");
    const parsed = documentHtmlToBlocks(html);
    expect(parsed[0]).toMatchObject({ type: "paragraph", align: "center" });
    expect(parsed[1]).toMatchObject({ type: "heading", align: "right" });
    // A block with no alignment stays undefined (default left), not "left".
    expect((parsed[2] as { align?: string }).align).toBeUndefined();
  });

  it("round-trips image alt text and the decorative flag", () => {
    const blocks: ContentBlock[] = [
      { blockId: "i1", type: "image", url: "/kb/x/files/a", alt: "A campus building", widthPercent: 100 },
      { blockId: "i2", type: "image", url: "/kb/x/files/b", decorative: true, widthPercent: 100 },
    ];
    const html = blocksToDocumentHtml(blocks);
    expect(html).toContain('alt="A campus building"');
    expect(html).toContain('data-decorative="true"');
    const parsed = documentHtmlToBlocks(html);
    expect(parsed[0]).toMatchObject({ type: "image", alt: "A campus building" });
    expect(parsed[1]).toMatchObject({ type: "image", decorative: true });
    // A decorative image carries no alt text.
    expect((parsed[1] as { alt?: string }).alt).toBeUndefined();
  });

  it("does not read the figcaption placeholder back into alt", () => {
    // An image with no alt must round-trip to no alt (the caption is chrome).
    const html = blocksToDocumentHtml([
      { blockId: "i1", type: "image", url: "/kb/x/files/a", widthPercent: 100 },
    ]);
    const parsed = documentHtmlToBlocks(html);
    expect((parsed[0] as { alt?: string }).alt).toBeUndefined();
  });

  it("round-trips image alignment and width", () => {
    const blocks: ContentBlock[] = [
      { blockId: "img1", type: "image", url: "/kb/x/files/photo", alt: "A photo", widthPercent: 50, align: "right" },
    ];
    const html = blocksToDocumentHtml(blocks);
    expect(html).toContain('data-align="right"');
    expect(html).toContain('data-width="50"');
    const parsed = documentHtmlToBlocks(html);
    expect(parsed[0]).toMatchObject({ type: "image", align: "right", widthPercent: 50 });
  });

  it("strips editor-only image control chrome on serialize", () => {
    // Controls injected for editing must never survive into stored blocks.
    const html = blocksToDocumentHtml([
      { blockId: "img1", type: "image", url: "/kb/x/files/photo", alt: "A", widthPercent: 100, align: "center" },
    ]);
    expect(html).toContain("doc-image__controls");
    const clean = sanitizePageDocument(html);
    expect(clean).not.toContain("doc-image__controls");
    expect(clean).not.toContain("data-img-action");
    expect(clean).toContain('data-align="center"');
  });

  it("round-trips an editor note (internal, not published)", () => {
    const blocks: ContentBlock[] = [
      { blockId: "n1", type: "editor_note", text: "Update the deadline", html: "Update the deadline" },
      { blockId: "p1", type: "paragraph", text: "Public text", html: "Public text" },
    ];
    const html = blocksToDocumentHtml(blocks);
    expect(html).toContain("doc-editor-note");
    const parsed = documentHtmlToBlocks(html);
    expect(parsed[0]).toMatchObject({ type: "editor_note", text: "Update the deadline" });
    expect(parsed[1]).toMatchObject({ type: "paragraph", text: "Public text" });
  });

  it("round-trips optional section dividers", () => {
    const blocks: ContentBlock[] = [
      { blockId: "p1", type: "paragraph", text: "Before" },
      { blockId: "s1", type: "section_divider" },
      { blockId: "p2", type: "paragraph", text: "After" },
    ];
    const html = blocksToDocumentHtml(blocks);
    expect(html).toContain("doc-section-break");
    const parsed = documentHtmlToBlocks(html);
    expect(parsed.map((block) => block.type)).toEqual(["paragraph", "section_divider", "paragraph"]);
  });

  it("groups continuous flow blocks for the editor UI", () => {
    const blocks: ContentBlock[] = [
      { blockId: "p1", type: "paragraph", text: "Body" },
      {
        blockId: "t1",
        type: "table",
        hasHeaderRow: true,
        hasHeaderColumn: false,
        rows: [["A", "B"]],
      },
      { blockId: "h1", type: "heading", level: 2, text: "Section" },
    ];
    const sections = blocksToSections(blocks);
    expect(sections).toHaveLength(3); // flow, table, flow
    expect(sections[0].type).toBe("flow");
    expect(sections[1].type).toBe("table");
    expect(sections[2].type).toBe("flow");
    expect(mergeDocumentAndExtraBlocks(blocks.slice(0, 1), blocks.slice(1))).toEqual(blocks);
  });
});
