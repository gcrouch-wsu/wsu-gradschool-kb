import { describe, expect, it, beforeAll } from "vitest";
import { getSql, ensureSchema } from "./db";
import {
  createPage,
  getKbBySlug,
  getPageByPath,
  searchKb,
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

    } finally {
      // Cleanup page
      await sql`DELETE FROM kb_pages WHERE id = ${page.id}`;
      // Cleanup temp KB if we created it
      if (isTempKb) {
        await sql`DELETE FROM knowledge_bases WHERE id = ${kb.id}`;
      }
    }
  });
});
