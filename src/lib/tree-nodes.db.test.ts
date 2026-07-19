import { describe, expect, it } from "vitest";
import { ensureSchema, getSql, isDatabaseEnabled, loadPageById } from "@/lib/db";
import { searchKb } from "@/lib/kb-store";

describe.skipIf(!isDatabaseEnabled())("tree node kinds live DB", () => {
  it("maps node kinds and keeps groups/links out of FTS results", async () => {
    await ensureSchema();
    const sql = getSql();
    const id = crypto.randomUUID();
    const kbId = `test-tree-nodes-${id}`;
    const token = `nodequery${id.replace(/-/g, "").slice(0, 8)}`;
    const groupId = `page-group-${id}`;
    const linkId = `page-link-${id}`;
    const childId = `page-child-${id}`;
    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, visibility, updated_on)
        VALUES (${kbId}, ${kbId}, 'Tree Nodes KB', '', 'published', 'public', '2026-07-18')
      `;
      await sql`
        INSERT INTO kb_pages (
          id, kb_id, slug, path, sort_order, title, summary, status, visibility,
          owner_label, contact_email, last_reviewed_date, updated_display_date,
          blocks, related_page_ids, related_asset_ids, show_toc, toc_depth,
          show_summary, show_print_button, node_kind, link_url, link_new_tab
        ) VALUES
          (
            ${groupId}, ${kbId}, 'grouping', 'grouping', 10,
            ${`Group ${token}`}, '', 'published', 'public',
            'GS', 'g@wsu.edu', '2026-01-01', '2026-01-01',
            '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, 3, true, true, 'group', '', false
          ),
          (
            ${childId}, ${kbId}, 'child', 'grouping/child', 10,
            ${`Page ${token}`}, '', 'published', 'public',
            'GS', 'g@wsu.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([{ blockId: "p1", type: "paragraph", text: `Body ${token}`, html: `Body ${token}` }])}::jsonb,
            '[]'::jsonb, '[]'::jsonb, true, 3, true, true, 'page', '', false
          ),
          (
            ${linkId}, ${kbId}, 'ext', 'ext', 20,
            ${`Link ${token}`}, '', 'published', 'public',
            'GS', 'g@wsu.edu', '2026-01-01', '2026-01-01',
            '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, 3, true, true,
            'link', 'https://gradschool.wsu.edu/', true
          )
      `;

      const group = await loadPageById(groupId);
      expect(group).toMatchObject({ nodeKind: "group" });
      const link = await loadPageById(linkId);
      expect(link).toMatchObject({
        nodeKind: "link",
        linkUrl: "https://gradschool.wsu.edu/",
        linkNewTab: true,
      });

      const results = await searchKb(kbId, token, true, { staffKbIds: null });
      const titles = results.filter((result) => result.type === "page").map((result) => result.title);
      expect(titles).toContain(`Page ${token}`);
      expect(titles).not.toContain(`Group ${token}`);
      expect(titles).not.toContain(`Link ${token}`);
    } finally {
      await sql`DELETE FROM kb_pages WHERE kb_id = ${kbId}`;
      await sql`DELETE FROM knowledge_bases WHERE id = ${kbId}`;
    }
  });
});
