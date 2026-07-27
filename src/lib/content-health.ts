import { listAuditEvents } from "@/lib/audit-log";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import { normalizePageTags } from "@/lib/page-tags";
import type { AuditLogEntry, KbPage, KnowledgeBase, PageStatus } from "@/lib/types";

export interface ContentHealthPageItem {
  pageId: string;
  kbId: string;
  kbSlug: string;
  kbTitle: string;
  title: string;
  path: string;
  status: PageStatus;
  updatedDisplayDate: string;
  lastReviewedDate?: string | null;
  nextReviewDate?: string | null;
  issues?: string[];
}

export interface ContentHealthSearchGap {
  query: string;
  kbId: string | null;
  kbTitle: string;
  count: number;
  lastSearchedAt: string;
}

export interface ContentHealthReport {
  generatedAt: string;
  counts: {
    activePages: number;
    publishedPages: number;
    proposedPages: number;
    stalePages: number;
    missingTags: number;
    missingMetadata: number;
    zeroResultSearches: number;
  };
  stalePages: ContentHealthPageItem[];
  missingTags: ContentHealthPageItem[];
  missingMetadata: ContentHealthPageItem[];
  proposedPages: ContentHealthPageItem[];
  zeroResultSearches: ContentHealthSearchGap[];
}

const REVIEW_FALLBACK_DAYS = 365;
const PAGE_LIST_LIMIT = 25;
const SEARCH_GAP_LIMIT = 20;

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function pageItem(page: KbPage, kb: KnowledgeBase, issues?: string[]): ContentHealthPageItem {
  return {
    pageId: page.id,
    kbId: page.kbId,
    kbSlug: kb.slug,
    kbTitle: kb.title,
    title: page.title,
    path: page.path.join("/"),
    status: page.status,
    updatedDisplayDate: page.updatedDisplayDate,
    lastReviewedDate: page.lastReviewedDate,
    nextReviewDate: page.nextReviewDate ?? null,
    issues,
  };
}

function metadataIssues(page: KbPage, kb: KnowledgeBase): string[] {
  const issues: string[] = [];
  if (kb.requireSummary !== false && !page.summary.trim()) issues.push("Missing summary");
  if (!page.ownerLabel.trim()) issues.push("Missing responsible office");
  if (!page.contactEmail.trim()) issues.push("Missing contact email");
  if (!page.lastReviewedDate.trim()) issues.push("Missing last reviewed date");
  if (!page.nextReviewDate?.trim()) issues.push("Missing next review date");
  return issues;
}

function isStale(page: KbPage, todayTime: number): boolean {
  const nextReviewTime = toTime(page.nextReviewDate);
  if (nextReviewTime !== null) {
    return nextReviewTime < todayTime;
  }
  const lastReviewedTime = toTime(page.lastReviewedDate);
  if (lastReviewedTime === null) {
    return true;
  }
  return todayTime - lastReviewedTime > REVIEW_FALLBACK_DAYS * 24 * 60 * 60 * 1000;
}

function zeroResultSearchGaps(events: AuditLogEntry[], kbById: Map<string, KnowledgeBase>): ContentHealthSearchGap[] {
  const byQuery = new Map<string, ContentHealthSearchGap>();
  for (const event of events) {
    if (event.entityType !== "search") continue;
    if (event.details.resultCount !== 0) continue;
    const query = event.entityLabel.trim();
    if (!query) continue;
    const key = `${event.kbId ?? "global"}:${query.toLowerCase()}`;
    const current = byQuery.get(key);
    if (current) {
      current.count += 1;
      if (event.createdAt > current.lastSearchedAt) {
        current.lastSearchedAt = event.createdAt;
      }
      continue;
    }
    const kb = event.kbId ? kbById.get(event.kbId) : null;
    byQuery.set(key, {
      query,
      kbId: event.kbId ?? null,
      kbTitle: kb?.title ?? "All knowledge bases",
      count: 1,
      lastSearchedAt: event.createdAt,
    });
  }
  return [...byQuery.values()]
    .sort((left, right) => right.count - left.count || right.lastSearchedAt.localeCompare(left.lastSearchedAt))
    .slice(0, SEARCH_GAP_LIMIT);
}

export function buildContentHealthReport(input: {
  kbs: KnowledgeBase[];
  pages: KbPage[];
  searchEvents?: AuditLogEntry[];
  now?: Date;
}): ContentHealthReport {
  const kbById = new Map(input.kbs.map((kb) => [kb.id, kb]));
  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
  const todayTime = new Date(`${today}T00:00:00.000Z`).getTime();
  const activePages = input.pages.filter(
    (page) => page.status !== "archived" && (page.nodeKind ?? "page") === "page" && kbById.has(page.kbId),
  );

  const stalePages = activePages
    .filter((page) => isStale(page, todayTime))
    .map((page) => pageItem(page, kbById.get(page.kbId)!))
    .sort(
      (left, right) =>
        (left.nextReviewDate ?? left.lastReviewedDate ?? "").localeCompare(
          right.nextReviewDate ?? right.lastReviewedDate ?? "",
        ) || left.title.localeCompare(right.title),
    );

  const missingTags = activePages
    .filter((page) => normalizePageTags(page.tags).length === 0)
    .map((page) => pageItem(page, kbById.get(page.kbId)!))
    .sort((left, right) => left.title.localeCompare(right.title));

  const missingMetadata = activePages
    .map((page) => {
      const kb = kbById.get(page.kbId)!;
      return pageItem(page, kb, metadataIssues(page, kb));
    })
    .filter((page) => (page.issues?.length ?? 0) > 0)
    .sort((left, right) => (right.issues?.length ?? 0) - (left.issues?.length ?? 0) || left.title.localeCompare(right.title));

  const proposedPages = activePages
    .filter((page) => page.status === "proposed")
    .map((page) => pageItem(page, kbById.get(page.kbId)!))
    .sort((left, right) => right.updatedDisplayDate.localeCompare(left.updatedDisplayDate));

  const zeroResultSearches = zeroResultSearchGaps(input.searchEvents ?? [], kbById);

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    counts: {
      activePages: activePages.length,
      publishedPages: activePages.filter((page) => page.status === "published").length,
      proposedPages: proposedPages.length,
      stalePages: stalePages.length,
      missingTags: missingTags.length,
      missingMetadata: missingMetadata.length,
      zeroResultSearches: zeroResultSearches.length,
    },
    stalePages: stalePages.slice(0, PAGE_LIST_LIMIT),
    missingTags: missingTags.slice(0, PAGE_LIST_LIMIT),
    missingMetadata: missingMetadata.slice(0, PAGE_LIST_LIMIT),
    proposedPages: proposedPages.slice(0, PAGE_LIST_LIMIT),
    zeroResultSearches,
  };
}

export async function getContentHealthReport(allowedKbIds: string[] | null = null): Promise<ContentHealthReport> {
  const allowed = allowedKbIds === null ? null : new Set(allowedKbIds);
  const allKbs = await getAllKbsForAdmin();
  const kbs = allowed === null ? allKbs : allKbs.filter((kb) => allowed.has(kb.id));
  const pages = (
    await Promise.all(kbs.map((kb) => getAllPagesForAdmin(kb.id)))
  ).flat();
  const searchEvents = (await listAuditEvents({ entityType: "search" })).filter(
    (event) => allowed === null || (event.kbId !== null && event.kbId !== undefined && allowed.has(event.kbId)),
  );
  return buildContentHealthReport({ kbs, pages, searchEvents });
}
