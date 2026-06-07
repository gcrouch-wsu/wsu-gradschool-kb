import { extractAssetUsages } from "@/lib/asset-lifecycle";
import { getAllAssetsForAdmin, getAllKbsForAdmin, getAllPagesForAdmin, getAssetStatusById } from "@/lib/kb-store";
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

export interface AdminReviewDashboard {
  draftPagesReady: ReviewDraftReady[];
  draftPagesBlocked: ReviewDraftPage[];
  brokenReferences: ReviewBrokenReference[];
  unusedAssets: ReviewUnusedAsset[];
  stagedImports: Awaited<ReturnType<typeof listStagedImportsForAdmin>>;
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
    const issues = await validatePageForPublish(page, getAssetStatusById);
    const kb = kbById.get(page.kbId);
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

  const brokenReferences: ReviewBrokenReference[] = [];
  for (const page of allPages) {
    for (const block of page.blocks) {
      if (block.type === "image" && block.assetId) {
        const status = await getAssetStatusById(block.assetId);
        if (status !== "active") {
          brokenReferences.push({
            pageId: page.id,
            pageTitle: page.title,
            pageStatus: page.status,
            assetId: block.assetId,
            usageType: "inline_image",
          });
        }
      }
      if (block.type === "asset_link") {
        const status = await getAssetStatusById(block.assetId);
        if (status !== "active") {
          brokenReferences.push({
            pageId: page.id,
            pageTitle: page.title,
            pageStatus: page.status,
            assetId: block.assetId,
            usageType: "inline_link",
          });
        }
      }
    }
    for (const assetId of page.relatedAssetIds) {
      const status = await getAssetStatusById(assetId);
      if (status !== "active") {
        brokenReferences.push({
          pageId: page.id,
          pageTitle: page.title,
          pageStatus: page.status,
          assetId,
          usageType: "related",
        });
      }
    }
  }

  const allAssets = await getAllAssetsForAdmin();
  const assets = allowed === null ? allAssets : allAssets.filter((asset) => allowed.has(asset.homeKbId));
  const unusedAssets: ReviewUnusedAsset[] = [];
  for (const asset of assets) {
    if (asset.status !== "active") {
      continue;
    }
    const usages = extractAssetUsages(allPages, asset.id);
    if (usages.length === 0) {
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

  return {
    draftPagesReady,
    draftPagesBlocked,
    brokenReferences,
    unusedAssets,
    stagedImports,
  };
}
