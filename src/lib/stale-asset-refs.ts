import { assetHasPublicPublishedUsage, getAllKbsForAdmin, getAllPagesForAdmin, getAssetById } from "@/lib/kb-store";
import type { KbPage, KnowledgeBase } from "@/lib/types";

export interface StaleAssetRefItem {
  pageId: string;
  pageTitle: string;
  pageStatus: string;
  kbId: string;
  kbTitle: string;
  assetId: string;
  assetTitle: string;
  assetStatus: string;
  issue: "archived" | "missing" | "staff_only";
  blockId?: string;
  usageType: string;
}

function collectAssetRefs(page: KbPage): Array<{ assetId: string; blockId?: string; usageType: string }> {
  const refs: Array<{ assetId: string; blockId?: string; usageType: string }> = [];
  for (const block of page.blocks) {
    if (block.type === "image" && block.assetId) {
      refs.push({ assetId: block.assetId, blockId: block.blockId, usageType: "image" });
    } else if (block.type === "asset_link") {
      refs.push({ assetId: block.assetId, blockId: block.blockId, usageType: "asset_link" });
    } else if (block.type === "card" || block.type === "procedure_section" || block.type === "sourced") {
      for (const nested of collectAssetRefs({ ...page, blocks: block.blocks })) {
        refs.push(nested);
      }
    }
  }
  if (page.relatedAssetIds?.length) {
    for (const assetId of page.relatedAssetIds) {
      refs.push({ assetId, usageType: "related_file" });
    }
  }
  return refs;
}

export async function listStaleAssetRefs(allowedKbIds: string[] | null = null): Promise<StaleAssetRefItem[]> {
  const kbs = await getAllKbsForAdmin();
  const scopedKbs = allowedKbIds ? kbs.filter((kb) => allowedKbIds.includes(kb.id)) : kbs;
  const kbById = new Map<string, KnowledgeBase>(scopedKbs.map((kb) => [kb.id, kb]));
  const pages = (
    await Promise.all(scopedKbs.map((kb) => getAllPagesForAdmin(kb.id)))
  ).flat().filter((page) => page.status !== "archived");

  const stale: StaleAssetRefItem[] = [];
  for (const page of pages) {
    const kb = kbById.get(page.kbId);
    if (!kb) {
      continue;
    }
    for (const ref of collectAssetRefs(page)) {
      const asset = await getAssetById(ref.assetId);
      if (!asset) {
        stale.push({
          pageId: page.id,
          pageTitle: page.title,
          pageStatus: page.status,
          kbId: kb.id,
          kbTitle: kb.title,
          assetId: ref.assetId,
          assetTitle: "(missing asset)",
          assetStatus: "missing",
          issue: "missing",
          blockId: ref.blockId,
          usageType: ref.usageType,
        });
        continue;
      }
      if (asset.status === "archived") {
        stale.push({
          pageId: page.id,
          pageTitle: page.title,
          pageStatus: page.status,
          kbId: kb.id,
          kbTitle: kb.title,
          assetId: asset.id,
          assetTitle: asset.title,
          assetStatus: asset.status,
          issue: "archived",
          blockId: ref.blockId,
          usageType: ref.usageType,
        });
        continue;
      }
      if (page.status === "published" && page.visibility === "public") {
        const publicUsage = await assetHasPublicPublishedUsage(asset);
        if (!publicUsage) {
          stale.push({
            pageId: page.id,
            pageTitle: page.title,
            pageStatus: page.status,
            kbId: kb.id,
            kbTitle: kb.title,
            assetId: asset.id,
            assetTitle: asset.title,
            assetStatus: asset.status,
            issue: "staff_only",
            blockId: ref.blockId,
            usageType: ref.usageType,
          });
        }
      }
    }
  }

  return stale.slice(0, 100);
}
