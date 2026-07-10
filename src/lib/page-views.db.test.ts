import { describe, expect, it } from "vitest";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { foldOldPageViews, recordPageView } from "@/lib/page-views";

describe.skipIf(!isDatabaseEnabled())("page view analytics live DB", () => {
  it("increments daily counts and folds rows older than 90 days into monthly rows", async () => {
    await ensureSchema();
    const sql = getSql();
    const id = crypto.randomUUID();
    const kbId = `test-views-kb-${id}`;
    const oldKbId = `test-views-old-kb-${id}`;
    const pageId = `test-views-page-${id}`;

    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
        VALUES (${kbId}, ${`test-views-${id}`}, 'Views Test', 'Views test KB', 'published', '2026-07-10')
      `;
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
        VALUES (${oldKbId}, ${`test-views-old-${id}`}, 'Old Views Test', 'Old views test KB', 'published', '2026-07-10')
      `;
      await sql`
        INSERT INTO kb_pages (
          id, kb_id, slug, path, sort_order, title, summary, status, visibility,
          owner_label, contact_email, last_reviewed_date, updated_display_date,
          blocks, related_page_ids, related_asset_ids, show_toc, toc_depth,
          show_summary, show_print_button
        ) VALUES (
          ${pageId}, ${kbId}, 'views', 'views', 0, 'Views', '', 'published', 'public',
          'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, 3,
          true, true
        )
      `;

      await recordPageView({ kbId, pageId, viewedAt: new Date("2026-07-10T12:00:00.000Z") });
      await recordPageView({ kbId, pageId, viewedAt: new Date("2026-07-10T13:00:00.000Z") });

      const currentRows = (await sql`
        SELECT view_count FROM kb_page_views WHERE page_id = ${pageId} AND day = '2026-07-10'::date
      `) as unknown as Array<{ view_count: number }>;
      expect(currentRows[0]?.view_count).toBe(2);

      await sql`
        INSERT INTO kb_page_views (page_id, kb_id, day, view_count)
        VALUES
          (${pageId}, ${kbId}, '2026-02-01'::date, 4),
          (${pageId}, ${kbId}, '2026-02-03'::date, 2),
          (${pageId}, ${kbId}, '2026-02-04'::date, 3),
          (${pageId}, ${kbId}, '2026-03-02'::date, 2),
          (${pageId}, ${oldKbId}, '2026-03-03'::date, 5)
      `;
      const folded = await foldOldPageViews(new Date("2026-07-10T12:00:00.000Z"));
      expect(folded).toBe(2);

      const foldedRows = (await sql`
        SELECT day::text, view_count
        FROM kb_page_views
        WHERE page_id = ${pageId}
        ORDER BY day
      `) as unknown as Array<{ day: string; view_count: number }>;
      expect(foldedRows).toEqual([
        { day: "2026-02-01", view_count: 9 },
        { day: "2026-03-01", view_count: 7 },
        { day: "2026-07-10", view_count: 2 },
      ]);

      expect(await foldOldPageViews(new Date("2026-07-10T12:00:00.000Z"))).toBe(0);
      const rerunRows = (await sql`
        SELECT day::text, view_count
        FROM kb_page_views
        WHERE page_id = ${pageId}
        ORDER BY day
      `) as unknown as Array<{ day: string; view_count: number }>;
      expect(rerunRows).toEqual(foldedRows);
    } finally {
      await sql`DELETE FROM kb_page_views WHERE kb_id IN (${kbId}, ${oldKbId})`;
      await sql`DELETE FROM kb_pages WHERE kb_id = ${kbId}`;
      await sql`DELETE FROM knowledge_bases WHERE id IN (${kbId}, ${oldKbId})`;
    }
  });
});
