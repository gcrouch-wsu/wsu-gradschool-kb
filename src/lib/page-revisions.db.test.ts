import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema, getSql, tryAcquirePageLock, releasePageLock } from "./db";
import { backfillBaselineRevisions } from "./migrations";
import {
  cleanupPageRevisionsForPage,
  createPage,
  getKbBySlug,
  getPageByIdForAdmin,
  getPageRevision,
  listPageRevisions,
  restorePageRevision,
  updatePage,
} from "./kb-store";
import type { ContentBlock } from "./types";

function paragraph(text: string): ContentBlock {
  return { blockId: "p1", type: "paragraph", text, html: text };
}

describe("page revision history (live-DB)", () => {
  const dbEnabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

  if (!dbEnabled) {
    it.skip("skipping live DB revision tests (DATABASE_URL not set)", () => {});
    return;
  }

  beforeAll(async () => {
    await ensureSchema();
  });

  it("writes a revision atomically on save, supports restore, and enforces the edit lock", async () => {
    const sql = getSql();

    let kb = await getKbBySlug("grad-school");
    let isTempKb = false;
    if (!kb) {
      const testId = `test-kb-${crypto.randomUUID()}`;
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
        VALUES (${testId}, 'test-kb', 'Test KB', 'Temp KB for CI', 'published', now())
      `;
      kb = await getKbBySlug("test-kb");
      isTempKb = true;
    }
    if (!kb) throw new Error("Could not find or create a test KB");

    const page = await createPage({
      kbId: kb.id,
      title: "Revision DB Test Page",
      blocks: [paragraph("Original content.")],
      summary: "Summary.",
      ownerLabel: "Owner",
      contactEmail: "owner@wsu.edu",
      status: "draft",
    });

    try {
      const editor = "tester@wsu.edu";

      // Save twice -> two revisions, newest first, incrementing numbers.
      await updatePage(
        { pageId: page.id, title: page.title, blocks: [paragraph("Version one.")], summary: "Summary." },
        editor,
      );
      await updatePage(
        { pageId: page.id, title: page.title, blocks: [paragraph("Version two.")], summary: "Summary." },
        editor,
      );

      // createPage snapshots the initial content (revision 1), so two saves
      // leave three revisions: create (1), "Version one." (2), "Version two." (3).
      let revisions = await listPageRevisions(page.id);
      expect(revisions).toHaveLength(3);
      expect(revisions.map((rev) => rev.revisionNumber)).toEqual([3, 2, 1]);

      // Full snapshot round-trips through JSONB.
      const versionOne = revisions.find((rev) => rev.revisionNumber === 2)!;
      const fullOne = await getPageRevision(versionOne.id);
      expect((fullOne?.blocks?.[0] as { text: string }).text).toBe("Version one.");

      // Restore -> new "restore" revision, live page reflects the old content.
      const restored = await restorePageRevision(versionOne.id, editor);
      expect((restored.blocks[0] as { text: string }).text).toBe("Version one.");
      revisions = await listPageRevisions(page.id);
      expect(revisions).toHaveLength(4);
      expect(revisions[0].action).toBe("restore");

      // Edit lock: another user's save is rejected AND writes no revision
      // (revision insert shares the update transaction).
      const locked = await tryAcquirePageLock(page.id, "other-user@wsu.edu");
      expect(locked).toBe(true);
      const beforeLockedSave = (await listPageRevisions(page.id)).length;
      await expect(
        updatePage(
          { pageId: page.id, title: page.title, blocks: [paragraph("Should not save.")], summary: "Summary." },
          "different-user@wsu.edu",
        ),
      ).rejects.toThrow();
      const afterLockedSave = await listPageRevisions(page.id);
      expect(afterLockedSave.length).toBe(beforeLockedSave);
      await releasePageLock(page.id, "other-user@wsu.edu");

      // Retention keeps the newest N per page.
      const deleted = await cleanupPageRevisionsForPage(page.id, 2);
      const kept = await listPageRevisions(page.id);
      expect(deleted).toBeGreaterThanOrEqual(1);
      expect(kept).toHaveLength(2);

      // The page still loads and matches the restored content.
      const reloaded = await getPageByIdForAdmin(page.id);
      expect((reloaded?.blocks[0] as { text: string }).text).toBe("Version one.");
    } finally {
      await sql`DELETE FROM kb_page_revisions WHERE page_id = ${page.id}`;
      await sql`DELETE FROM kb_pages WHERE id = ${page.id}`;
      if (isTempKb) {
        await sql`DELETE FROM knowledge_bases WHERE id = ${kb.id}`;
      }
    }
  });

  it("backfills a baseline revision for a page that has none, idempotently", async () => {
    const sql = getSql();
    const kbId = `test-kb-${crypto.randomUUID()}`;
    const pageId = `page-backfill-${crypto.randomUUID()}`;
    await sql`
      INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
      VALUES (${kbId}, ${kbId}, 'Backfill KB', 'temp', 'published', now())
    `;
    // Insert a page directly (bypassing createPage) so it has no revision.
    await sql`
      INSERT INTO kb_pages (
        id, kb_id, slug, path, sort_order, title, summary, status, visibility,
        owner_label, contact_email, last_reviewed_date, updated_display_date,
        blocks, related_page_ids, related_asset_ids, show_toc, toc_depth, show_summary
      ) VALUES (
        ${pageId}, ${kbId}, 'beta', 'alpha/beta', 0, 'Backfill Page', 'A summary.', 'published', 'public',
        'Owner', 'owner@wsu.edu', '2026-01-01', '2026-01-01',
        ${JSON.stringify([paragraph("Baseline content.")])}, ${JSON.stringify(["p-x"])}, ${JSON.stringify([])},
        true, 2, true
      )
    `;

    try {
      await backfillBaselineRevisions(sql);
      const revisions = await listPageRevisions(pageId);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].revisionNumber).toBe(1);
      expect(revisions[0].authorEmail).toBe("system");

      const full = await getPageRevision(revisions[0].id);
      // Snapshot mirrors PageRevisionSnapshot: path split into an array, related
      // ids and blocks preserved.
      expect(full?.path).toEqual(["alpha", "beta"]);
      expect(full?.status).toBe("published");
      expect(full?.relatedPageIds).toEqual(["p-x"]);
      expect((full?.blocks?.[0] as { text: string }).text).toBe("Baseline content.");

      // Running again does not add a second baseline (NOT EXISTS guard).
      await backfillBaselineRevisions(sql);
      expect(await listPageRevisions(pageId)).toHaveLength(1);
    } finally {
      await sql`DELETE FROM kb_page_revisions WHERE page_id = ${pageId}`;
      await sql`DELETE FROM kb_pages WHERE id = ${pageId}`;
      await sql`DELETE FROM knowledge_bases WHERE id = ${kbId}`;
    }
  });
});
