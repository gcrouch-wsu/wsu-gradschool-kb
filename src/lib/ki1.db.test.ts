import { describe, expect, it, beforeAll } from "vitest";
import {
  activateVersion,
  createDraftVersion,
  currentActiveVersion,
} from "./asset-lifecycle";
import { getSql, isDatabaseEnabled, ensureSchema } from "./db";
import {
  createPage,
  getKbBySlug,
  getPageByPath,
  searchKb,
  verifyPage,
} from "./kb-store";
import type { KbPage } from "./types";

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
    const kb = await getKbBySlug("grad-school");
    if (!kb) throw new Error("Seed KB missing");

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
      expect(reloaded?.verifiedAt).toBe(verifiedAt);
      expect(reloaded?.verifiedBy).toBe(verifier);

    } finally {
      // Cleanup is handled by the test runner usually, but we should be clean
      const sql = getSql();
      await sql`DELETE FROM kb_pages WHERE id = ${page.id}`;
    }
  });
});
