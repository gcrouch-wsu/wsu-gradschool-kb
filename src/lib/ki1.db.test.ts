import { describe, expect, it, beforeAll } from "vitest";
import { getSql, ensureSchema, loadDatasetFromDb, tryAcquirePageLock } from "./db";
import {
  createPage,
  getKbBySlug,
  getPageByPath,
  publishDueDraftPages,
  searchKb,
  setKbShowPageNav,
  verifyPage,
} from "./kb-store";

describe("KI-1 live-DB integration", () => {
  const dbEnabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

  if (!dbEnabled) {
    it.skip("skipping live DB tests (DATABASE_URL not set)", () => {});
    return;
  }

  beforeAll(async () => {
    try {
      await ensureSchema();
    } catch (error) {
      console.error("FAILED TO ENSURE SCHEMA IN TEST:", error);
      throw error;
    }
  });

  it("can perform a full lifecycle with verify and search", async () => {
    const sql = getSql();
    
    // 1. Get or create a KB for testing
    let kb = await getKbBySlug("grad-school");
    let isTempKb = false;

    if (!kb) {
      // If seed data is missing, create a temp KB to allow the test to proceed
      const testId = `test-kb-${crypto.randomUUID()}`;
      const testSlug = testId;
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
        VALUES (${testId}, ${testSlug}, 'Test KB', 'Temp KB for CI', 'published', now())
      `;
      kb = await getKbBySlug(testSlug);
      isTempKb = true;
    }

    if (!kb) throw new Error("Could not find or create a test KB");

    const page = await createPage({
      kbId: kb.id,
      title: "DB Test Page",
      blocks: [{ type: "paragraph", blockId: "p1", text: "Verification test content.", html: "Verification test content." }],
      status: "published",
    });

    try {
      // Test 1: Search immediately
      const results = await searchKb(kb.id, "Verification", true);
      expect(results.some(r => r.id === page.id)).toBe(true);

      // Test 2: Verify the page
      const verifier = "tester@wsu.edu";
      const { verifiedAt, verifiedBy } = await verifyPage(page, verifier);
      
      expect(verifiedBy).toBe(verifier);
      expect(verifiedAt).toBeTruthy();

      // Test 3: Reload and check
      const reloaded = await getPageByPath(kb.id, page.path, true);
      
      // Neon driver returns TIMESTAMPTZ as Date objects, while in-memory/JSON returns strings.
      // Normalize both to ISO strings for comparison.
      const actual = new Date(reloaded?.verifiedAt || "").toISOString();
      const expected = new Date(verifiedAt).toISOString();
      expect(actual).toBe(expected);
      expect(reloaded?.verifiedBy).toBe(verifier);

      const dataset = await loadDatasetFromDb();
      const datasetPage = dataset.pages.find(
        (candidate) => candidate.kbId === kb.id && candidate.path.join("/") === page.path.join("/"),
      );
      expect(reloaded?.id).toBe(datasetPage?.id);
      expect(reloaded?.blocks).toEqual(datasetPage?.blocks);

    } finally {
      // Cleanup page (and its create-snapshot revision)
      await sql`DELETE FROM kb_page_revisions WHERE page_id = ${page.id}`;
      await sql`DELETE FROM kb_pages WHERE id = ${page.id}`;
      // Cleanup temp KB if we created it
      if (isTempKb) {
        await sql`DELETE FROM knowledge_bases WHERE id = ${kb.id}`;
      }
    }
  });

  // Previous/next links must stay off unless a KB opts in, so the column defaults to
  // FALSE and the round-trip has to preserve an explicit true.
  it("defaults showPageNav to false and round-trips an opt-in", async () => {
    const sql = getSql();
    const kbId = `kb-nav-${crypto.randomUUID()}`;
    const slug = `nav-${crypto.randomUUID().slice(0, 8)}`;
    await sql`
      INSERT INTO knowledge_bases (id, title, slug, description, status, visibility, updated_on)
      VALUES (${kbId}, ${"Nav Test"}, ${slug}, ${""}, ${"published"}, ${"public"}, ${"2026-01-01"})
    `;
    try {
      expect((await getKbBySlug(slug))?.showPageNav).toBe(false);

      await setKbShowPageNav(kbId, true);
      const [row] = (await sql`
        SELECT show_page_nav FROM knowledge_bases WHERE id = ${kbId}
      `) as unknown as Array<{ show_page_nav: boolean }>;
      expect(row.show_page_nav).toBe(true);

      await setKbShowPageNav(kbId, false);
      const [off] = (await sql`
        SELECT show_page_nav FROM knowledge_bases WHERE id = ${kbId}
      `) as unknown as Array<{ show_page_nav: boolean }>;
      expect(off.show_page_nav).toBe(false);
    } finally {
      await sql`DELETE FROM knowledge_bases WHERE id = ${kbId}`;
    }
  });

  it("does not return unreadable KB pages in public global search", async () => {
    const sql = getSql();
    const testId = `hidden-global-${crypto.randomUUID()}`;
    const uniqueTerm = testId.replace(/-/g, "");

    await sql`
      INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
      VALUES (${testId}, ${testId}, 'Hidden Global Search KB', 'Temp hidden KB for CI', 'draft', now())
    `;
    const page = await createPage({
      kbId: testId,
      title: `Hidden Global Search ${uniqueTerm}`,
      blocks: [
        {
          type: "paragraph",
          blockId: "p1",
          text: `Hidden global search content ${uniqueTerm}.`,
          html: `Hidden global search content ${uniqueTerm}.`,
        },
      ],
      status: "published",
    });

    try {
      const publicResults = await searchKb(undefined, uniqueTerm, false);
      expect(publicResults.some((result) => result.id === page.id)).toBe(false);

      const staffResults = await searchKb(undefined, uniqueTerm, true, {
        includeAllKbs: true,
        staffKbIds: null,
      });
      expect(staffResults.some((result) => result.id === page.id)).toBe(true);
    } finally {
      await sql`DELETE FROM kb_page_revisions WHERE page_id = ${page.id}`;
      await sql`DELETE FROM kb_pages WHERE id = ${page.id}`;
      await sql`DELETE FROM knowledge_bases WHERE id = ${testId}`;
    }
  });

  it("runs schema setup concurrently without duplicate migration side effects", async () => {
    const sql = getSql();

    await Promise.all([ensureSchema(), ensureSchema()]);

    const duplicateMigrations = await sql`
      SELECT id, COUNT(*)::int AS count
      FROM _schema_migrations
      GROUP BY id
      HAVING COUNT(*) > 1
    `;
    expect(duplicateMigrations).toHaveLength(0);

    const duplicateBaselineBackfills = await sql`
      SELECT page_id, COUNT(*)::int AS count
      FROM kb_page_revisions
      WHERE id LIKE 'revision-backfill-%'
      GROUP BY page_id
      HAVING COUNT(*) > 1
    `;
    expect(duplicateBaselineBackfills).toHaveLength(0);
  });

  // FB-41: the scheduled-publish cron holds no edit lock. It must therefore touch only
  // status/publish_at — a full-row rewrite would silently discard whatever the editor
  // holding the lock is working on.
  it("publishes a due page without clobbering a concurrent editor's locked draft", async () => {
    const sql = getSql();
    const testId = `test-kb-${crypto.randomUUID()}`;
    await sql`
      INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
      VALUES (${testId}, ${testId}, 'Scheduled Publish KB', 'Temp KB for CI', 'published', now())
    `;
    const kb = await getKbBySlug(testId);
    if (!kb) throw new Error("Could not create a test KB");

    const page = await createPage({
      kbId: kb.id,
      title: "Scheduled Publish Page",
      summary: "A page scheduled to publish.",
      ownerLabel: "Graduate School",
      contactEmail: "tester@wsu.edu",
      status: "draft",
      blocks: [
        { type: "paragraph", blockId: "p1", text: "Scheduled body.", html: "Scheduled body." },
      ],
    });

    try {
      await sql`
        UPDATE kb_pages
        SET last_reviewed_date = '2026-01-01', publish_at = now() - interval '1 minute'
        WHERE id = ${page.id}
      `;

      // Another editor opens the page and takes the lock, then the cron fires.
      expect(await tryAcquirePageLock(page.id, "other-editor@wsu.edu")).toBe(true);
      await sql`
        UPDATE kb_pages SET summary = 'Edit in progress by the lock holder.' WHERE id = ${page.id}
      `;

      const result = await publishDueDraftPages();
      expect(result.published).toContain(page.id);

      const rows = (await sql`
        SELECT status, publish_at, summary, locked_by FROM kb_pages WHERE id = ${page.id}
      `) as unknown as Array<{
        status: string;
        publish_at: string | null;
        summary: string;
        locked_by: string | null;
      }>;

      expect(rows[0].status).toBe("published");
      expect(rows[0].publish_at).toBeNull();
      // The cron must not have rolled back the lock holder's in-flight edit, nor
      // stolen/released their lock.
      expect(rows[0].summary).toBe("Edit in progress by the lock holder.");
      expect(rows[0].locked_by).toBe("other-editor@wsu.edu");
    } finally {
      await sql`DELETE FROM kb_page_revisions WHERE page_id = ${page.id}`;
      await sql`DELETE FROM kb_asset_usages WHERE page_id = ${page.id}`;
      await sql`DELETE FROM kb_pages WHERE id = ${page.id}`;
      await sql`DELETE FROM knowledge_bases WHERE id = ${testId}`;
    }
  });
});
