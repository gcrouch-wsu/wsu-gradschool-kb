import { accessibleKbIds, type AdminSession } from "@/lib/auth";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { logError } from "@/lib/log";
import { after } from "next/server";

export interface UsageTopPage {
  pageId: string;
  kbId: string;
  kbTitle: string;
  title: string;
  path: string;
  viewCount: number;
}

export interface UsageKbTotal {
  kbId: string;
  kbTitle: string;
  viewCount: number;
}

export interface UsagePeriod {
  days: 7 | 30 | 90;
  totalViews: number;
  kbTotals: UsageKbTotal[];
  topPages: UsageTopPage[];
}

export interface UsageAnalytics {
  enabled: boolean;
  periods: UsagePeriod[];
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeCount(value: unknown) {
  return Number(value ?? 0);
}

export async function recordPageView(input: {
  pageId: string;
  kbId: string;
  viewedAt?: Date;
}): Promise<void> {
  if (!isDatabaseEnabled()) {
    return;
  }

  await ensureSchema();
  const sql = getSql();
  const day = isoDate(input.viewedAt ?? new Date());
  await sql`
    INSERT INTO kb_page_views (page_id, kb_id, day, view_count)
    VALUES (${input.pageId}, ${input.kbId}, ${day}::date, 1)
    ON CONFLICT (page_id, day)
    DO UPDATE SET
      view_count = kb_page_views.view_count + 1,
      kb_id = EXCLUDED.kb_id
  `;
}

export function recordPageViewLater(input: { pageId: string; kbId: string }) {
  if (!isDatabaseEnabled()) {
    return;
  }
  const run = () => recordPageView(input).catch((error) => {
    logError(error, { route: "page-view", action: "record", pageId: input.pageId, kbId: input.kbId });
  });
  try {
    after(run);
  } catch {
    void run();
  }
}

export function isPageViewPrefetch(headers: Pick<Headers, "get">) {
  return (
    headers.get("next-router-prefetch") === "1" ||
    headers.get("purpose") === "prefetch" ||
    headers.get("sec-purpose")?.includes("prefetch") === true
  );
}

async function getUsageForPeriod(days: 7 | 30 | 90, allowedKbIds: string[] | null): Promise<UsagePeriod> {
  if (allowedKbIds && allowedKbIds.length === 0) {
    return { days, totalViews: 0, kbTotals: [], topPages: [] };
  }

  const sql = getSql();
  const allowed = allowedKbIds;
  const startDays = days - 1;
  const totalRows = (await sql`
    SELECT COALESCE(SUM(view_count), 0)::int AS total
    FROM kb_page_views
    WHERE day >= current_date - (${startDays}::int * interval '1 day')
      AND (${allowed}::text[] IS NULL OR kb_id = ANY(${allowed}::text[]))
  `) as unknown as Array<{ total: number }>;

  const kbRows = (await sql`
    SELECT v.kb_id, kb.title AS kb_title, SUM(v.view_count)::int AS view_count
    FROM kb_page_views v
    JOIN knowledge_bases kb ON kb.id = v.kb_id
    WHERE v.day >= current_date - (${startDays}::int * interval '1 day')
      AND (${allowed}::text[] IS NULL OR v.kb_id = ANY(${allowed}::text[]))
    GROUP BY v.kb_id, kb.title
    ORDER BY view_count DESC, kb.title ASC
    LIMIT 20
  `) as unknown as Array<{ kb_id: string; kb_title: string; view_count: number }>;

  const pageRows = (await sql`
    SELECT
      v.page_id,
      v.kb_id,
      kb.title AS kb_title,
      COALESCE(p.title, v.page_id) AS title,
      COALESCE(p.path, '') AS path,
      SUM(v.view_count)::int AS view_count
    FROM kb_page_views v
    JOIN knowledge_bases kb ON kb.id = v.kb_id
    LEFT JOIN kb_pages p ON p.id = v.page_id
    WHERE v.day >= current_date - (${startDays}::int * interval '1 day')
      AND (${allowed}::text[] IS NULL OR v.kb_id = ANY(${allowed}::text[]))
    GROUP BY v.page_id, v.kb_id, kb.title, p.title, p.path
    ORDER BY view_count DESC, title ASC
    LIMIT 25
  `) as unknown as Array<{
    page_id: string;
    kb_id: string;
    kb_title: string;
    title: string;
    path: string;
    view_count: number;
  }>;

  return {
    days,
    totalViews: normalizeCount(totalRows[0]?.total),
    kbTotals: kbRows.map((row) => ({
      kbId: row.kb_id,
      kbTitle: row.kb_title,
      viewCount: normalizeCount(row.view_count),
    })),
    topPages: pageRows.map((row) => ({
      pageId: row.page_id,
      kbId: row.kb_id,
      kbTitle: row.kb_title,
      title: row.title,
      path: row.path,
      viewCount: normalizeCount(row.view_count),
    })),
  };
}

export async function getUsageAnalyticsForSession(session: AdminSession): Promise<UsageAnalytics> {
  if (!isDatabaseEnabled()) {
    return { enabled: false, periods: [] };
  }

  await ensureSchema();
  const allowedKbIds = await accessibleKbIds(session);
  return {
    enabled: true,
    periods: await Promise.all([getUsageForPeriod(7, allowedKbIds), getUsageForPeriod(30, allowedKbIds), getUsageForPeriod(90, allowedKbIds)]),
  };
}

export async function foldOldPageViews(today = new Date()): Promise<number> {
  if (!isDatabaseEnabled()) {
    return 0;
  }

  await ensureSchema();
  const sql = getSql();
  const cutoff = isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 90)));
  const results = (await sql.transaction([
    sql`
    WITH monthly AS (
      SELECT
        page_id,
        MAX(kb_id) AS kb_id,
        date_trunc('month', day)::date AS month_day,
        SUM(view_count)::int AS total
      FROM kb_page_views
      WHERE day < ${cutoff}::date
        AND day <> date_trunc('month', day)::date
      GROUP BY page_id, date_trunc('month', day)::date
    )
    INSERT INTO kb_page_views (page_id, kb_id, day, view_count)
    SELECT page_id, kb_id, month_day, total
    FROM monthly
    ON CONFLICT (page_id, day)
    DO UPDATE SET
      view_count = kb_page_views.view_count + EXCLUDED.view_count,
      kb_id = EXCLUDED.kb_id
    RETURNING page_id
  `,
    sql`
    DELETE FROM kb_page_views
    WHERE day < ${cutoff}::date
      AND day <> date_trunc('month', day)::date
  `,
  ])) as unknown as [Array<{ page_id: string }>, unknown];
  return results[0]?.length ?? 0;
}
