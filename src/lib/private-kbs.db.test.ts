import { describe, expect, it } from "vitest";
import { getKbReadAccess, type AdminSession } from "@/lib/auth";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { assetHasPublicPublishedUsage, getAssetById, getKbById, searchKb } from "@/lib/kb-store";

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

describe.skipIf(!isDatabaseEnabled())("private KB access matrix live DB", () => {
  it("scopes viewer reads, search, and public asset visibility", async () => {
    await ensureSchema();
    const sql = getSql();
    const id = crypto.randomUUID();
    const privateA = `test-private-a-${id}`;
    const privateB = `test-private-b-${id}`;
    const publicKb = `test-public-${id}`;
    const viewerId = `test-viewer-${id}`;
    const unique = id.replace(/-/g, "");
    const privatePageA = `test-private-page-a-${id}`;
    const privatePageB = `test-private-page-b-${id}`;
    const publicPage = `test-public-page-${id}`;
    const staffPage = `test-staff-page-${id}`;
    const privateAsset = `test-private-asset-${id}`;
    const publicAsset = `test-public-asset-${id}`;
    const staffAsset = `test-staff-asset-${id}`;

    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, visibility, updated_on)
        VALUES
          (${privateA}, ${privateA}, 'Private A', '', 'published', 'private', '2026-07-10'),
          (${privateB}, ${privateB}, 'Private B', '', 'published', 'private', '2026-07-10'),
          (${publicKb}, ${publicKb}, 'Public KB', '', 'published', 'public', '2026-07-10')
      `;
      await sql`
        INSERT INTO users (id, email, full_name, password_hash, role, created_at, updated_at)
        VALUES (${viewerId}, ${`${viewerId}@example.edu`}, 'Test Viewer', 'unused', 'viewer', '2026-07-10', '2026-07-10')
      `;
      await sql`
        INSERT INTO kb_user_assignments (kb_id, user_id)
        VALUES (${privateA}, ${viewerId})
      `;
      await sql`
        INSERT INTO kb_assets (
          id, home_kb_id, slug, title, description, asset_type, mime_type, file_size_bytes,
          status, owner_label, last_reviewed_date, updated_display_date, version_id, body
        ) VALUES
          (
            ${privateAsset}, ${privateA}, ${`private-asset-${unique}`}, ${`Private Asset ${unique}`},
            'Private asset search target', 'document', 'text/plain', 10,
            'active', 'Graduate School', '2026-01-01', '2026-01-01', ${`version-${privateAsset}`}, 'private'
          ),
          (
            ${publicAsset}, ${publicKb}, ${`public-asset-${unique}`}, ${`Public Asset ${unique}`},
            'Public asset search target', 'document', 'text/plain', 10,
            'active', 'Graduate School', '2026-01-01', '2026-01-01', ${`version-${publicAsset}`}, 'public'
          ),
          (
            ${staffAsset}, ${publicKb}, ${`staff-asset-${unique}`}, ${`Staff Asset ${unique}`},
            'Staff asset search target', 'document', 'text/plain', 10,
            'active', 'Graduate School', '2026-01-01', '2026-01-01', ${`version-${staffAsset}`}, 'staff'
          )
      `;
      await sql`
        INSERT INTO kb_pages (
          id, kb_id, slug, path, sort_order, title, summary, status, visibility,
          owner_label, contact_email, last_reviewed_date, updated_display_date,
          blocks, related_page_ids, related_asset_ids, show_toc, toc_depth,
          show_summary, show_print_button
        ) VALUES
          (
            ${privatePageA}, ${privateA}, 'private-a', 'private-a', 10,
            ${`Private A ${unique}`}, 'Private A summary', 'published', 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([{ blockId: "p1", type: "paragraph", text: `Private A ${unique}`, html: `Private A ${unique}` }])}::jsonb,
            '[]'::jsonb, ${JSON.stringify([privateAsset])}::jsonb, true, 3, true, true
          ),
          (
            ${privatePageB}, ${privateB}, 'private-b', 'private-b', 10,
            ${`Private B ${unique}`}, 'Private B summary', 'published', 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([{ blockId: "p1", type: "paragraph", text: `Private B ${unique}`, html: `Private B ${unique}` }])}::jsonb,
            '[]'::jsonb, '[]'::jsonb, true, 3, true, true
          ),
          (
            ${publicPage}, ${publicKb}, 'public-page', 'public-page', 10,
            ${`Public Page ${unique}`}, 'Public summary', 'published', 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([{ blockId: "p1", type: "asset_link", assetId: publicAsset }])}::jsonb,
            '[]'::jsonb, ${JSON.stringify([publicAsset])}::jsonb, true, 3, true, true
          ),
          (
            ${staffPage}, ${publicKb}, 'staff-page', 'staff-page', 20,
            ${`Staff Page ${unique}`}, 'Staff summary', 'published', 'staff',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            ${JSON.stringify([{ blockId: "p1", type: "asset_link", assetId: staffAsset }])}::jsonb,
            '[]'::jsonb, ${JSON.stringify([staffAsset])}::jsonb, true, 3, true, true
          )
      `;

      const [kbA, kbB] = await Promise.all([getKbById(privateA), getKbById(privateB)]);
      expect(await getKbReadAccess(null, kbA!)).toMatchObject({ canRead: false });
      expect(await getKbReadAccess(viewerSession(viewerId), kbA!)).toMatchObject({
        canRead: true,
        canReadStaffContent: false,
      });
      expect(await getKbReadAccess(viewerSession(viewerId), kbB!)).toMatchObject({ canRead: false });

      const anonymousPrivate = await searchKb(undefined, `Private A ${unique}`, false, {
        readableKbIds: [publicKb],
        staffKbIds: [],
      });
      expect(anonymousPrivate.some((result) => result.kbId === privateA)).toBe(false);

      const viewerPrivate = await searchKb(undefined, `Private A ${unique}`, false, {
        readableKbIds: [publicKb, privateA],
        staffKbIds: [],
      });
      expect(viewerPrivate.some((result) => result.id === privatePageA)).toBe(true);
      expect(viewerPrivate.some((result) => result.id === privatePageB)).toBe(false);

      const publicAssetRecord = await getAssetById(publicAsset);
      const staffAssetRecord = await getAssetById(staffAsset);
      expect(publicAssetRecord).not.toBeNull();
      expect(staffAssetRecord).not.toBeNull();
      await expect(assetHasPublicPublishedUsage(publicAssetRecord!)).resolves.toBe(true);
      await expect(assetHasPublicPublishedUsage(staffAssetRecord!)).resolves.toBe(false);

      const anonymousStaffAsset = await searchKb(undefined, `Staff Asset ${unique}`, false, {
        readableKbIds: [publicKb],
        staffKbIds: [],
      });
      expect(anonymousStaffAsset.some((result) => result.id === staffAsset)).toBe(false);

      const staffScopedAsset = await searchKb(undefined, `Staff Asset ${unique}`, true, {
        readableKbIds: [publicKb],
        staffKbIds: [publicKb],
      });
      expect(staffScopedAsset.some((result) => result.id === staffAsset)).toBe(true);
    } finally {
      await sql`DELETE FROM kb_page_revisions WHERE kb_id IN (${privateA}, ${privateB}, ${publicKb})`;
      await sql`DELETE FROM kb_pages WHERE kb_id IN (${privateA}, ${privateB}, ${publicKb})`;
      await sql`DELETE FROM kb_assets WHERE home_kb_id IN (${privateA}, ${privateB}, ${publicKb})`;
      await sql`DELETE FROM kb_user_assignments WHERE user_id = ${viewerId}`;
      await sql`DELETE FROM users WHERE id = ${viewerId}`;
      await sql`DELETE FROM knowledge_bases WHERE id IN (${privateA}, ${privateB}, ${publicKb})`;
    }
  });
});
