import type { AdminSession } from "@/lib/auth";
import { accessibleKbIds } from "@/lib/auth";
import { getContentHealthReport } from "@/lib/content-health";
import { listExcerptIndex } from "@/lib/excerpt-index";
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

export async function getEditorialAnalytics(session: AdminSession): Promise<EditorialAnalytics> {
  const allowedKbIds = await accessibleKbIds(session);
  const [health, feedback, usage, staleExcerpts, staleAssets, excerpts] = await Promise.all([
    getContentHealthReport(allowedKbIds),
    listPageFeedbackAggregates(allowedKbIds),
    getUsageAnalyticsForSession(session),
    listStaleExcerpts(allowedKbIds),
    listStaleAssetRefs(allowedKbIds),
    listExcerptIndex(allowedKbIds),
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
