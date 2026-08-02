import { isDatabaseEnabled, getSql, ensureSchema } from "@/lib/db";
import type { PageRevisionSnapshot, PageServerDraft } from "@/lib/types";

export async function getPageServerDraft(pageId: string, authorUserId: string): Promise<PageServerDraft | null> {
  if (!isDatabaseEnabled()) {
    return null;
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT page_id, author_user_id, snapshot, updated_at
    FROM page_server_drafts
    WHERE page_id = ${pageId} AND author_user_id = ${authorUserId}
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
    ON CONFLICT (page_id, author_user_id) DO UPDATE
    SET snapshot = EXCLUDED.snapshot,
        updated_at = EXCLUDED.updated_at
  `;
  return { pageId, authorUserId, snapshot, updatedAt };
}

export async function deletePageServerDraft(pageId: string, authorUserId: string): Promise<void> {
  if (!isDatabaseEnabled()) {
    return;
  }
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM page_server_drafts WHERE page_id = ${pageId} AND author_user_id = ${authorUserId}`;
}

/** Drop abandoned server drafts older than `olderThanDays` (default 30). */
export async function cleanupPageServerDrafts(olderThanDays = 30): Promise<number> {
  if (!isDatabaseEnabled()) {
    return 0;
  }
  await ensureSchema();
  const sql = getSql();
  const days = Math.max(1, Math.round(olderThanDays));
  const result = await sql`
    DELETE FROM page_server_drafts
    WHERE updated_at < now() - (${days}::int * interval '1 day')
    RETURNING page_id
  `;
  return result.length;
}

/**
 * Has the page been saved since this draft was written?
 *
 * Compares the draft's `updated_at` against the newest revision, which is written on every
 * save. This is deliberately server-side and timestamp-based: the earlier client-side attempt
 * hashed the editor's snapshot, and that hash changes meaning after an in-session save (the
 * saved snapshot becomes the editor's normalized content rather than the server's), so it
 * reported "the page has been saved since" on drafts that were perfectly current.
 *
 * `kb_pages` only carries a day-granularity display date, so revisions are the only precise
 * record of when a save happened. Returns null when the answer is unknown — no revisions yet —
 * so callers can say "unknown" rather than implying the draft is current.
 */
export async function pageSavedAfterDraft(pageId: string, draftUpdatedAt: string): Promise<boolean | null> {
  if (!isDatabaseEnabled()) {
    return null;
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT created_at
    FROM kb_page_revisions
    WHERE page_id = ${pageId}
    ORDER BY created_at DESC
    LIMIT 1
  `) as unknown as Array<{ created_at: string }>;
  const latest = rows[0]?.created_at;
  if (!latest) {
    return null;
  }
  return new Date(latest).getTime() > new Date(draftUpdatedAt).getTime();
}
