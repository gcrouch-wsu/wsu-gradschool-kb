import { describe, expect, it } from "vitest";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { listPagesDueForReview } from "@/lib/review-digest";

describe.skipIf(!isDatabaseEnabled())("review digest live-DB query", () => {
  it("returns only pages due within the review window", async () => {
    await ensureSchema();
    const sql = getSql();
    const id = crypto.randomUUID();
    const kbId = `test-review-kb-${id}`;
    const slug = `test-review-${id}`;
    const pageIds = {
      past: `test-review-past-${id}`,
      soon: `test-review-soon-${id}`,
      future: `test-review-future-${id}`,
      archived: `test-review-archived-${id}`,
      invalid: `test-review-invalid-${id}`,
    };

    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
        VALUES (${kbId}, ${slug}, 'Review Query Test', 'Review query test KB', 'published', '2026-07-10')
      `;
      for (const [key, pageId] of Object.entries(pageIds)) {
        const nextReviewDate =
          key === "past"
            ? "2026-07-01"
            : key === "soon"
              ? "2026-07-24"
              : key === "future"
                ? "2026-07-25"
                : key === "invalid"
                  ? "not-a-date"
                  : "2026-07-10";
        await sql`
          INSERT INTO kb_pages (
            id, kb_id, slug, path, sort_order, title, summary, status, visibility,
            owner_label, contact_email, last_reviewed_date, updated_display_date,
            blocks, related_page_ids, related_asset_ids, show_toc, toc_depth,
            show_summary, show_print_button, next_review_date
          ) VALUES (
            ${pageId}, ${kbId}, ${key}, ${key}, 0, ${key}, '', ${key === "archived" ? "archived" : "published"}, 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, 3,
            true, true, ${nextReviewDate}
          )
        `;
      }

      const pages = await listPagesDueForReview(new Date("2026-07-10T12:00:00.000Z"));
      const testPageIds = pages.filter((page) => page.kbId === kbId).map((page) => page.pageId);
      expect(testPageIds).toEqual([pageIds.past, pageIds.soon]);
    } finally {
      await sql`DELETE FROM kb_pages WHERE kb_id = ${kbId}`;
      await sql`DELETE FROM knowledge_bases WHERE id = ${kbId}`;
    }
  });
});
