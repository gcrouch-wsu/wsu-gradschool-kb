import { describe, expect, it } from "vitest";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { searchKb } from "@/lib/kb-store";

describe.skipIf(!isDatabaseEnabled())("reader search result types live DB", () => {
  it("excludes image assets from FTS results while keeping documents", async () => {
    await ensureSchema();
    const sql = getSql();
    const id = crypto.randomUUID();
    const kbId = `test-asset-search-${id}`;
    const token = `zetaquery${id.replace(/-/g, "").slice(0, 8)}`;
    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, visibility, updated_on)
        VALUES (${kbId}, ${kbId}, 'Asset Search KB', '', 'published', 'public', '2026-07-18')
      `;
      await sql`
        INSERT INTO kb_assets (
          id, home_kb_id, slug, title, description, asset_type, mime_type, file_size_bytes,
          status, owner_label, last_reviewed_date, updated_display_date, version_id, body
        ) VALUES
          (
            ${`asset-img-${id}`}, ${kbId}, ${`img-${token}`}, ${`Image ${token}`}, 'A screenshot',
            'image', 'image/png', 10, 'active', 'Graduate School', '2026-01-01', '2026-01-01',
            ${`v-img-${id}`}, ''
          ),
          (
            ${`asset-doc-${id}`}, ${kbId}, ${`doc-${token}`}, ${`Document ${token}`}, 'A form',
            'document', 'application/pdf', 10, 'active', 'Graduate School', '2026-01-01', '2026-01-01',
            ${`v-doc-${id}`}, ''
          )
      `;
      const results = await searchKb(kbId, token, true, { staffKbIds: null });
      const assetTitles = results.filter((result) => result.type === "asset").map((result) => result.title);
      expect(assetTitles).toContain(`Document ${token}`);
      expect(assetTitles).not.toContain(`Image ${token}`);
    } finally {
      await sql`DELETE FROM kb_assets WHERE home_kb_id = ${kbId}`;
      await sql`DELETE FROM knowledge_bases WHERE id = ${kbId}`;
    }
  });
});
