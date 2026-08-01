import { collectPageAssetUsages, extractAssetUsages } from "@/lib/asset-lifecycle";
import {
  checkExcerptSourceForPublish,
  excerptAudienceFor,
  excerptSourceCheckerFor,
} from "@/lib/excerpts";
import { getAllAssetsForAdmin, getAllKbsForAdmin, getAllPagesForAdmin, getAssetStatusById } from "@/lib/kb-store";
import {
  listPageFeedbackAggregates,
  listRecentFeedbackComments,
  type PageFeedbackAggregate,
  type PageFeedbackComment,
} from "@/lib/page-feedback";
import { validatePageForPublish } from "@/lib/publish-gate";
import { listStagedImportsForAdmin } from "@/lib/staged-imports";
import type { KbPage } from "@/lib/types";

export interface ReviewDraftPage {
  pageId: string;
  kbId: string;
  kbSlug: string;
  title: string;
  path: string;
  issues: string[];
}

export interface ReviewBrokenReference {
  pageId: string;
  pageTitle: string;
  pageStatus: string;
  assetId: string;
  usageType: string;
}

export interface ReviewUnusedAsset {
  assetId: string;
  title: string;
  slug: string;
  kbSlug: string;
}

export interface ReviewDraftReady {
  pageId: string;
  title: string;
  path: string;
  kbSlug: string;
}

export interface ReviewProposedPage {
  pageId: string;
  title: string;
  path: string;
  kbSlug: string;
  updatedDisplayDate: string;
}

export interface AdminReviewDashboard {
  draftPagesReady: ReviewDraftReady[];
  draftPagesBlocked: ReviewDraftPage[];
  proposedPages: ReviewProposedPage[];
  brokenReferences: ReviewBrokenReference[];
  unusedAssets: ReviewUnusedAsset[];
  stagedImports: Awaited<ReturnType<typeof listStagedImportsForAdmin>>;
  feedback: PageFeedbackAggregate[];
  feedbackComments: PageFeedbackComment[];
}

export async function getAdminReviewDashboard(
  allowedKbIds: string[] | null = null,
): Promise<AdminReviewDashboard> {
  const allowed = allowedKbIds === null ? null : new Set(allowedKbIds);
  const allKbs = await getAllKbsForAdmin();
  const kbs = allowed === null ? allKbs : allKbs.filter((kb) => allowed.has(kb.id));
  const kbById = new Map(kbs.map((kb) => [kb.id, kb]));

  const allPages: KbPage[] = [];
  for (const kb of kbs) {
    const pages = await getAllPagesForAdmin(kb.id);
    allPages.push(...pages.filter((page) => page.status !== "archived"));
  }

  const draftPages = allPages.filter((page) => page.status === "draft");
  const draftPagesReady: ReviewDraftReady[] = [];
  const draftPagesBlocked: ReviewDraftPage[] = [];

  for (const page of draftPages) {
    const pageKb = kbById.get(page.kbId);
    const issues = await validatePageForPublish(
      page,
      getAssetStatusById,
      pageKb
        ? excerptSourceCheckerFor(excerptAudienceFor(pageKb, page))
        : checkExcerptSourceForPublish,
      { requireSummary: pageKb?.requireSummary !== false },
    );
    const kb = pageKb;
    if (issues.length === 0) {
      draftPagesReady.push({
        pageId: page.id,
        title: page.title,
        path: page.path.join("/"),
        kbSlug: kb?.slug ?? "",
      });
    } else {
      draftPagesBlocked.push({
        pageId: page.id,
        kbId: page.kbId,
        kbSlug: kb?.slug ?? "",
        title: page.title,
        path: page.path.join("/"),
        issues,
      });
    }
  }

  const proposedPages: ReviewProposedPage[] = allPages
    .filter((page) => page.status === "proposed")
    .map((page) => {
      const kb = kbById.get(page.kbId);
      return {
        pageId: page.id,
        title: page.title,
        path: page.path.join("/"),
        kbSlug: kb?.slug ?? "",
        updatedDisplayDate: page.updatedDisplayDate,
      };
    });

  const brokenReferences: ReviewBrokenReference[] = [];
  for (const page of allPages) {
    for (const usage of collectPageAssetUsages(page)) {
      const status = await getAssetStatusById(usage.assetId);
      if (status !== "active") {
        brokenReferences.push({
          pageId: page.id,
          pageTitle: page.title,
          pageStatus: page.status,
          assetId: usage.assetId,
          usageType: usage.usageType,
        });
      }
    }
  }

  const allAssets = await getAllAssetsForAdmin();
  const assets = allowed === null ? allAssets : allAssets.filter((asset) => allowed.has(asset.homeKbId));
  const { listIndexedUsedAssetIds } = await import("@/lib/asset-usages");
  const indexedUsed = await listIndexedUsedAssetIds(allowedKbIds);
  const unusedAssets: ReviewUnusedAsset[] = [];
  for (const asset of assets) {
    if (asset.status !== "active") {
      continue;
    }
    const isUsed =
      indexedUsed !== null
        ? indexedUsed.has(asset.id)
        : extractAssetUsages(allPages, asset.id).length > 0;
    if (!isUsed) {
      const kb = kbById.get(asset.homeKbId);
      unusedAssets.push({
        assetId: asset.id,
        title: asset.title,
        slug: asset.slug,
        kbSlug: kb?.slug ?? "",
      });
    }
  }

  const allStagedImports = await listStagedImportsForAdmin();
  const stagedImports =
    allowed === null ? allStagedImports : allStagedImports.filter((row) => allowed.has(row.kbId));

  const feedback = await listPageFeedbackAggregates(allowedKbIds);
  const feedbackComments = await listRecentFeedbackComments(allowedKbIds);

  return {
    draftPagesReady,
    draftPagesBlocked,
    proposedPages,
    brokenReferences,
    unusedAssets,
    stagedImports,
    feedback,
    feedbackComments,
  };
}
