import type { AdminSession } from "@/lib/auth";
import { accessibleKbIds } from "@/lib/auth";
import { getContentHealthReport } from "@/lib/content-health";
import { listExcerptIndex } from "@/lib/excerpt-index";
import { logError } from "@/lib/log";
import { listPageFeedbackAggregates } from "@/lib/page-feedback";
import { getUsageAnalyticsForSession } from "@/lib/page-views";
import { listStaleAssetRefs } from "@/lib/stale-asset-refs";
import { listStaleExcerpts } from "@/lib/stale-excerpts";

export interface EditorialAnalytics {
  enabled: boolean;
  health: Awaited<ReturnType<typeof getContentHealthReport>>["counts"];
  staleExcerptCount: number;
  staleAssetRefCount: number;
  excerptCount: number;
  feedback: {
    helpfulRatioLow: Array<{ pageId: string; pageTitle: string; helpful: number; notHelpful: number; ratio: number }>;
    helpfulRatioHigh: Array<{ pageId: string; pageTitle: string; helpful: number; notHelpful: number; ratio: number }>;
  };
  searchGaps: Awaited<ReturnType<typeof getContentHealthReport>>["zeroResultSearches"];
  usageSummary: {
    views7d: number;
    views30d: number;
    topKbTitle: string | null;
    topKbViews: number;
  };
}

const emptyHealthReport: Awaited<ReturnType<typeof getContentHealthReport>> = {
  generatedAt: new Date(0).toISOString(),
  counts: {
    activePages: 0,
    publishedPages: 0,
    proposedPages: 0,
    stalePages: 0,
    missingTags: 0,
    missingMetadata: 0,
    zeroResultSearches: 0,
  },
  stalePages: [],
  missingTags: [],
  missingMetadata: [],
  proposedPages: [],
  zeroResultSearches: [],
};

async function settledOr<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    logError(error, { route: "editorial-analytics", action: label });
    return fallback;
  }
}

export async function getEditorialAnalytics(session: AdminSession): Promise<EditorialAnalytics> {
  const allowedKbIds = await accessibleKbIds(session);
  const [health, feedback, usage, staleExcerpts, staleAssets, excerpts] = await Promise.all([
    settledOr("content-health", getContentHealthReport(allowedKbIds), emptyHealthReport),
    settledOr("feedback", listPageFeedbackAggregates(allowedKbIds), []),
    settledOr("usage", getUsageAnalyticsForSession(session), { enabled: false, periods: [] }),
    settledOr("stale-excerpts", listStaleExcerpts(allowedKbIds), []),
    settledOr("stale-assets", listStaleAssetRefs(allowedKbIds), []),
    settledOr("excerpt-index", listExcerptIndex(allowedKbIds), []),
  ]);

  const feedbackRows = feedback
    .map((row) => {
      const total = row.helpful + row.notHelpful;
      const ratio = total === 0 ? 0 : Math.round((row.helpful / total) * 100);
      return { pageId: row.pageId, pageTitle: row.pageTitle, helpful: row.helpful, notHelpful: row.notHelpful, ratio };
    })
    .filter((row) => row.helpful + row.notHelpful >= 3);

  const period7 = usage.periods.find((period) => period.days === 7);
  const period30 = usage.periods.find((period) => period.days === 30);
  const topKb = period30?.kbTotals[0];

  return {
    enabled: usage.enabled,
    health: health.counts,
    staleExcerptCount: staleExcerpts.length,
    staleAssetRefCount: staleAssets.length,
    excerptCount: excerpts.length,
    feedback: {
      helpfulRatioLow: [...feedbackRows].sort((a, b) => a.ratio - b.ratio).slice(0, 8),
      helpfulRatioHigh: [...feedbackRows].sort((a, b) => b.ratio - a.ratio).slice(0, 8),
    },
    searchGaps: health.zeroResultSearches.slice(0, 10),
    usageSummary: {
      views7d: period7?.totalViews ?? 0,
      views30d: period30?.totalViews ?? 0,
      topKbTitle: topKb?.kbTitle ?? null,
      topKbViews: topKb?.viewCount ?? 0,
    },
  };
}
