import { describe, expect, it } from "vitest";
import { validatePageForPublish, validateRevisionForRestore, type PublishablePage } from "@/lib/publish-gate";
import type { ContentBlock } from "@/lib/types";

const activeResolver = async () => "active";

function validPage(): PublishablePage {
  return {
    title: "Maintaining Program Fact Sheets",
    slug: "maintaining-program-fact-sheets",
    summary: "How to keep program fact sheets current.",
    ownerLabel: "Graduate School Outreach and Technology",
    contactEmail: "gradtech@wsu.edu",
    lastReviewedDate: "2026-06-02",
    blocks: [
      { blockId: "h1", type: "heading", level: 2, text: "Overview", html: "Overview" },
      { blockId: "h2", type: "heading", level: 3, text: "Steps", html: "Steps" },
      {
        blockId: "p1",
        type: "paragraph",
        text: "See the graduate handbook.",
        html: '<a href="https://wsu.edu">graduate handbook</a>',
      },
      { blockId: "img1", type: "image", url: "/kb/x/files/y", alt: "Screenshot of the fact sheet editor" },
      {
        blockId: "t1",
        type: "table",
        hasHeaderRow: true,
        hasHeaderColumn: false,
        rows: [
          ["Field", "Value"],
          ["Name", "Biology"],
        ],
      },
      { blockId: "a1", type: "asset_link", assetId: "asset-1" },
    ],
  };
}

describe("validatePageForPublish", () => {
  it("passes a complete, accessible page", async () => {
    expect(await validatePageForPublish(validPage(), activeResolver)).toEqual([]);
  });

  it("requires a summary", async () => {
    const page = { ...validPage(), summary: "  " };
    expect(await validatePageForPublish(page, activeResolver)).toContain("Page is missing a summary.");
  });

  it("requires a valid contact email", async () => {
    const page = { ...validPage(), contactEmail: "not-an-email" };
    expect(await validatePageForPublish(page, activeResolver)).toContain(
      "Page needs a valid contact email.",
    );
  });

  it("requires owner and last reviewed date", async () => {
    const page = { ...validPage(), ownerLabel: "", lastReviewedDate: "" };
    const issues = await validatePageForPublish(page, activeResolver);
    expect(issues).toContain("Page is missing a responsible office label.");
    expect(issues).toContain("Page is missing a last reviewed date.");
  });

  it("flags skipped heading levels (sub-heading before a section heading)", async () => {
    const page = validPage();
    page.blocks = [
      { blockId: "h3", type: "heading", level: 3, text: "Orphan sub-heading", html: "Orphan sub-heading" },
    ];
    expect(await validatePageForPublish(page, activeResolver)).toContain(
      "Heading levels are skipped (a sub-heading appears before any section heading).",
    );
  });

  it("flags images without alt text", async () => {
    const page = validPage();
    page.blocks = [{ blockId: "img", type: "image", url: "/kb/x/files/y", alt: "" }];
    const issues = await validatePageForPublish(page, activeResolver);
    expect(issues.some((i) => i.includes("missing alt text"))).toBe(true);
  });

  it("flags tables without headers", async () => {
    const page = validPage();
    page.blocks = [
      { blockId: "t", type: "table", hasHeaderRow: false, hasHeaderColumn: false, rows: [["a", "b"]] },
    ];
    const issues = await validatePageForPublish(page, activeResolver);
    expect(issues.some((i) => i.includes("no header row or header column"))).toBe(true);
  });

  it("flags vague link text", async () => {
    const page = validPage();
    page.blocks = [
      { blockId: "p", type: "paragraph", text: "click here", html: '<a href="https://wsu.edu">click here</a>' },
    ];
    expect(await validatePageForPublish(page, activeResolver)).toContain(
      'A link uses vague text such as "click here". Use descriptive link text.',
    );
  });

  it("validates links inside procedure sections", async () => {
    const page = validPage();
    page.blocks = [
      {
        blockId: "proc1",
        type: "procedure_section",
        title: "Submit materials",
        level: 2,
        blocks: [
          { blockId: "p", type: "paragraph", text: "click here", html: '<a href="/x">click here</a>' },
        ],
      },
    ];
    expect(await validatePageForPublish(page, activeResolver)).toContain(
      'A link uses vague text such as "click here". Use descriptive link text.',
    );
  });

  it("flags links with no destination", async () => {
    const page = validPage();
    page.blocks = [
      { blockId: "p", type: "paragraph", text: "the handbook", html: '<a href="#">the handbook</a>' },
    ];
    expect(await validatePageForPublish(page, activeResolver)).toContain("A link has no destination.");
  });

  it("blocks references to non-active assets", async () => {
    const archivedResolver = async () => "archived";
    const page = validPage();
    page.blocks = [{ blockId: "a", type: "asset_link", assetId: "asset-9" }];
    expect(await validatePageForPublish(page, archivedResolver)).toContain(
      "A file link references an asset that is not active.",
    );
  });
});

describe("validateRevisionForRestore", () => {
  const activeResolver = async () => "active";
  const archivedResolver = async () => "archived";

  function publishedRevision(overrides: Partial<PublishablePage> = {}) {
    const valid = validPage();
    return { ...valid, status: "published" as const, ...overrides };
  }

  it("skips the gate for draft revisions (restoring leaves the page a draft)", async () => {
    const draft = { ...validPage(), status: "draft" as const, summary: "" };
    expect(await validateRevisionForRestore(draft, archivedResolver)).toEqual([]);
  });

  it("allows a valid published revision", async () => {
    expect(await validateRevisionForRestore(publishedRevision(), activeResolver)).toEqual([]);
  });

  it("blocks a published revision that is missing a summary", async () => {
    const issues = await validateRevisionForRestore(publishedRevision({ summary: "  " }), activeResolver);
    expect(issues).toContain("Page is missing a summary.");
  });

  it("blocks a published revision whose asset has since been archived", async () => {
    const blocks: ContentBlock[] = [{ blockId: "a", type: "asset_link", assetId: "asset-9" }];
    const issues = await validateRevisionForRestore(publishedRevision({ blocks }), archivedResolver);
    expect(issues).toContain("A file link references an asset that is not active.");
  });
});
