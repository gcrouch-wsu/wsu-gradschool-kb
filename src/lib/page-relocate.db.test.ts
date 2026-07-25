import { beforeAll, describe, expect, it } from "vitest";
import {
  ensureSchema,
  getSql,
  isDatabaseEnabled,
  loadPageById,
  tryAcquirePageLock,
} from "@/lib/db";
import {
  createPage,
  getActiveRedirectTarget,
  getPageByIdForAdmin,
  relocatePage,
} from "@/lib/kb-store";

describe.skipIf(!isDatabaseEnabled())("relocatePage (live DB)", () => {
  beforeAll(async () => {
    await ensureSchema();
  });

  it("moves a locked published subtree across KBs, clears the lock, and writes a public redirect", async () => {
    const sql = getSql();
    const id = crypto.randomUUID();
    const sourceKbId = `test-relocate-src-${id}`;
    const destKbId = `test-relocate-dst-${id}`;
    const privateKbId = `test-relocate-private-${id}`;

    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, visibility, updated_on)
        VALUES
          (${sourceKbId}, ${sourceKbId}, 'Relocate Source', '', 'published', 'public', '2026-07-25'),
          (${destKbId}, ${destKbId}, 'Relocate Dest', '', 'published', 'public', '2026-07-25'),
          (${privateKbId}, ${privateKbId}, 'Relocate Private', '', 'published', 'private', '2026-07-25')
      `;

      const root = await createPage({
        kbId: sourceKbId,
        title: `Relocate root ${id}`,
        blocks: [{ blockId: "r1", type: "paragraph", text: "Root body", html: "Root body" }],
        status: "published",
        summary: "Root summary",
        ownerLabel: "GS",
        contactEmail: "gs@wsu.edu",
        authorEmail: "editor@wsu.edu",
      });
      const child = await createPage({
        kbId: sourceKbId,
        title: `Relocate child ${id}`,
        parentPath: root.path,
        blocks: [{ blockId: "c1", type: "paragraph", text: "Child body", html: "Child body" }],
        status: "published",
        summary: "Child summary",
        ownerLabel: "GS",
        contactEmail: "gs@wsu.edu",
        authorEmail: "editor@wsu.edu",
      });

      const locked = await tryAcquirePageLock(root.id, "other-editor@wsu.edu");
      expect(locked).toBe(true);
      const beforeLock = await loadPageById(root.id);
      expect(beforeLock?.lockedBy).toBe("other-editor@wsu.edu");

      const oldRootPath = [...root.path];
      const oldChildPath = [...child.path];

      const moved = await relocatePage({
        pageId: root.id,
        targetKbId: destKbId,
        parentPath: [],
        mode: "move",
        authorEmail: "mover@wsu.edu",
      });

      expect(moved.pages).toHaveLength(2);
      expect(moved.rootPage.kbId).toBe(destKbId);

      const movedRoot = await loadPageById(root.id);
      const movedChild = await loadPageById(child.id);
      expect(movedRoot).toMatchObject({
        kbId: destKbId,
        lockedBy: null,
      });
      expect(movedChild?.kbId).toBe(destKbId);
      expect(movedChild?.path.slice(0, -1)).toEqual(movedRoot?.path);

      // Article route uses getActiveRedirectTarget for old public bookmarks.
      expect(await getActiveRedirectTarget(sourceKbId, oldRootPath)).toEqual({
        kind: "href",
        href: `/kb/${destKbId}/${movedRoot!.path.join("/")}`,
      });
      expect(await getActiveRedirectTarget(sourceKbId, oldChildPath)).toEqual({
        kind: "href",
        href: `/kb/${destKbId}/${movedChild!.path.join("/")}`,
      });

      // A second move into a private KB must not write a disclosive redirect.
      const privateMove = await relocatePage({
        pageId: root.id,
        targetKbId: privateKbId,
        parentPath: [],
        mode: "move",
        authorEmail: "mover@wsu.edu",
      });
      const pathInPublicDest = [...privateMove.rootPage.path];
      expect(await getActiveRedirectTarget(destKbId, pathInPublicDest)).toBeNull();
      expect(await getPageByIdForAdmin(root.id)).toMatchObject({ kbId: privateKbId });
    } finally {
      await sql`DELETE FROM kb_redirects WHERE kb_id IN (${sourceKbId}, ${destKbId}, ${privateKbId})`;
      await sql`DELETE FROM kb_page_revisions WHERE kb_id IN (${sourceKbId}, ${destKbId}, ${privateKbId})`;
      await sql`DELETE FROM kb_pages WHERE kb_id IN (${sourceKbId}, ${destKbId}, ${privateKbId})`;
      await sql`DELETE FROM knowledge_bases WHERE id IN (${sourceKbId}, ${destKbId}, ${privateKbId})`;
    }
  });

  it("copies into another KB via insertPage without mutating the source row", async () => {
    const sql = getSql();
    const id = crypto.randomUUID();
    const sourceKbId = `test-relocate-copy-src-${id}`;
    const destKbId = `test-relocate-copy-dst-${id}`;

    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, visibility, updated_on)
        VALUES
          (${sourceKbId}, ${sourceKbId}, 'Copy Source', '', 'published', 'public', '2026-07-25'),
          (${destKbId}, ${destKbId}, 'Copy Dest', '', 'published', 'public', '2026-07-25')
      `;

      const source = await createPage({
        kbId: sourceKbId,
        title: `Copy source ${id}`,
        blocks: [{ blockId: "keep-me", type: "paragraph", text: "Stay", html: "Stay" }],
        status: "published",
        summary: "Summary",
        ownerLabel: "GS",
        contactEmail: "gs@wsu.edu",
        authorEmail: "editor@wsu.edu",
      });

      const result = await relocatePage({
        pageId: source.id,
        targetKbId: destKbId,
        parentPath: [],
        mode: "copy",
        includeChildren: false,
        authorEmail: "editor@wsu.edu",
      });

      expect(result.rootPage.id).not.toBe(source.id);
      expect(result.rootPage.status).toBe("draft");
      expect(result.rootPage.blocks[0]?.blockId).not.toBe("keep-me");

      const original = await loadPageById(source.id);
      expect(original).toMatchObject({
        kbId: sourceKbId,
        status: "published",
      });
      expect(original?.blocks[0]).toMatchObject({ blockId: "keep-me" });

      const copy = await loadPageById(result.rootPage.id);
      expect(copy?.kbId).toBe(destKbId);
    } finally {
      await sql`DELETE FROM kb_page_revisions WHERE kb_id IN (${sourceKbId}, ${destKbId})`;
      await sql`DELETE FROM kb_pages WHERE kb_id IN (${sourceKbId}, ${destKbId})`;
      await sql`DELETE FROM knowledge_bases WHERE id IN (${sourceKbId}, ${destKbId})`;
    }
  });
});
