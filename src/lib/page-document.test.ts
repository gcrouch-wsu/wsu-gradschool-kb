import { describe, expect, it } from "vitest";
import {
  blocksToDocumentHtml,
  blocksToSourceHtml,
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
        start: 4,
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
    expect(parsed[2]).toMatchObject({ type: "list", ordered: true, start: 4, items: ["One", "Two"] });
  });

  it("round-trips the HTML source view (Visual ⇄ HTML toggle) across block types", () => {
    const blocks: ContentBlock[] = [
      { blockId: "h1", type: "heading", level: 2, text: "Title", html: "Title" },
      { blockId: "p1", type: "paragraph", text: "Body", html: "Body" },
      { blockId: "l1", type: "list", ordered: false, items: ["A", "B"], itemHtml: ["A", "B"] },
      {
        blockId: "c1",
        type: "card",
        background: "wash",
        blocks: [{ blockId: "cp1", type: "paragraph", text: "Inside", html: "Inside" }],
      },
    ];
    const source = blocksToSourceHtml(blocks);
    // Editor-only chrome is stripped from the readable source.
    expect(source).not.toContain("doc-image__controls");
    expect(source).not.toContain("contenteditable");
    // Re-parsing the source reconstructs every block type.
    const parsed = documentHtmlToBlocks(source);
    expect(parsed.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "card"]);
    expect(parsed[3]).toMatchObject({ type: "card", background: "wash" });
  });

  it("re-mints duplicate data-block-ids so split blocks stay addressable", () => {
    const html =
      '<ol data-block-id="list-3"><li>One</li></ol>' +
      '<p data-block-id="p1">Between</p>' +
      '<ol data-block-id="list-3"><li>Two</li></ol>';
    const clean = sanitizePageDocument(html);
    const ids = [...clean.matchAll(/data-block-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain("list-3");
  });

  it("preserves a list the browser wrapped inside a paragraph on save", () => {
    // Chromium's insertOrderedList can produce <p><ol>…</ol></p>; the list must
    // survive save (a paragraph serialize would flatten it) including nesting.
    const html =
      '<p data-block-id="p1"><ol><li>One<ol><li>Two<ol><li>Three</li></ol></li></ol></li></ol></p>';
    const clean = sanitizePageDocument(html);
    expect(clean).toContain("<ol");
    // No paragraph wrapper remains around the list.
    expect(clean).not.toMatch(/<p[^>]*>\s*<ol/);

    const blocks = documentHtmlToBlocks(clean);
    const list = blocks.find((block) => block.type === "list");
    expect(list).toBeDefined();
    const listBlock = list as Extract<ContentBlock, { type: "list" }>;
    expect(listBlock.ordered).toBe(true);
    // The top-level item's plain text includes its nested descendants.
    expect(listBlock.items[0]).toContain("One");
    // Nested ordered lists survive inside the first item's itemHtml.
    expect(listBlock.itemHtml?.[0]).toContain("<ol");
    expect(listBlock.itemHtml?.[0]).toContain("Three");
  });

  it("keeps inline text alongside a browser-wrapped list as its own paragraph", () => {
    const html = '<p data-block-id="p1">Intro<ol><li>Item</li></ol></p>';
    const clean = sanitizePageDocument(html);
    const blocks = documentHtmlToBlocks(clean);
    expect(blocks.some((block) => block.type === "paragraph" && block.text === "Intro")).toBe(true);
    expect(blocks.some((block) => block.type === "list")).toBe(true);
  });

  it("strips inline font-size overrides from headings but keeps other styling", () => {
    const html =
      '<h2 data-block-id="h1"><span style="font-size: 1.6rem">Title</span></h2>' +
      '<h3 data-block-id="h2"><span style="font-size: 1.2rem; color: #981e32">Sub</span></h3>' +
      '<p data-block-id="p1"><span style="font-size: 1.375rem">Body</span></p>';
    const clean = sanitizePageDocument(html);
    const heading = clean.match(/<h2[^>]*>.*?<\/h2>/)?.[0] ?? "";
    const subheading = clean.match(/<h3[^>]*>.*?<\/h3>/)?.[0] ?? "";
    const paragraph = clean.match(/<p[^>]*>.*?<\/p>/)?.[0] ?? "";
    expect(heading).not.toContain("font-size");
    expect(heading).toContain("Title");
    expect(subheading).not.toContain("font-size");
    expect(subheading).toContain("color: #981e32");
    // Paragraph sizing is a deliberate author choice and stays.
    expect(paragraph).toContain("font-size");
  });

  it("maps pasted H1 to H2 and H4-H6 to H3 instead of demoting to paragraphs", () => {
    const pasted = "<h1>Top</h1><h4>Deep</h4><h6>Deeper</h6>";
    const blocks = documentHtmlToBlocks(pasted);
    expect(blocks.map((b) => (b.type === "heading" ? `h${b.level}` : b.type))).toEqual(["h2", "h3", "h3"]);
  });

  it("drops scripts and event handlers pasted into the HTML source", () => {
    const pasted =
      '<p data-block-id="p1">Hi<script>alert(1)</script></p><div onclick="evil()">x</div>';
    const blocks = documentHtmlToBlocks(pasted);
    const serialized = blocksToDocumentHtml(blocks);
    expect(serialized).not.toContain("<script");
    expect(serialized).not.toContain("onclick");
    expect(serialized).not.toContain("alert(1)");
  });

  it("preserves an anchored note span through a flow round-trip, hidden from public render", () => {
    const html =
      '<p data-block-id="p1">See <span class="doc-note" data-note-id="n1" data-note-body="fix wording">this</span> line</p>';
    const blocks = documentHtmlToBlocks(html);
    const para = blocks.find((b) => b.type === "paragraph") as { html?: string } | undefined;

    expect(para?.html).toContain("doc-note");
    expect(para?.html).toContain("fix wording");

    expect(blocksToDocumentHtml(blocks)).toContain("doc-note");
  });

  it("preserves a point note marker through a flow round-trip", () => {
    const html =
      '<p data-block-id="p1">Before<span class="doc-note doc-note--point" data-note-id="n2" data-note-body="check comma"></span>, after</p>';
    const blocks = documentHtmlToBlocks(html);
    const para = blocks.find((b) => b.type === "paragraph") as { html?: string } | undefined;
    expect(para?.html).toContain("doc-note--point");
    expect(para?.html).toContain("check comma");
    expect(blocksToDocumentHtml(blocks)).toContain("doc-note--point");
  });

  it("flattens over-deep card nesting instead of dropping its content (KI-2)", () => {
    const deepParagraph: ContentBlock = {
      blockId: "deep-p",
      type: "paragraph",
      text: "DEEPMARKER content",
      html: "DEEPMARKER content",
    };

    let nested: ContentBlock = deepParagraph;
    for (let i = 0; i < 5; i += 1) {
      nested = { blockId: `card-${i}`, type: "card", background: "paper", blocks: [nested] };
    }

    const html = blocksToDocumentHtml([nested]);
    const parsed = documentHtmlToBlocks(html);

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

  it("preserves nested ordered lists so public CSS can show alpha and roman sub-levels", () => {
    const html = sanitizePageDocument(
      '<ol data-block-id="l1"><li>Parent<ol><li>Child<ol><li>Grandchild</li></ol></li></ol></li></ol>',
    );
    expect(html).toContain("<ol><li>Child<ol><li>Grandchild</li></ol></li></ol>");

    const blocks = documentHtmlToBlocks(html);
    expect(blocks[0]).toMatchObject({ type: "list", ordered: true, items: ["Parent Child Grandchild"] });
    const itemHtml = (blocks[0] as { itemHtml?: string[] }).itemHtml?.[0] ?? "";
    expect(itemHtml).toContain("<ol>");
    expect(itemHtml).toContain("Grandchild");

    const source = blocksToSourceHtml(blocks);
    expect(source).toContain("<ol><li>Child<ol><li>Grandchild</li></ol></li></ol>");
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

  it("round-trips simple rich text inside info boxes without preserving headings", () => {
    const parsed = documentHtmlToBlocks(
      '<aside class="doc-alert doc-alert--info" data-block-id="a1" role="note"><h2>Do not keep heading</h2><strong>Bold</strong> <span style="color: #981e32">red</span><ol start="3"><li>First<ul><li>Nested</li></ul></li></ol></aside>',
    );
    expect(parsed[0]).toMatchObject({
      type: "alert",
      text: "Do not keep heading Bold red First Nested",
    });
    const alert = parsed[0] as Extract<ContentBlock, { type: "alert" }>;
    expect(alert.html).toContain("Do not keep heading");
    expect(alert.html).not.toContain("<h2");
    expect(alert.html).toContain("<strong>Bold</strong>");
    expect(alert.html).toContain("color: #981e32");
    expect(alert.html).toContain('<ol start="3"><li>First<ul><li>Nested</li></ul></li></ol>');
    expect(blocksToDocumentHtml(parsed)).toContain('<ol start="3"><li>First<ul><li>Nested</li></ul></li></ol>');
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

    expect((parsed[2] as { align?: string }).align).toBeUndefined();
  });

  it("round-trips image alt text and the decorative flag", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "i1",
        type: "image",
        url: "/kb/x/files/a",
        alt: "A campus building",
        caption: "Graduate School building exterior",
        widthPercent: 100,
      },
      { blockId: "i2", type: "image", url: "/kb/x/files/b", decorative: true, widthPercent: 100 },
    ];
    const html = blocksToDocumentHtml(blocks);
    expect(html).toContain('alt="A campus building"');
    expect(html).toContain("Graduate School building exterior");
    expect(html).toContain('data-decorative="true"');
    const parsed = documentHtmlToBlocks(html);
    expect(parsed[0]).toMatchObject({
      type: "image",
      alt: "A campus building",
      caption: "Graduate School building exterior",
    });
    expect(parsed[1]).toMatchObject({ type: "image", decorative: true });

    expect((parsed[1] as { alt?: string }).alt).toBeUndefined();
  });

  it("does not read the figcaption placeholder back into alt", () => {

    const html = blocksToDocumentHtml([
      { blockId: "i1", type: "image", url: "/kb/x/files/a", widthPercent: 100 },
    ]);
    const parsed = documentHtmlToBlocks(html);
    expect((parsed[0] as { alt?: string }).alt).toBeUndefined();
  });

  it("keeps captions separate from alt text", () => {
    const parsed = documentHtmlToBlocks(
      '<figure class="doc-image" data-block-id="i1"><img src="/kb/x/files/a" alt=""><figcaption>Building entrance</figcaption></figure>',
    );
    expect(parsed[0]).toMatchObject({ type: "image", caption: "Building entrance" });
    expect((parsed[0] as { alt?: string }).alt).toBeUndefined();
  });

  it("round-trips procedure sections as structural blocks", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "proc1",
        type: "procedure_section",
        title: "Submit the request",
        level: 2,
        blocks: [
          { blockId: "p1", type: "paragraph", text: "Open the form.", html: "Open the form." },
          {
            blockId: "l1",
            type: "list",
            ordered: true,
            start: 3,
            items: ["Attach the document."],
            itemHtml: ["Attach the document."],
          },
        ],
      },
    ];
    const html = blocksToDocumentHtml(blocks);
    expect(html).toContain("doc-procedure-section");
    expect(html).toContain("<h2");
    const parsed = documentHtmlToBlocks(html);
    expect(parsed[0]).toMatchObject({
      type: "procedure_section",
      title: "Submit the request",
      level: 2,
    });
    const nested = parsed[0] as Extract<ContentBlock, { type: "procedure_section" }>;
    expect(nested.blocks[1]).toMatchObject({ type: "list", ordered: true, start: 3 });
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

    const html = blocksToDocumentHtml([
      { blockId: "img1", type: "image", url: "/kb/x/files/photo", alt: "A", widthPercent: 100, align: "center" },
    ]);
    expect(html).toContain("doc-image__controls");
    const clean = sanitizePageDocument(html);
    expect(clean).not.toContain("doc-image__controls");
    expect(clean).not.toContain("data-img-action");
    expect(clean).toContain('data-align="center"');
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
    expect(sections).toHaveLength(3); 
    expect(sections[0].type).toBe("flow");
    expect(sections[1].type).toBe("table");
    expect(sections[2].type).toBe("flow");
    expect(mergeDocumentAndExtraBlocks(blocks.slice(0, 1), blocks.slice(1))).toEqual(blocks);
  });
});
