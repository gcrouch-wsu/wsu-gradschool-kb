import { isDatabaseEnabled, getSql, ensureSchema } from "@/lib/db";

export interface PageFeedbackAggregate {
  pageId: string;
  kbId: string;
  pageTitle: string;
  pagePath: string;
  helpful: number;
  notHelpful: number;
  withComment: number;
  lastAt: string | null;
}

export async function listPageFeedbackAggregates(
  allowedKbIds: string[] | null = null,
  limit = 40,
): Promise<PageFeedbackAggregate[]> {
  if (!isDatabaseEnabled()) {
    return [];
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      f.page_id AS page_id,
      f.kb_id AS kb_id,
      COALESCE(p.title, f.page_id) AS page_title,
      COALESCE(array_to_string(p.path, '/'), '') AS page_path,
      COUNT(*) FILTER (WHERE f.helpful) AS helpful,
      COUNT(*) FILTER (WHERE NOT f.helpful) AS not_helpful,
      COUNT(*) FILTER (WHERE length(trim(f.comment)) > 0) AS with_comment,
      MAX(f.created_at) AS last_at
    FROM kb_page_feedback f
    LEFT JOIN kb_pages p ON p.id = f.page_id
    GROUP BY f.page_id, f.kb_id, p.title, p.path
    ORDER BY MAX(f.created_at) DESC
    LIMIT ${limit}
  `) as unknown as Array<{
    page_id: string;
    kb_id: string;
    page_title: string;
    page_path: string;
    helpful: number | string;
    not_helpful: number | string;
    with_comment: number | string;
    last_at: string | null;
  }>;

  const allowed = allowedKbIds === null ? null : new Set(allowedKbIds);
  return rows
    .filter((row) => (allowed === null ? true : allowed.has(row.kb_id)))
    .map((row) => ({
      pageId: row.page_id,
      kbId: row.kb_id,
      pageTitle: row.page_title,
      pagePath: row.page_path,
      helpful: Number(row.helpful) || 0,
      notHelpful: Number(row.not_helpful) || 0,
      withComment: Number(row.with_comment) || 0,
      lastAt: row.last_at,
    }));
}

export interface PageFeedbackComment {
  id: string;
  pageId: string;
  kbId: string;
  pageTitle: string;
  helpful: boolean;
  comment: string;
  createdAt: string;
}

export async function listRecentFeedbackComments(
  allowedKbIds: string[] | null = null,
  limit = 30,
): Promise<PageFeedbackComment[]> {
  if (!isDatabaseEnabled()) {
    return [];
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      f.id,
      f.page_id,
      f.kb_id,
      COALESCE(p.title, f.page_id) AS page_title,
      f.helpful,
      f.comment,
      f.created_at
    FROM kb_page_feedback f
    LEFT JOIN kb_pages p ON p.id = f.page_id
    WHERE length(trim(f.comment)) > 0
    ORDER BY f.created_at DESC
    LIMIT ${limit}
  `) as unknown as Array<{
    id: string;
    page_id: string;
    kb_id: string;
    page_title: string;
    helpful: boolean;
    comment: string;
    created_at: string;
  }>;

  const allowed = allowedKbIds === null ? null : new Set(allowedKbIds);
  return rows
    .filter((row) => (allowed === null ? true : allowed.has(row.kb_id)))
    .map((row) => ({
      id: row.id,
      pageId: row.page_id,
      kbId: row.kb_id,
      pageTitle: row.page_title,
      helpful: Boolean(row.helpful),
      comment: row.comment,
      createdAt: row.created_at,
    }));
}
