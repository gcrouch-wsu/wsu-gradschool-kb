import type { AssetUsage, AssetVersion, KbPage } from "@/lib/types";

/**
 * Pure asset-lifecycle logic: version creation, activation/replacement, restore,
 * and usage extraction. Kept free of storage/Next concerns so the invariants are
 * unit-testable. Persistence (an asset_versions table) and the file-manager UI
 * build on top of these. See project_spec.md §10/§11.
 */

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

/** The single current/public version, or null if none is active. */
export function currentActiveVersion(versions: AssetVersion[]): AssetVersion | null {
  return versions.find((version) => version.status === "active") ?? null;
}

/** Invariant: an active asset must have exactly one active version. */
export function hasSingleActiveVersion(versions: AssetVersion[]): boolean {
  return versions.filter((version) => version.status === "active").length === 1;
}

/** Spec invariant: at most one draft replacement may be open for activation. */
export function openDraftCount(versions: AssetVersion[]): number {
  return versions.filter((version) => version.status === "draft").length;
}

/**
 * Create a new draft version. Does not change the current active version; the
 * draft becomes public only when explicitly activated. Throws if a draft
 * replacement is already open (project_spec.md §10 asset-version invariants).
 */
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

/**
 * Activate a version. The previously active version transitions to `replaced` in
 * the same operation, guaranteeing exactly one active version and keeping the
 * stable public URL pointed at the current file. Archived versions must be
 * restored as a draft first.
 */
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

/**
 * Restore an older version by cloning it into a new draft (republish/activation
 * stays intentional and uses the normal replacement review). Returns the version
 * list with the new draft appended; the current active version is unchanged.
 */
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

/**
 * Extract every usage of an asset across the given pages, for impact review
 * before replacing or archiving (project_spec.md §10/§11). Covers inline image
 * blocks, inline file links, and page "related files" references.
 */
export function extractAssetUsages(pages: KbPage[], assetId: string): AssetUsage[] {
  const usages: AssetUsage[] = [];
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === "image" && block.assetId === assetId) {
        usages.push({
          assetId,
          pageId: page.id,
          pageTitle: page.title,
          pageStatus: page.status,
          blockId: block.blockId,
          usageType: "inline_image",
          usesAltText: Boolean((block.alt ?? "").trim()),
        });
      } else if (block.type === "asset_link" && block.assetId === assetId) {
        usages.push({
          assetId,
          pageId: page.id,
          pageTitle: page.title,
          pageStatus: page.status,
          blockId: block.blockId,
          usageType: "inline_link",
        });
      }
    }
    if (page.relatedAssetIds.includes(assetId)) {
      usages.push({
        assetId,
        pageId: page.id,
        pageTitle: page.title,
        pageStatus: page.status,
        usageType: "related",
      });
    }
  }
  return usages;
}
