import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth";
import {
  checkExcerptSourceForPublish,
  demoteExcerptBlocks,
  extractExcerptSection,
  resolveExcerptForRead,
} from "@/lib/excerpts";
import { documentHtmlToBlocks, blocksToDocumentHtml, blocksToSourceHtml } from "@/lib/page-document";
import { validatePageForPublish } from "@/lib/publish-gate";
import type { ContentBlock } from "@/lib/types";

function session(role: AdminSession["role"], userId: string): AdminSession {
  return {
    userId,
    email: `${userId}@example.edu`,
    role,
    source: "env",
    expiresAt: Date.now() + 60_000,
    version: "test",
  };
}

function heading(blockId: string, level: 2 | 3, text: string): ContentBlock {
  return { blockId, type: "heading", level, text };
}

function paragraph(blockId: string, text: string): ContentBlock {
  return { blockId, type: "paragraph", text };
}

const SECTIONED_PAGE: ContentBlock[] = [
  paragraph("intro", "Intro."),
  heading("h2-a", 2, "Section A"),
  paragraph("a-1", "A body."),
  heading("h3-a", 3, "Subsection A.1"),
  paragraph("a-2", "A.1 body."),
  heading("h2-b", 2, "Section B"),
  paragraph("b-1", "B body."),
];

describe("extractExcerptSection", () => {
  it("returns the whole page when no heading is referenced", () => {
    const section = extractExcerptSection(SECTIONED_PAGE, undefined);
    expect(section?.blocks).toHaveLength(SECTIONED_PAGE.length);
    expect(section?.sectionTitle).toBeUndefined();
  });

  it("extracts from an H2 to the next H2, including nested H3 content", () => {
    const section = extractExcerptSection(SECTIONED_PAGE, "h2-a");
    expect(section?.sectionTitle).toBe("Section A");
    expect(section?.blocks.map((block) => block.blockId)).toEqual(["a-1", "h3-a", "a-2"]);
  });

  it("extracts an H3 section that stops at the next heading of any higher level", () => {
    const section = extractExcerptSection(SECTIONED_PAGE, "h3-a");
    expect(section?.sectionTitle).toBe("Subsection A.1");
    expect(section?.blocks.map((block) => block.blockId)).toEqual(["a-2"]);
  });

  it("extracts a procedure section by block id", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "proc-1",
        type: "procedure_section",
        title: "Step one",
        level: 2,
        blocks: [paragraph("p-1", "Do the thing.")],
      },
    ];
    const section = extractExcerptSection(blocks, "proc-1");
    expect(section?.sectionTitle).toBe("Step one");
    expect(section?.blocks.map((block) => block.blockId)).toEqual(["p-1"]);
  });

  it("returns null for a heading id that no longer exists", () => {
    expect(extractExcerptSection(SECTIONED_PAGE, "gone")).toBeNull();
  });
});

describe("demoteExcerptBlocks", () => {
  it("turns headings into bold paragraphs with escaped text", () => {
    const demoted = demoteExcerptBlocks([heading("h", 2, "A <b>risky</b> title")]);
    expect(demoted).toHaveLength(1);
    expect(demoted[0]).toMatchObject({ type: "paragraph", text: "A <b>risky</b> title" });
    const html = (demoted[0] as Extract<ContentBlock, { type: "paragraph" }>).html ?? "";
    expect(html).toContain("<strong>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("flattens procedure sections and recurses into cards", () => {
    const demoted = demoteExcerptBlocks([
      {
        blockId: "proc",
        type: "procedure_section",
        title: "Step",
        level: 2,
        blocks: [heading("inner-h", 3, "Inner")],
      },
      {
        blockId: "card",
        type: "card",
        background: "wash",
        blocks: [heading("card-h", 3, "Card heading")],
      },
    ]);
    expect(demoted.map((block) => block.type)).toEqual(["paragraph", "paragraph", "card"]);
    const card = demoted[2] as Extract<ContentBlock, { type: "card" }>;
    expect(card.blocks[0].type).toBe("paragraph");
  });

  it("replaces nested excerpts with a pointer paragraph instead of resolving them", () => {
    const demoted = demoteExcerptBlocks([
      { blockId: "nested", type: "excerpt", sourcePageId: "page-section-procedures" },
    ]);
    expect(demoted).toHaveLength(1);
    expect(demoted[0].type).toBe("paragraph");
    expect((demoted[0] as Extract<ContentBlock, { type: "paragraph" }>).text).toContain("not shown here");
  });
});

describe("excerpt block serialization round-trip", () => {
  it("round-trips an excerpt block through editor HTML", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "block-x",
        type: "excerpt",
        sourcePageId: "page-program-fact-sheets",
        sourceHeadingBlockId: "access-heading",
      },
    ];
    const parsed = documentHtmlToBlocks(blocksToDocumentHtml(blocks));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      blockId: "block-x",
      type: "excerpt",
      sourcePageId: "page-program-fact-sheets",
      sourceHeadingBlockId: "access-heading",
    });
  });

  it("round-trips through the source (HTML) view too", () => {
    const blocks: ContentBlock[] = [
      { blockId: "block-y", type: "excerpt", sourcePageId: "page-section-procedures" },
    ];
    const parsed = documentHtmlToBlocks(blocksToSourceHtml(blocks));
    expect(parsed[0]).toMatchObject({ type: "excerpt", sourcePageId: "page-section-procedures" });
    expect((parsed[0] as Extract<ContentBlock, { type: "excerpt" }>).sourceHeadingBlockId).toBeUndefined();
  });

  it("drops excerpt divs nested inside cards", () => {
    const html =
      `<section class="doc-card doc-card--paper" data-block-id="card-1" data-background="paper">` +
      `<div class="doc-excerpt" data-block-id="block-z" data-source-page-id="page-section-procedures"></div>` +
      `<p data-block-id="p-1">Kept.</p></section>`;
    const parsed = documentHtmlToBlocks(html);
    const card = parsed.find((block) => block.type === "card") as Extract<ContentBlock, { type: "card" }>;
    expect(card).toBeDefined();
    expect(card.blocks.some((block) => block.type === "excerpt")).toBe(false);
  });
});

