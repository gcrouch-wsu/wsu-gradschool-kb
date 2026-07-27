import { isDatabaseEnabled, getSql, ensureSchema } from "@/lib/db";
import type { PageRevisionSnapshot, PageServerDraft } from "@/lib/types";

export async function getPageServerDraft(pageId: string): Promise<PageServerDraft | null> {
  if (!isDatabaseEnabled()) {
    return null;
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT page_id, author_user_id, snapshot, updated_at
    FROM page_server_drafts
    WHERE page_id = ${pageId}
    LIMIT 1
  `) as unknown as Array<{
    page_id: string;
    author_user_id: string;
    snapshot: PageRevisionSnapshot;
    updated_at: string;
  }>;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    pageId: row.page_id,
    authorUserId: row.author_user_id,
    snapshot: row.snapshot,
    updatedAt: row.updated_at,
  };
}

export async function savePageServerDraft(
  pageId: string,
  authorUserId: string,
  snapshot: PageRevisionSnapshot,
): Promise<PageServerDraft> {
  const updatedAt = new Date().toISOString();
  if (!isDatabaseEnabled()) {
    return { pageId, authorUserId, snapshot, updatedAt };
  }
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO page_server_drafts (page_id, author_user_id, snapshot, updated_at)
    VALUES (${pageId}, ${authorUserId}, ${JSON.stringify(snapshot)}, ${updatedAt})
    ON CONFLICT (page_id) DO UPDATE
    SET author_user_id = EXCLUDED.author_user_id,
        snapshot = EXCLUDED.snapshot,
        updated_at = EXCLUDED.updated_at
  `;
  return { pageId, authorUserId, snapshot, updatedAt };
}

export async function deletePageServerDraft(pageId: string): Promise<void> {
  if (!isDatabaseEnabled()) {
    return;
  }
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM page_server_drafts WHERE page_id = ${pageId}`;
}
