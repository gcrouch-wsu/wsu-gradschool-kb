import type { AssetUsage, AssetVersion, ContentBlock, KbPage } from "@/lib/types";

const DATA_ASSET_ID_RE = /data-asset-id=["']([^"']+)["']/gi;

/** Asset ids referenced by selected-text / rich-text document links. */
export function collectDataAssetIdsFromHtml(html: string | undefined | null): string[] {
  if (!html) {
    return [];
  }
  const ids: string[] = [];
  for (const match of html.matchAll(DATA_ASSET_ID_RE)) {
    const id = (match[1] ?? "").trim();
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

function htmlSnippetsFromBlock(block: ContentBlock): string[] {
  const snippets: string[] = [];
  if ("html" in block && typeof block.html === "string" && block.html) {
    snippets.push(block.html);
  }
  if (block.type === "list" && block.itemHtml) {
    for (const item of block.itemHtml) {
      if (item) {
        snippets.push(item);
      }
    }
  }
  if (block.type === "table" && block.rowsHtml) {
    for (const row of block.rowsHtml) {
      for (const cell of row) {
        if (cell) {
          snippets.push(cell);
        }
      }
    }
  }
  return snippets;
}

function collectUsagesFromBlocks(page: KbPage, blocks: ContentBlock[], usages: AssetUsage[]): void {
  for (const block of blocks) {
    if (block.type === "image" && block.assetId) {
      usages.push({
        assetId: block.assetId,
        pageId: page.id,
        pageTitle: page.title,
        pageStatus: page.status,
        blockId: block.blockId,
        usageType: "inline_image",
        usesAltText: Boolean((block.alt ?? "").trim()),
      });
    } else if (block.type === "asset_link" && block.assetId) {
      usages.push({
        assetId: block.assetId,
        pageId: page.id,
        pageTitle: page.title,
        pageStatus: page.status,
        blockId: block.blockId,
        usageType: "inline_link",
      });
    }

    const linkedIds = new Set<string>();
    for (const html of htmlSnippetsFromBlock(block)) {
      for (const assetId of collectDataAssetIdsFromHtml(html)) {
        linkedIds.add(assetId);
      }
    }
    for (const assetId of linkedIds) {
      usages.push({
        assetId,
        pageId: page.id,
        pageTitle: page.title,
        pageStatus: page.status,
        blockId: block.blockId,
        usageType: "inline_link",
      });
    }

    if (
      block.type === "card" ||
      block.type === "procedure_section" ||
      block.type === "sourced"
    ) {
      collectUsagesFromBlocks(page, block.blocks, usages);
    }
  }
}

/** All asset usages on one page (images, asset_link blocks, rich-text data-asset-id links, related). */
export function collectPageAssetUsages(page: KbPage): AssetUsage[] {
  const usages: AssetUsage[] = [];
  collectUsagesFromBlocks(page, page.blocks, usages);
  for (const assetId of page.relatedAssetIds) {
    usages.push({
      assetId,
      pageId: page.id,
      pageTitle: page.title,
      pageStatus: page.status,
      usageType: "related",
    });
  }
  return usages;
}

export interface NewVersionInput {
  body: string;
  mimeType: string;
  fileSizeBytes: number;
  originalFilename: string;
  width?: number;
  height?: number;
  notes?: string;
}

function newVersionId(): string {
  return `asset-version-${crypto.randomUUID()}`;
}

export function nextVersionNumber(versions: AssetVersion[]): number {
  return versions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
}

export function currentActiveVersion(versions: AssetVersion[]): AssetVersion | null {
  return versions.find((version) => version.status === "active") ?? null;
}

export function hasSingleActiveVersion(versions: AssetVersion[]): boolean {
  return versions.filter((version) => version.status === "active").length === 1;
}

export function openDraftCount(versions: AssetVersion[]): number {
  return versions.filter((version) => version.status === "draft").length;
}

export function createDraftVersion(
  assetId: string,
  versions: AssetVersion[],
  input: NewVersionInput,
  now: string,
): AssetVersion {
  if (openDraftCount(versions) > 0) {
    throw new Error("A draft replacement version is already open for this asset. Activate or discard it first.");
  }
  return {
    id: newVersionId(),
    assetId,
    versionNumber: nextVersionNumber(versions),
    status: "draft",
    uploadedAt: now,
    body: input.body,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    originalFilename: input.originalFilename,
    width: input.width,
    height: input.height,
    notes: input.notes,
  };
}

export function activateVersion(versions: AssetVersion[], versionId: string): AssetVersion[] {
  const target = versions.find((version) => version.id === versionId);
  if (!target) {
    throw new Error("Version not found.");
  }
  if (target.status === "archived") {
    throw new Error("Archived versions cannot be activated directly; restore them as a draft first.");
  }
  return versions.map((version) => {
    if (version.id === versionId) {
      return { ...version, status: "active" };
    }
    if (version.status === "active") {
      return { ...version, status: "replaced" };
    }
    return version;
  });
}

export function restoreVersionAsDraft(
  versions: AssetVersion[],
  versionId: string,
  now: string,
): AssetVersion[] {
  const source = versions.find((version) => version.id === versionId);
  if (!source) {
    throw new Error("Version not found.");
  }
  if (openDraftCount(versions) > 0) {
    throw new Error("A draft replacement version is already open for this asset.");
  }
  const draft: AssetVersion = {
    ...source,
    id: newVersionId(),
    versionNumber: nextVersionNumber(versions),
    status: "draft",
    uploadedAt: now,
    notes: `Restored from v${source.versionNumber}`,
  };
  return [...versions, draft];
}

export function extractAssetUsages(pages: KbPage[], assetId: string): AssetUsage[] {
  return pages.flatMap((page) => collectPageAssetUsages(page).filter((usage) => usage.assetId === assetId));
}