describe("resolveExcerptForRead (in-memory seed data)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves a published public section for an anonymous reader", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const resolved = await resolveExcerptForRead(
      { sourcePageId: "page-program-fact-sheets", sourceHeadingBlockId: "access-heading" },
      null,
    );
    expect(resolved.state).toBe("ok");
    if (resolved.state === "ok") {
      expect(resolved.sourceTitle).toBe("Maintaining Program Fact Sheets");
      expect(resolved.sectionTitle).toBe("Access to Fact Sheets");
      expect(resolved.sourceHref).toBe(
        "/kb/graduate-school/procedures/maintaining-program-fact-sheets#access-heading",
      );
      expect(resolved.blocks.map((block) => block.blockId)).toEqual(["access-copy"]);
    }
  });

  it("hides a staff-only source from anonymous readers but resolves it for owners", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const ref = { sourcePageId: "page-handbooks" };
    expect((await resolveExcerptForRead(ref, null)).state).toBe("unavailable");
    expect((await resolveExcerptForRead(ref, session("owner", "any-owner"))).state).toBe("ok");
  });

  it("hides a private-KB source from anonymous readers and unassigned viewers, resolves for assigned viewers", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const ref = { sourcePageId: "page-private-staff-orientation" };
    expect((await resolveExcerptForRead(ref, null)).state).toBe("unavailable");
    expect((await resolveExcerptForRead(ref, session("viewer", "unassigned-viewer"))).state).toBe(
      "unavailable",
    );
    expect(
      (await resolveExcerptForRead(ref, session("viewer", "seed-viewer-private-staff"))).state,
    ).toBe("ok");
  });

  it("collapses missing pages, empty refs, and vanished headings to unavailable", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await resolveExcerptForRead({ sourcePageId: "" }, null)).state).toBe("unavailable");
    expect((await resolveExcerptForRead({ sourcePageId: "no-such-page" }, null)).state).toBe(
      "unavailable",
    );
    expect(
      (
        await resolveExcerptForRead(
          { sourcePageId: "page-program-fact-sheets", sourceHeadingBlockId: "gone" },
          null,
        )
      ).state,
    ).toBe("unavailable");
  });

  it("demotes headings in whole-page excerpts so the target outline stays clean", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const resolved = await resolveExcerptForRead({ sourcePageId: "page-program-fact-sheets" }, null);
    expect(resolved.state).toBe("ok");
    if (resolved.state === "ok") {
      expect(resolved.blocks.some((block) => block.type === "heading")).toBe(false);
    }
  });
});

describe("publish gate excerpt checks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const activeAsset = async () => "active";

  function publishablePage(blocks: ContentBlock[]) {
    return {
      title: "Target",
      slug: "target",
      summary: "Summary.",
      ownerLabel: "Office",
      contactEmail: "office@wsu.edu",
      lastReviewedDate: "2026-07-16",
      blocks,
    };
  }

  it("passes a page whose excerpt source is published and intact", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const issues = await validatePageForPublish(
      publishablePage([
        {
          blockId: "e1",
          type: "excerpt",
          sourcePageId: "page-program-fact-sheets",
          sourceHeadingBlockId: "access-heading",
        },
      ]),
      activeAsset,
      checkExcerptSourceForPublish,
    );
    expect(issues).toEqual([]);
  });

  it("blocks publish when the source page or section is gone", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const missingPage = await validatePageForPublish(
      publishablePage([{ blockId: "e1", type: "excerpt", sourcePageId: "no-such-page" }]),
      activeAsset,
      checkExcerptSourceForPublish,
    );
    expect(missingPage.some((issue) => issue.includes("no longer exists"))).toBe(true);

    const missingSection = await validatePageForPublish(
      publishablePage([
        {
          blockId: "e2",
          type: "excerpt",
          sourcePageId: "page-program-fact-sheets",
          sourceHeadingBlockId: "gone",
        },
      ]),
      activeAsset,
      checkExcerptSourceForPublish,
    );
    expect(missingSection.some((issue) => issue.includes("section that no longer exists"))).toBe(true);
  });

  it("skips excerpt checks when no checker is provided (back-compat)", async () => {
    const issues = await validatePageForPublish(
      publishablePage([{ blockId: "e1", type: "excerpt", sourcePageId: "no-such-page" }]),
      activeAsset,
    );
    expect(issues).toEqual([]);
  });
});
