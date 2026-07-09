import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanupPageRevisionsForPage,
  createPage,
  getPageByIdForAdmin,
  getPageRevision,
  listPageRevisions,
  restorePageRevision,
  updatePage,
} from "./kb-store";
import type { ContentBlock } from "./types";

const SEED_KB_ID = "kb-grad-school";
const EDITOR = "editor@example.edu";

function paragraph(text: string): Extract<ContentBlock, { type: "paragraph" }> {
  return { blockId: "p1", type: "paragraph", text, html: text };
}

async function newDraft(title: string) {
  return createPage({
    kbId: SEED_KB_ID,
    title,
    blocks: [paragraph("Original content.")],
    summary: "Summary.",
    ownerLabel: "Owner",
    contactEmail: "owner@example.edu",
    status: "draft",
    authorEmail: EDITOR,
  });
}

describe("page revision history (in-memory)", () => {
  // These exercise the in-memory store path (no DATABASE_URL). The live-DB
  // transaction/atomicity behavior is covered in page-revisions.db.test.ts.
  const dbEnabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

  beforeEach(() => {
    if (dbEnabled) {
      // Skip guard is handled per-test below; nothing to reset for in-memory.
    }
  });

  it("snapshots the page at creation as revision 1", async () => {
    if (dbEnabled) return;
    const page = await newDraft("Create snapshot page");

    const revisions = await listPageRevisions(page.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].revisionNumber).toBe(1);
    expect(revisions[0].action).toBe("save");
    expect(revisions[0].authorEmail).toBe(EDITOR);

    const full = await getPageRevision(revisions[0].id);
    expect((full?.blocks?.[0] as { text: string }).text).toBe("Original content.");
  });

  it("records a revision on every save with an incrementing number", async () => {
    if (dbEnabled) return;
    // newDraft already creates revision 1 (the create snapshot).
    const page = await newDraft("Revision counting page");

    await updatePage(
      { pageId: page.id, title: page.title, blocks: [paragraph("First edit.")], summary: "Summary." },
      EDITOR,
    );
    await updatePage(
      { pageId: page.id, title: page.title, blocks: [paragraph("Second edit.")], summary: "Summary." },
      EDITOR,
    );

    const revisions = await listPageRevisions(page.id);
    expect(revisions).toHaveLength(3);
    // Newest first: create (1), first edit (2), second edit (3).
    expect(revisions.map((rev) => rev.revisionNumber)).toEqual([3, 2, 1]);
    expect(revisions[0].authorEmail).toBe(EDITOR);
    expect(revisions[0].action).toBe("save");
  });

  it("stores the full block snapshot and can read it back", async () => {
    if (dbEnabled) return;
    const page = await newDraft("Snapshot page");
    const savedBlock = paragraph("Snapshot content.");
    await updatePage(
      { pageId: page.id, title: page.title, blocks: [savedBlock], summary: "Summary." },
      EDITOR,
    );
    savedBlock.text = "Mutated after save.";
    savedBlock.html = "Mutated after save.";

    const [summary] = await listPageRevisions(page.id);
    const full = await getPageRevision(summary.id);
    expect(full).not.toBeNull();
    expect(full?.blocks?.[0]).toMatchObject({ type: "paragraph", text: "Snapshot content." });
  });

  it("restores a past revision as a new revision without losing history", async () => {
    if (dbEnabled) return;
    // Revisions after this: create (1), "Version one." (2), "Version two." (3).
    const page = await newDraft("Restore page");
    await updatePage(
      { pageId: page.id, title: page.title, blocks: [paragraph("Version one.")], summary: "Summary." },
      EDITOR,
    );
    await updatePage(
      { pageId: page.id, title: page.title, blocks: [paragraph("Version two.")], summary: "Summary." },
      EDITOR,
    );

    const revisions = await listPageRevisions(page.id);
    const versionOne = revisions.find((rev) => rev.revisionNumber === 2);
    expect(versionOne).toBeDefined();

    const restored = await restorePageRevision(versionOne!.id, EDITOR);
    expect((restored.blocks[0] as { text: string }).text).toBe("Version one.");

    // The live page reflects the restored content.
    const reloaded = await getPageByIdForAdmin(page.id);
    expect((reloaded?.blocks[0] as { text: string }).text).toBe("Version one.");

    // History grew by one and the newest revision is a restore (not a rewrite).
    const after = await listPageRevisions(page.id);
    expect(after).toHaveLength(4);
    expect(after[0].action).toBe("restore");
    expect(after[0].revisionNumber).toBe(4);
  });

  it("restores relatedPageIds and relatedAssetIds from the snapshot", async () => {
    if (dbEnabled) return;
    const page = await newDraft("Related links page");

    // Save with related links -> captured in revision 2.
    await updatePage(
      {
        pageId: page.id,
        title: page.title,
        blocks: [paragraph("With links.")],
        summary: "Summary.",
        relatedPageIds: ["page-related-1"],
        relatedAssetIds: ["asset-related-1"],
      },
      EDITOR,
    );
    const revWithLinks = (await listPageRevisions(page.id)).find((rev) => rev.revisionNumber === 2)!;
    expect(revWithLinks).toBeDefined();

    // Later save clears the related links.
    await updatePage(
      {
        pageId: page.id,
        title: page.title,
        blocks: [paragraph("Cleared.")],
        summary: "Summary.",
        relatedPageIds: [],
        relatedAssetIds: [],
      },
      EDITOR,
    );
    const cleared = await getPageByIdForAdmin(page.id);
    expect(cleared?.relatedPageIds).toEqual([]);
    expect(cleared?.relatedAssetIds).toEqual([]);

    // Restoring the earlier revision brings the related links back.
    const restored = await restorePageRevision(revWithLinks.id, EDITOR);
    expect(restored.relatedPageIds).toEqual(["page-related-1"]);
    expect(restored.relatedAssetIds).toEqual(["asset-related-1"]);
    const reloaded = await getPageByIdForAdmin(page.id);
    expect(reloaded?.relatedPageIds).toEqual(["page-related-1"]);
    expect(reloaded?.relatedAssetIds).toEqual(["asset-related-1"]);
  });

  it("in-memory seed pages have no baseline until first save (production backfills via migration 027)", async () => {
    if (dbEnabled) return;
    // Seed pages come from demo-data, not createPage, so in-memory mode has no
    // revision for them until they are first edited. Production DBs get a
    // baseline revision 1 from the migration 027 backfill; the in-memory store
    // (dev/test only) intentionally relies on the first save to establish it.
    const seedPageId = "page-handbooks";
    expect(await listPageRevisions(seedPageId)).toHaveLength(0);

    await updatePage(
      { pageId: seedPageId, title: "Graduate Program Handbooks", blocks: [paragraph("Edited.")], summary: "Summary." },
      EDITOR,
    );
    expect((await listPageRevisions(seedPageId)).length).toBeGreaterThanOrEqual(1);
  });

  it("retention keeps only the newest N revisions per page", async () => {
    if (dbEnabled) return;
    // create snapshot (1) + 4 edits (2..5) = 5 revisions.
    const page = await newDraft("Retention page");
    for (let i = 0; i < 4; i += 1) {
      await updatePage(
        { pageId: page.id, title: page.title, blocks: [paragraph(`Edit ${i}.`)], summary: "Summary." },
        EDITOR,
      );
    }
    expect(await listPageRevisions(page.id)).toHaveLength(5);

    const deleted = await cleanupPageRevisionsForPage(page.id, 2);
    const kept = await listPageRevisions(page.id);
    expect(deleted).toBeGreaterThanOrEqual(3);
    expect(kept).toHaveLength(2);
    // The newest two survive.
    expect(kept.map((rev) => rev.revisionNumber)).toEqual([5, 4]);
  });
});
