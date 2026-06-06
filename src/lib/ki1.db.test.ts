/**
 * KI-1 live-database integration tests.
 *
 * These exercise the Neon-only paths that cannot be proven in memory: edit-lock
 * enforcement, ATOMIC multi-row rollback, lock expiry, Postgres full-text search
 * safety/recall + the staff-visibility prune, and per-editor KB scoping.
 *
 * They self-skip unless DATABASE_URL is set, so they are inert during the normal
 * `npm test` run. Run them against your Neon database with:
 *
 *     npm run test:db
 *
 * Every test creates data under a unique, timestamped id and the suite deletes
 * its knowledge base (cascading to pages/assignments) afterwards, so it never
 * collides with your seeded content.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteKb,
  ensureSchema,
  getSql,
  tryAcquirePageLock,
  updatePages,
} from "@/lib/db";
import {
  createManagedAsset,
  getAssetForDelivery,
  searchKb,
  updateAssetAltText,
  updatePageStatus,
} from "@/lib/kb-store";
import { canAccessKb, type AdminSession } from "@/lib/auth";
import { videoDeliveryUrl } from "@/lib/video";
import { deleteUser, insertUser, replaceUserAssignments } from "@/lib/db-users";
import type { ContentBlock, KbPage } from "@/lib/types";

const dbEnabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

// Unique per run so we never touch seeded data and cleanup is exact.
const RUN = `ki1-${Date.now()}`;
const KB_ID = `kb-${RUN}`;

function makePage(
  overrides: Partial<KbPage> & { id: string; slug: string; path: string[]; title: string },
): KbPage {
  return {
    kbId: KB_ID,
    sortOrder: 0,
    summary: "",
    status: "published",
    visibility: "public",
    ownerLabel: "",
    contactEmail: "",
    lastReviewedDate: "",
    updatedDisplayDate: "2026-01-01",
    blocks: [],
    relatedPageIds: [],
    relatedAssetIds: [],
    showToc: true,
    tocDepth: 2,
    showSummary: true,
    ...overrides,
  };
}

async function insertPage(page: KbPage): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO kb_pages (id, kb_id, slug, path, sort_order, title, summary, status, visibility, blocks)
    VALUES (
      ${page.id}, ${page.kbId}, ${page.slug}, ${page.path.join("/")}, ${page.sortOrder},
      ${page.title}, ${page.summary}, ${page.status}, ${page.visibility},
      ${JSON.stringify(page.blocks)}::jsonb
    )
  `;
}

async function readPage(id: string): Promise<{ title: string; locked_by: string | null } | undefined> {
  const sql = getSql();
  const rows = (await sql`SELECT title, locked_by FROM kb_pages WHERE id = ${id}`) as unknown as Array<{
    title: string;
    locked_by: string | null;
  }>;
  return rows[0];
}

describe.skipIf(!dbEnabled)("KI-1 live-DB integration", () => {
  beforeAll(async () => {
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
      VALUES (${KB_ID}, ${KB_ID}, 'KI-1 Test KB', '', 'published', '2026-01-01')
    `;
  });

  afterAll(async () => {
    if (!dbEnabled) return;
    await deleteKb(KB_ID);
  });

  describe("edit locks", () => {
    it("blocks a save when another user holds the lock and leaves the row unchanged", async () => {
      const id = `page-${RUN}-lock`;
      await insertPage(makePage({ id, slug: "lock", path: ["lock"], title: "Original" }));

      expect(await tryAcquirePageLock(id, "alice@test.edu")).toBe(true);

      const edited = makePage({ id, slug: "lock", path: ["lock"], title: "Clobbered by Bob" });
      await expect(updatePages([edited], "bob@test.edu")).rejects.toThrow(/locked/i);

      expect((await readPage(id))?.title).toBe("Original");
    });

    it("rolls back the ENTIRE batch when one page in a multi-row write is locked", async () => {
      // This is the atomicity guarantee: a reorder/move touches many rows, and a
      // lock conflict on any one of them must leave NONE of them changed.
      const id1 = `page-${RUN}-batchA`;
      const id2 = `page-${RUN}-batchB`;
      await insertPage(makePage({ id: id1, slug: "batch-a", path: ["batch-a"], title: "A-original" }));
      await insertPage(makePage({ id: id2, slug: "batch-b", path: ["batch-b"], title: "B-original" }));

      // Another user locks the SECOND page in the batch.
      expect(await tryAcquirePageLock(id2, "alice@test.edu")).toBe(true);

      const edits = [
        makePage({ id: id1, slug: "batch-a", path: ["batch-a"], title: "A-edited" }),
        makePage({ id: id2, slug: "batch-b", path: ["batch-b"], title: "B-edited" }),
      ];
      await expect(updatePages(edits, "bob@test.edu")).rejects.toThrow(/locked/i);

      // The first, lock-free page must NOT have been written — proves rollback,
      // not a partial write.
      expect((await readPage(id1))?.title).toBe("A-original");
      expect((await readPage(id2))?.title).toBe("B-original");
    });

    it("lets another user acquire the lock once it has expired", async () => {
      const id = `page-${RUN}-expiry`;
      await insertPage(makePage({ id, slug: "expiry", path: ["expiry"], title: "Expiry" }));

      expect(await tryAcquirePageLock(id, "alice@test.edu")).toBe(true);
      // Bob cannot take a live lock held by Alice.
      expect(await tryAcquirePageLock(id, "bob@test.edu")).toBe(false);

      // Force the lock to look expired (past its TTL).
      const sql = getSql();
      await sql`UPDATE kb_pages SET locked_at = now() - interval '5 minutes' WHERE id = ${id}`;

      // Now Bob can acquire it.
      expect(await tryAcquirePageLock(id, "bob@test.edu")).toBe(true);
      expect((await readPage(id))?.locked_by).toBe("bob@test.edu");
    });
  });

  describe("full-text search", () => {
    it("never errors on punctuation-heavy queries and finds terms inside list items", async () => {
      const id = `page-${RUN}-fts`;
      await insertPage(
        makePage({
          id,
          slug: "fts",
          path: ["fts"],
          title: "C++ and AT&T guide",
          summary: "20% off enrollment",
          blocks: [
            { blockId: "b1", type: "list", style: "unordered", items: ["apply with a zylophonics token"] },
          ] as unknown as ContentBlock[],
        }),
      );

      // KI-1: punctuation queries must return results, never a 500.
      for (const query of ["C++", "AT&T", "i-20", "20% off"]) {
        await expect(searchKb(KB_ID, query, true)).resolves.toBeDefined();
      }

      // A term that exists only in a list item is indexed and found.
      const results = await searchKb(KB_ID, "zylophonics", true);
      expect(results.some((result) => result.id === id)).toBe(true);
    });

    it("never leaks a public page under a staff ancestor into public search", async () => {
      const parentId = `page-${RUN}-vault`;
      const childId = `page-${RUN}-memo`;
      await insertPage(
        makePage({ id: parentId, slug: "vault", path: ["vault"], title: "Vault", visibility: "staff" }),
      );
      await insertPage(
        makePage({
          id: childId,
          slug: "memo",
          path: ["vault", "memo"],
          title: "Memo",
          visibility: "public",
          blocks: [
            { blockId: "b1", type: "paragraph", text: "internal qwertzuiop notice" },
          ] as unknown as ContentBlock[],
        }),
      );

      // Staff search (includeStaff=true) finds the published public child.
      const staffResults = await searchKb(KB_ID, "qwertzuiop", true);
      expect(staffResults.some((result) => result.id === childId)).toBe(true);

      // Public search (includeStaff=false) must NOT, because an ancestor is staff.
      const publicResults = await searchKb(KB_ID, "qwertzuiop", false);
      expect(publicResults.some((result) => result.id === childId)).toBe(false);
    });
  });

  describe("video assets (KI-2 model)", () => {
    it("persists video provider/id/url in dedicated columns and resolves a delivery URL", async () => {
      const asset = await createManagedAsset({
        homeKbId: KB_ID,
        assetType: "video",
        title: `Intro Video ${RUN}`,
        description: "Orientation",
        body: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        mimeType: "video/x-youtube",
        originalFilename: "youtube-link",
        fileSizeBytes: 0,
        videoProvider: "youtube",
        videoExternalId: "dQw4w9WgXcQ",
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });

      // Round-trips out of Postgres via the dedicated columns (not overloaded body).
      const delivered = await getAssetForDelivery(KB_ID, asset.slug);
      expect(delivered).not.toBeNull();
      expect(delivered?.assetType).toBe("video");
      expect(delivered?.videoProvider).toBe("youtube");
      expect(delivered?.videoExternalId).toBe("dQw4w9WgXcQ");

      // The stable file route would redirect here instead of streaming URL text.
      expect(videoDeliveryUrl(delivered!)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });
  });

  describe("asset metadata (KI-2)", () => {
    it("stores default alt text separately from the human description", async () => {
      const asset = await createManagedAsset({
        homeKbId: KB_ID,
        assetType: "image",
        title: `Diagram ${RUN}`,
        description: "Human-facing description",
        body: "data:image/png;base64,iVBORw0KGgo=",
        mimeType: "image/png",
        originalFilename: "diagram.png",
        fileSizeBytes: 10,
      });

      await updateAssetAltText(asset.id, "Screen-reader alt text");

      const reloaded = await getAssetForDelivery(KB_ID, asset.slug);
      expect(reloaded?.altText).toBe("Screen-reader alt text");
      // The human description must be untouched (not overloaded by the alt text).
      expect(reloaded?.description).toBe("Human-facing description");
    });
  });

  describe("page status updates (KI-2)", () => {
    it("changes only the status and never rewrites content columns", async () => {
      const id = `page-${RUN}-status`;
      await insertPage(
        makePage({ id, slug: "status", path: ["status"], title: "Keep this title", status: "draft" }),
      );

      await updatePageStatus(id, "published");

      const sql = getSql();
      const rows = (await sql`SELECT title, status FROM kb_pages WHERE id = ${id}`) as unknown as Array<{
        title: string;
        status: string;
      }>;
      expect(rows[0]?.status).toBe("published");
      expect(rows[0]?.title).toBe("Keep this title");
    });
  });

  describe("editor KB scoping", () => {
    it("limits an editor's access to their assigned KBs (owners/admins are KB-wide)", async () => {
      const editorId = `user-${RUN}-editor`;
      const editorEmail = `${RUN}-editor@test.edu`;
      const otherKbId = `kb-${RUN}-other`;
      const sql = getSql();
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
        VALUES (${otherKbId}, ${otherKbId}, 'Other KB', '', 'published', '2026-01-01')
      `;

      const now = new Date().toISOString();
      await insertUser({
        id: editorId,
        email: editorEmail,
        fullName: "Test Editor",
        passwordHash: "salt:hash",
        role: "editor",
        createdAt: now,
        updatedAt: now,
      });
      await replaceUserAssignments(editorId, [KB_ID]);

      const editorSession: AdminSession = {
        userId: editorId,
        email: editorEmail,
        role: "editor",
        source: "managed",
        expiresAt: Date.now() + 1_000_000,
        version: now,
      };

      try {
        expect(await canAccessKb(editorSession, KB_ID)).toBe(true);
        expect(await canAccessKb(editorSession, otherKbId)).toBe(false);

        const ownerSession: AdminSession = { ...editorSession, role: "owner" };
        expect(await canAccessKb(ownerSession, otherKbId)).toBe(true);
      } finally {
        await deleteUser(editorId);
        await deleteKb(otherKbId);
      }
    });
  });
});
