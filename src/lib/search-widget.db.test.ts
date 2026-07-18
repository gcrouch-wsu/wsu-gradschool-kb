import { describe, expect, it } from "vitest";
import { ensureSchema, getSql, isDatabaseEnabled, loadKnowledgeBaseByIdFromDb } from "@/lib/db";

describe.skipIf(!isDatabaseEnabled())("KB search widget columns live DB", () => {
  it("persists and maps the search widget settings", async () => {
    await ensureSchema();
    const sql = getSql();
    const kbId = `test-search-widget-${crypto.randomUUID()}`;
    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, visibility, updated_on)
        VALUES (${kbId}, ${kbId}, 'Search Widget KB', '', 'published', 'public', '2026-07-18')
      `;

      const defaults = await loadKnowledgeBaseByIdFromDb(kbId);
      expect(defaults).toMatchObject({
        searchWidgetEnabled: false,
        searchWidgetScope: "kb",
        searchWidgetLabel: "",
      });

      await sql`
        UPDATE knowledge_bases
        SET search_widget_enabled = TRUE, search_widget_scope = 'all', search_widget_label = 'Search everything'
        WHERE id = ${kbId}
      `;
      const configured = await loadKnowledgeBaseByIdFromDb(kbId);
      expect(configured).toMatchObject({
        searchWidgetEnabled: true,
        searchWidgetScope: "all",
        searchWidgetLabel: "Search everything",
      });
    } finally {
      await sql`DELETE FROM knowledge_bases WHERE id = ${kbId}`;
    }
  });
});
