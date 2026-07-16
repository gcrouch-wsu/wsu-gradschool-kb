import { describe, expect, it } from "vitest";
import type { AdminSession } from "@/lib/auth";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { checkExcerptSourceForPublish, resolveExcerptForRead } from "@/lib/excerpts";
import { getExcerptReferencesToPage } from "@/lib/kb-store";

function viewerSession(userId: string): AdminSession {
  return {
    userId,
    email: `${userId}@example.edu`,
    role: "viewer",
    source: "managed",
    expiresAt: Date.now() + 60_000,
    version: "test",
  };
}

describe.skipIf(!isDatabaseEnabled())("cross-page excerpts live DB", () => {
  it("resolves, gates, probes references, and flags unpublished sources", async () => {
    await ensureSchema();
    const sql = getSql();
    const id = crypto.randomUUID();
    const unique = id.replace(/-/g, "");
    const publicKb = `test-excerpt-public-${id}`;
    const privateKb = `test-excerpt-private-${id}`;
    const sourcePage = `test-excerpt-source-${id}`;
    const draftSource = `test-excerpt-draft-${id}`;
    const privateSource = `test-excerpt-priv-src-${id}`;
    const targetPage = `test-excerpt-target-${id}`;
    const decoyPage = `test-excerpt-decoy-${id}`;
    const viewerId = `test-excerpt-viewer-${id}`;

    const sourceBlocks = [
      { blockId: "intro", type: "paragraph", text: `Intro ${unique}`, html: `Intro ${unique}` },
      { blockId: "sec-a", type: "heading", level: 2, text: "Section A" },
      { blockId: "sec-a-body", type: "paragraph", text: `Section A body ${unique}`, html: `Section A body ${unique}` },
      { blockId: "sec-b", type: "heading", level: 2, text: "Section B" },
      { blockId: "sec-b-body", type: "paragraph", text: "Section B body", html: "Section B body" },
    ];

    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, visibility, updated_on)
        VALUES
          (${publicKb}, ${publicKb}, 'Excerpt Public KB', '', 'published', 'public', '2026-07-16'),
          (${privateKb}, ${privateKb}, 'Excerpt Private KB', '', 'published', 'private', '2026-07-16')
      `;
      await sql`
        INSERT INTO users (id, email, full_name, password_hash, role, created_at, updated_at)
        VALUES (${viewerId}, ${`${viewerId}@example.edu`}, 'Excerpt Viewer', 'unused', 'viewer', '2026-07-16', '2026-07-16')
      `;
      await sql`
        INSERT INTO kb_user_assignments (kb_id, user_id) VALUES (${privateKb}, ${viewerId})
      `;
      await sql`
        INSERT INTO kb_pages (
          id, kb_id, slug, path, sort_order, title, summary, status, visibility,
          owner_label, contact_email, last_reviewed_date, updated_display_date,
          blocks, related_page_ids, related_asset_ids, show_toc, toc_depth,
          show_summary, show_print_button
        ) VALUES
          (
            ${sourcePage}, ${publicKb}, 'excerpt-source', 'excerpt-source', 10,
            ${`Excerpt Source ${unique}`}, 'Source summary', 'published', 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify(sourceBlocks)}::jsonb,
            '[]'::jsonb, '[]'::jsonb, true, 3, true, true
          ),
          (
            ${draftSource}, ${publicKb}, 'excerpt-draft', 'excerpt-draft', 20,
            ${`Excerpt Draft ${unique}`}, 'Draft summary', 'draft', 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([{ blockId: "p1", type: "paragraph", text: "Draft body", html: "Draft body" }])}::jsonb,
            '[]'::jsonb, '[]'::jsonb, true, 3, true, true
          ),
          (
            ${privateSource}, ${privateKb}, 'excerpt-priv', 'excerpt-priv', 10,
            ${`Excerpt Private ${unique}`}, 'Private summary', 'published', 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([{ blockId: "p1", type: "paragraph", text: "Private body", html: "Private body" }])}::jsonb,
            '[]'::jsonb, '[]'::jsonb, true, 3, true, true
          ),
          (
            ${targetPage}, ${publicKb}, 'excerpt-target', 'excerpt-target', 30,
            ${`Excerpt Target ${unique}`}, 'Target summary', 'published', 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([
              { blockId: "e1", type: "excerpt", sourcePageId: sourcePage, sourceHeadingBlockId: "sec-a" },
            ])}::jsonb,
            '[]'::jsonb, '[]'::jsonb, true, 3, true, true
          ),
          (
            ${decoyPage}, ${publicKb}, 'excerpt-decoy', 'excerpt-decoy', 40,
            ${`Excerpt Decoy ${unique}`}, 'Mentions the source id as plain text', 'published', 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([
              { blockId: "p1", type: "paragraph", text: `See ${sourcePage} for details`, html: `See ${sourcePage} for details` },
            ])}::jsonb,
            '[]'::jsonb, '[]'::jsonb, true, 3, true, true
          )
      `;

      // Anonymous readers resolve a published public section with source link.
      const anonymous = await resolveExcerptForRead(
        { sourcePageId: sourcePage, sourceHeadingBlockId: "sec-a" },
        null,
      );
      expect(anonymous.state).toBe("ok");
      if (anonymous.state === "ok") {
        expect(anonymous.sectionTitle).toBe("Section A");
        expect(anonymous.sourceHref).toBe(`/kb/${publicKb}/excerpt-source#sec-a`);
        expect(anonymous.blocks.map((block) => block.blockId)).toEqual(["sec-a-body"]);
      }

      // Draft sources and private-KB sources are unavailable to anonymous
      // readers; the assigned viewer can read the private source.
      expect((await resolveExcerptForRead({ sourcePageId: draftSource }, null)).state).toBe("unavailable");
      expect((await resolveExcerptForRead({ sourcePageId: privateSource }, null)).state).toBe("unavailable");
      expect(
        (await resolveExcerptForRead({ sourcePageId: privateSource }, viewerSession(viewerId))).state,
      ).toBe("ok");

      // The reference probe finds the real excerpt and ignores the decoy that
      // only mentions the source id in paragraph text.
      const refs = await getExcerptReferencesToPage(sourcePage);
      expect(refs.map((ref) => ref.pageId)).toEqual([targetPage]);
      expect(await getExcerptReferencesToPage(draftSource)).toEqual([]);

      // The publish-gate checker names the specific failure.
      expect(await checkExcerptSourceForPublish({ sourcePageId: sourcePage, sourceHeadingBlockId: "sec-a" })).toBe("ok");
      expect(await checkExcerptSourceForPublish({ sourcePageId: draftSource })).toBe("unpublished");
      expect(await checkExcerptSourceForPublish({ sourcePageId: `missing-${id}` })).toBe("missing");
      expect(
        await checkExcerptSourceForPublish({ sourcePageId: sourcePage, sourceHeadingBlockId: "gone" }),
      ).toBe("section_missing");
    } finally {
      await sql`DELETE FROM kb_page_revisions WHERE kb_id IN (${publicKb}, ${privateKb})`;
      await sql`DELETE FROM kb_pages WHERE kb_id IN (${publicKb}, ${privateKb})`;
      await sql`DELETE FROM kb_user_assignments WHERE user_id = ${viewerId}`;
      await sql`DELETE FROM users WHERE id = ${viewerId}`;
      await sql`DELETE FROM knowledge_bases WHERE id IN (${publicKb}, ${privateKb})`;
    }
  });
});
