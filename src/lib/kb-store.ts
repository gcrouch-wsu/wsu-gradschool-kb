import { cache } from "react";
import { recordSearchEvent } from "./audit-log";
import {
  insertAsset,
  insertAssetVersion,
  insertPage,
  insertRedirect,
  isDatabaseEnabled,
  loadActiveRedirect,
  loadRedirectsForKb,
  deleteRedirectById,
  loadAssetForDelivery,
  loadDatasetFromDb,
  loadPageById,
  loadVersionsForAsset,
  replaceVersionsForAsset,
  deleteAsset as deleteAssetFromDb,
  deletePage as deletePageFromDb,
  getSql,
  updateAssetRecord,
  updatePages,
  updatePageStatusColumn,
  updatePageLifecycle,
} from "@/lib/db";
import { seedDataset } from "@/lib/demo-data";
import {
  activateVersion,
  createDraftVersion,
  currentActiveVersion,
  extractAssetUsages,
  type NewVersionInput,
} from "@/lib/asset-lifecycle";
import { assertPageSlugAllowed, slugify } from "@/lib/slug";
import type {
  Asset,
  AssetUsage,
  AssetVersion,
  ContentBlock,
  KbDataset,
  KbPage,
  KbRedirect,
  KnowledgeBase,
  PageStatus,
  PageTreeNode,
  PageVisibility,
} from "@/lib/types";

const globalForRuntime = globalThis as unknown as {
  __kbRuntimeAssets?: Asset[];
  __kbRuntimePages?: KbPage[];
  __kbRuntimeVersions?: Map<string, AssetVersion[]>;
  __kbRuntimeRedirects?: KbRedirect[];
  __kbDeletedAssetIds?: Set<string>;
  __kbDeletedPageIds?: Set<string>;
};

function runtimeVersions(): Map<string, AssetVersion[]> {
  if (!globalForRuntime.__kbRuntimeVersions) {
    globalForRuntime.__kbRuntimeVersions = new Map();
  }
  return globalForRuntime.__kbRuntimeVersions;
}

function runtimeRedirects(): KbRedirect[] {
  if (!globalForRuntime.__kbRuntimeRedirects) {
    globalForRuntime.__kbRuntimeRedirects = [];
  }
  return globalForRuntime.__kbRuntimeRedirects;
}

async function loadVersions(assetId: string): Promise<AssetVersion[]> {
  if (isDatabaseEnabled()) {
    return loadVersionsForAsset(assetId);
  }
  return [...(runtimeVersions().get(assetId) ?? [])];
}

async function saveVersions(assetId: string, versions: AssetVersion[]): Promise<void> {
  if (isDatabaseEnabled()) {
    await replaceVersionsForAsset(assetId, versions);
    return;
  }
  runtimeVersions().set(assetId, versions);
}

function applyActiveVersionToAsset(asset: Asset, versions: AssetVersion[]): Asset {
  const active = currentActiveVersion(versions);
  if (!active) {
    return asset;
  }
  const versionBody = active.body?.trim() ?? "";
  return {
    ...asset,
    versionId: active.id,
    body: versionBody || asset.body,
    mimeType: active.mimeType || asset.mimeType,
    fileSizeBytes: active.fileSizeBytes || asset.fileSizeBytes,
  };
}

function runtimePages(): KbPage[] {
  if (!globalForRuntime.__kbRuntimePages) {
    globalForRuntime.__kbRuntimePages = [];
  }
  return globalForRuntime.__kbRuntimePages;
}

function runtimeAssets(): Asset[] {
  if (!globalForRuntime.__kbRuntimeAssets) {
    globalForRuntime.__kbRuntimeAssets = [];
  }
  return globalForRuntime.__kbRuntimeAssets;
}

function deletedAssetIds(): Set<string> {
  if (!globalForRuntime.__kbDeletedAssetIds) {
    globalForRuntime.__kbDeletedAssetIds = new Set();
  }
  return globalForRuntime.__kbDeletedAssetIds;
}

function deletedPageIds(): Set<string> {
  if (!globalForRuntime.__kbDeletedPageIds) {
    globalForRuntime.__kbDeletedPageIds = new Set();
  }
  return globalForRuntime.__kbDeletedPageIds;
}

function mergeRuntimeIntoDataset(dbDataset: KbDataset): KbDataset {
  const extraPages = runtimePages();
  const extraAssets = runtimeAssets();
  const deletedPages = deletedPageIds();
  const deletedAssets = deletedAssetIds();
  if (extraPages.length === 0 && extraAssets.length === 0 && deletedPages.size === 0 && deletedAssets.size === 0) {
    return dbDataset;
  }
  const pageOverrides = new Map(extraPages.map((page) => [page.id, page]));
  const seedPageIds = new Set(dbDataset.pages.map((page) => page.id));
  const seedAssetIds = new Set(dbDataset.assets.map((asset) => asset.id));
  return {
    knowledgeBases: dbDataset.knowledgeBases,
    pages: [
      ...dbDataset.pages
        .filter((page) => !deletedPages.has(page.id))
        .map((page) => pageOverrides.get(page.id) ?? page),
      ...extraPages.filter((page) => !seedPageIds.has(page.id) && !deletedPages.has(page.id)),
    ],
    assets: [
      ...dbDataset.assets.filter((asset) => !deletedAssets.has(asset.id)),
      ...extraAssets.filter((asset) => !seedAssetIds.has(asset.id) && !deletedAssets.has(asset.id)),
    ],
  };
}

const getDataset = cache(async (): Promise<KbDataset> => {
  if (isDatabaseEnabled()) {
    return mergeRuntimeIntoDataset(await loadDatasetFromDb());
  }
  const extra = runtimePages();
  const extraAssets = runtimeAssets();
  const deletedPages = deletedPageIds();
  const deletedAssets = deletedAssetIds();
  if (extra.length === 0 && extraAssets.length === 0 && deletedPages.size === 0 && deletedAssets.size === 0) {
    return seedDataset;
  }
  const pageOverrides = new Map(extra.map((page) => [page.id, page]));
  return {
    knowledgeBases: seedDataset.knowledgeBases,
    pages: [
      ...seedDataset.pages
        .filter((page) => !deletedPages.has(page.id))
        .map((page) => pageOverrides.get(page.id) ?? page),
      ...extra.filter(
        (page) => !deletedPages.has(page.id) && !seedDataset.pages.some((seedPage) => seedPage.id === page.id),
      ),
    ],
    assets: [
      ...seedDataset.assets.filter((asset) => !deletedAssets.has(asset.id)),
      ...extraAssets.filter((asset) => !deletedAssets.has(asset.id)),
    ],
  };
});

function pathKey(path: string[]) {
  return path.join("/");
}

function orderPagesForTree(pages: KbPage[]) {
  const childrenByParent = new Map<string, KbPage[]>();
  for (const page of pages) {
    const parent = pathKey(page.path.slice(0, -1));
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), page]);
  }
  const output: KbPage[] = [];
  const visit = (parentPath: string[]) => {
    const children = [...(childrenByParent.get(pathKey(parentPath)) ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
    );
    for (const child of children) {
      output.push(child);
      visit(child.path);
    }
  };
  visit([]);
  return output;
}

function isStaffOnly(pages: KbPage[], page: KbPage) {

  return pages.some(
    (candidate) =>
      candidate.kbId === page.kbId &&
      candidate.visibility === "staff" &&
      candidate.path.length <= page.path.length &&
      candidate.path.every((segment, index) => page.path[index] === segment),
  );
}

function publishedPages(dataset: KbDataset, kbId: string) {
  return dataset.pages.filter((page) => page.kbId === kbId && page.status === "published");
}

function visiblePages(dataset: KbDataset, kbId: string, includeStaff: boolean) {
  if (includeStaff) {
    return dataset.pages.filter(
      (page) => page.kbId === kbId && (page.status === "published" || page.status === "draft"),
    );
  }
  const published = publishedPages(dataset, kbId);
  return published.filter((page) => !isStaffOnly(published, page));
}

export async function getPublishedKbs(): Promise<KnowledgeBase[]> {
  const dataset = await getDataset();
  return dataset.knowledgeBases.filter((kb) => kb.status === "published");
}

export async function getKbBySlug(slug: string): Promise<KnowledgeBase | null> {
  const dataset = await getDataset();
  return dataset.knowledgeBases.find((kb) => kb.slug === slug && kb.status === "published") ?? null;
}

export async function getKbById(id: string): Promise<KnowledgeBase | null> {
  const dataset = await getDataset();
  return dataset.knowledgeBases.find((kb) => kb.id === id) ?? null;
}

export async function getVisiblePagesForKb(kbId: string, includeStaff: boolean): Promise<KbPage[]> {
  const dataset = await getDataset();
  return visiblePages(dataset, kbId, includeStaff);
}

export async function buildPageTree(kbId: string, includeStaff: boolean): Promise<PageTreeNode[]> {
  const dataset = await getDataset();
  const visible = visiblePages(dataset, kbId, includeStaff);
  const nodes = new Map<string, PageTreeNode>();
  visible.forEach((page) => nodes.set(pathKey(page.path), { page, children: [] }));

  const roots: PageTreeNode[] = [];
  visible.forEach((page) => {
    const node = nodes.get(pathKey(page.path))!;
    const parent = page.path.length > 1 ? nodes.get(pathKey(page.path.slice(0, -1))) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (list: PageTreeNode[]) => {
    list.sort(
      (a, b) =>
        a.page.sortOrder - b.page.sortOrder ||
        a.page.title.localeCompare(b.page.title),
    );
    list.forEach((child) => sortNodes(child.children));
  };
  sortNodes(roots);
  return roots;
}

export async function getBreadcrumbs(
  kbId: string,
  path: string[],
  includeStaff: boolean,
): Promise<KbPage[]> {
  const dataset = await getDataset();
  const visible = visiblePages(dataset, kbId, includeStaff);
  const crumbs: KbPage[] = [];
  for (let depth = 1; depth <= path.length; depth += 1) {
    const subPath = path.slice(0, depth).join("/");
    const match = visible.find((page) => pathKey(page.path) === subPath);
    if (match) {
      crumbs.push(match);
    }
  }
  return crumbs;
}

export async function getPageByPath(
  kbId: string,
  path: string[],
  includeStaff: boolean,
): Promise<KbPage | null> {
  const dataset = await getDataset();
  const page = dataset.pages.find((candidate) => {
    if (candidate.kbId !== kbId || pathKey(candidate.path) !== pathKey(path)) {
      return false;
    }
    if (includeStaff) {
      return candidate.status === "published" || candidate.status === "draft";
    }
    return candidate.status === "published";
  });
  if (!page) {
    return null;
  }
  if (!includeStaff && isStaffOnly(publishedPages(dataset, kbId), page)) {
    return null;
  }
  return page;
}

export async function getAssetBySlug(homeKbId: string, slug: string): Promise<Asset | null> {
  const dataset = await getDataset();
  return (
    dataset.assets.find(
      (asset) => asset.homeKbId === homeKbId && asset.slug === slug && asset.status === "active",
    ) ?? null
  );
}

export async function getAssetById(assetId: string): Promise<Asset | null> {
  const dataset = await getDataset();
  return dataset.assets.find((asset) => asset.id === assetId && asset.status === "active") ?? null;
}

export async function getAssetStatusById(assetId: string): Promise<string | null> {
  const dataset = await getDataset();
  return dataset.assets.find((asset) => asset.id === assetId)?.status ?? null;
}

export async function getAssetHomeKbId(assetId: string): Promise<string | null> {
  const dataset = await getDataset();
  return dataset.assets.find((asset) => asset.id === normalizeRecordId(assetId))?.homeKbId ?? null;
}

export async function getAssetUsages(assetId: string): Promise<AssetUsage[]> {
  const dataset = await getDataset();
  return extractAssetUsages(dataset.pages, assetId);
}

export async function getAssetForDelivery(homeKbId: string, slug: string): Promise<Asset | null> {
  if (isDatabaseEnabled()) {
    const fromDb = await loadAssetForDelivery(homeKbId, slug);
    if (fromDb) {
      return fromDb;
    }
  }
  const seedMatch = seedDataset.assets.find(
    (asset) => asset.homeKbId === homeKbId && asset.slug === slug && asset.status === "active",
  );
  const runtimeMatch = runtimeAssets().find(
    (asset) => asset.homeKbId === homeKbId && asset.slug === slug && asset.status === "active",
  );
  const asset = runtimeMatch ?? seedMatch ?? null;
  if (!asset) {
    return null;
  }
  const versions = await loadVersions(asset.id);
  const resolved = versions.length > 0 ? applyActiveVersionToAsset(asset, versions) : asset;
  return resolved.body.trim() ? resolved : null;
}

export interface CreateManagedAssetInput {
  body: string;
  fileSizeBytes: number;
  homeKbId: string;
  mimeType: string;
  originalFilename: string;
  assetType: Asset["assetType"];
  title?: string;
  description?: string;

  videoProvider?: Asset["videoProvider"];
  videoExternalId?: string | null;
  videoUrl?: string | null;
}

export interface CreateImageAssetInput {
  body: string;
  fileSizeBytes: number;
  homeKbId: string;
  mimeType: string;
  originalFilename: string;
  title?: string;
}

async function persistNewAssetWithVersion(asset: Asset, version: AssetVersion): Promise<Asset> {
  if (isDatabaseEnabled()) {
    await insertAsset(asset);
    await insertAssetVersion(version);
  } else {
    runtimeAssets().push(asset);
    runtimeVersions().set(asset.id, [version]);
  }
  return asset;
}

export async function createManagedAsset(input: CreateManagedAssetInput): Promise<Asset> {
  const dataset = await getDataset();
  const kb = dataset.knowledgeBases.find((candidate) => candidate.id === input.homeKbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }

  const title = input.title?.trim() || input.originalFilename.replace(/\.[^.]+$/, "") || "Untitled file";
  const baseSlug = slugify(title);
  const siblingSlugs = new Set(
    dataset.assets.filter((asset) => asset.homeKbId === input.homeKbId).map((asset) => asset.slug),
  );
  let slug = baseSlug;
  let suffix = 2;
  while (siblingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const assetId = `asset-${crypto.randomUUID()}`;
  const versionId = `asset-version-${crypto.randomUUID()}`;
  const version: AssetVersion = {
    id: versionId,
    assetId,
    versionNumber: 1,
    status: "active",
    body: input.body,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    originalFilename: input.originalFilename,
    uploadedAt: today,
  };

  const asset: Asset = {
    id: assetId,
    homeKbId: input.homeKbId,
    title,
    slug,
    description:
      input.description?.trim() ||
      `Managed ${input.assetType} uploaded from ${input.originalFilename}.`,
    assetType: input.assetType,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    status: "active",
    ownerLabel: kb.title,
    lastReviewedDate: today,
    updatedDisplayDate: today,
    versionId,
    body: input.body,
    videoProvider: input.videoProvider ?? null,
    videoExternalId: input.videoExternalId ?? null,
    videoUrl: input.videoUrl ?? null,
  };

  return persistNewAssetWithVersion(asset, version);
}

export async function createImageAsset(input: CreateImageAssetInput): Promise<Asset> {
  return createManagedAsset({
    ...input,
    assetType: "image",
    description: `Managed image imported from ${input.originalFilename}.`,
  });
}

export interface AssetAdminDetail {
  asset: Asset;
  versions: AssetVersion[];
  usages: AssetUsage[];
  publicUrl: string | null;
}

export async function getAllAssetsForAdmin(kbId?: string): Promise<Asset[]> {
  const dataset = await getDataset();
  return dataset.assets
    .filter((asset) => (kbId ? asset.homeKbId === kbId : true))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getAssetAdminDetail(assetId: string): Promise<AssetAdminDetail | null> {
  const dataset = await getDataset();
  const asset = dataset.assets.find((candidate) => candidate.id === assetId);
  if (!asset) {
    return null;
  }
  const versions = await loadVersions(assetId);
  const synced = versions.length > 0 ? applyActiveVersionToAsset(asset, versions) : asset;
  const kb = dataset.knowledgeBases.find((candidate) => candidate.id === asset.homeKbId);
  return {
    asset: synced,
    versions,
    usages: extractAssetUsages(dataset.pages, assetId),
    publicUrl: kb && asset.status === "active" ? `/kb/${kb.slug}/files/${asset.slug}` : null,
  };
}

export async function addDraftReplacementVersion(
  assetId: string,
  input: NewVersionInput,
): Promise<{ asset: Asset; versions: AssetVersion[]; draft: AssetVersion }> {
  const dataset = await getDataset();
  const asset = dataset.assets.find((candidate) => candidate.id === assetId);
  if (!asset) {
    throw new Error("Asset not found.");
  }
  const versions = await loadVersions(assetId);
  const now = new Date().toISOString().slice(0, 10);
  const draft = createDraftVersion(assetId, versions, input, now);
  const nextVersions = [...versions, draft];
  await saveVersions(assetId, nextVersions);
  return { asset, versions: nextVersions, draft };
}

export async function activateAssetVersion(assetId: string, versionId: string): Promise<Asset> {
  const dataset = await getDataset();
  const asset = dataset.assets.find((candidate) => candidate.id === assetId);
  if (!asset) {
    throw new Error("Asset not found.");
  }
  const versions = await loadVersions(assetId);
  const nextVersions = activateVersion(versions, versionId);
  await saveVersions(assetId, nextVersions);
  const active = currentActiveVersion(nextVersions);
  if (!active) {
    throw new Error("No active version after activation.");
  }
  const today = new Date().toISOString().slice(0, 10);
  const updated: Asset = {
    ...asset,
    versionId: active.id,
    body: active.body,
    mimeType: active.mimeType,
    fileSizeBytes: active.fileSizeBytes,
    updatedDisplayDate: today,
  };
  if (isDatabaseEnabled()) {
    await updateAssetRecord(updated);
  } else {
    const list = runtimeAssets();
    const index = list.findIndex((candidate) => candidate.id === assetId);
    if (index >= 0) {
      list[index] = updated;
    }
  }
  return updated;
}

export async function getActiveRedirectTarget(
  kbId: string,
  path: string[],
): Promise<string[] | null> {
  const fromPath = path.join("/");
  if (!fromPath) {
    return null;
  }
  let redirect: KbRedirect | null = null;
  if (isDatabaseEnabled()) {
    redirect = await loadActiveRedirect(kbId, fromPath);
  } else {
    redirect =
      runtimeRedirects().find(
        (candidate) =>
          candidate.kbId === kbId &&
          candidate.fromPath === fromPath &&
          candidate.status === "active",
      ) ?? null;
  }
  if (!redirect?.toPath) {
    return null;
  }
  return redirect.toPath.split("/").filter(Boolean);
}

async function upsertPathRedirect(kbId: string, fromPath: string, toPath: string, reason: string) {
  if (fromPath === toPath || !fromPath) {
    return;
  }
  const redirect: KbRedirect = {
    id: `redirect-${crypto.randomUUID()}`,
    kbId,
    fromPath,
    toPath,
    status: "active",
    createdAt: new Date().toISOString().slice(0, 10),
    reason,
  };
  if (isDatabaseEnabled()) {
    await insertRedirect(redirect);
  } else {
    const list = runtimeRedirects();
    const index = list.findIndex(
      (candidate) => candidate.kbId === kbId && candidate.fromPath === fromPath,
    );
    if (index >= 0) {
      list[index] = redirect;
    } else {
      list.push(redirect);
    }
  }
}

async function recordPublishedPathRedirects(
  kbId: string,
  before: Map<string, string[]>,
  afterPages: KbPage[],
) {
  for (const page of afterPages) {
    if (page.status !== "published") {
      continue;
    }
    const oldPath = before.get(page.id);
    if (!oldPath) {
      continue;
    }
    const oldKey = oldPath.join("/");
    const newKey = page.path.join("/");
    if (oldKey !== newKey) {
      await upsertPathRedirect(kbId, oldKey, newKey, "auto-page-move");
    }
  }
}

export type SearchResult =
  | { type: "page"; id: string; title: string; summary: string; path: string[]; kbId: string }
  | { type: "asset"; id: string; title: string; summary: string; slug: string; kbId: string };

function pageBodyText(page: KbPage): string {
  return page.blocks
    .map((block) =>
      "text" in block
        ? block.text
        : "items" in block
          ? block.items.join(" ")
          : "rows" in block
            ? block.rows.flat().join(" ")
            : "",
    )
    .join(" ");
}

function fieldScore(field: string, query: string, weights: { exact: number; prefix: number; includes: number }) {
  const value = field.trim().toLowerCase();
  if (!value) {
    return 0;
  }
  if (value === query) {
    return weights.exact;
  }
  if (value.startsWith(query)) {
    return weights.prefix;
  }
  if (value.includes(query)) {
    return weights.includes;
  }
  return 0;
}

interface ScoredResult {
  result: SearchResult;
  score: number;
}

export async function searchKb(
  kbId: string | undefined,
  query: string,
  includeStaff: boolean,
): Promise<SearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  if (isDatabaseEnabled()) {
    const sql = getSql();

    const safeTokens = normalized
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/gi, ""))
      .filter(Boolean);

    const searchTokens = safeTokens.length > 0
      ? safeTokens.map((t, i) => (i === safeTokens.length - 1 ? `${t}:*` : t)).join(" & ")
      : null;

    if (!searchTokens) return [];

    const statusFilter = includeStaff ? sql`IN ('published', 'draft')` : sql`= 'published'`;

    const kbFilterPages = kbId ? sql`AND kb_id = ${kbId}` : sql``;
    const kbFilterAssets = kbId ? sql`AND home_kb_id = ${kbId}` : sql``;

    const visibilityFilter = includeStaff 
      ? sql`` 
      : sql`AND visibility = 'public' AND NOT EXISTS (
          SELECT 1 FROM kb_pages p2 
          WHERE p2.kb_id = kb_pages.kb_id 
            AND p2.visibility = 'staff' 
            AND (kb_pages.path = p2.path OR kb_pages.path LIKE p2.path || '/%')
        )`;

    const pageRows = await sql`
      SELECT id, title, summary, path, kb_id,
             (GREATEST(
                ts_rank_cd(search_vector, to_tsquery('english', ${searchTokens})),
                ts_rank_cd(search_vector, websearch_to_tsquery('english', ${normalized}))
              ) * 1.2) AS rank
      FROM kb_pages
      WHERE (search_vector @@ to_tsquery('english', ${searchTokens}) 
             OR search_vector @@ websearch_to_tsquery('english', ${normalized}))
      AND status ${statusFilter}
      ${kbFilterPages}
      ${visibilityFilter}
      ORDER BY rank DESC
      LIMIT 20
    `;

    const assetRows = await sql`
      SELECT id, title, description as summary, slug, home_kb_id as kb_id,
             GREATEST(
               ts_rank_cd(search_vector, to_tsquery('english', ${searchTokens})),
               ts_rank_cd(search_vector, websearch_to_tsquery('english', ${normalized}))
             ) AS rank
      FROM kb_assets
      WHERE (search_vector @@ to_tsquery('english', ${searchTokens})
             OR search_vector @@ websearch_to_tsquery('english', ${normalized}))
      AND status = 'active'
      ${kbFilterAssets}
      ORDER BY rank DESC
      LIMIT 20
    `;

    const scored: ScoredResult[] = [];

    for (const row of pageRows) {
      scored.push({
        score: row.rank as number,
        result: { type: "page", id: row.id as string, title: row.title as string, summary: row.summary as string, path: (row.path as string).split("/"), kbId: row.kb_id as string },
      });
    }

    for (const row of assetRows) {
      scored.push({
        score: row.rank as number,
        result: { type: "asset", id: row.id as string, title: row.title as string, summary: row.summary as string, slug: row.slug as string, kbId: row.kb_id as string },
      });
    }

    scored.sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title));
    const results = scored.map((entry) => entry.result);
    recordSearchEvent({ query, kbId, resultCount: results.length }).catch(() => {});
    return results;
  }

  const dataset = await getDataset();
  const scored: ScoredResult[] = [];

  const pagesToSearch = kbId ? visiblePages(dataset, kbId, includeStaff) : dataset.pages.filter(p => includeStaff ? (p.status === 'published' || p.status === 'draft') : p.status === 'published');

  for (const page of pagesToSearch) {
    const titleScore = fieldScore(page.title, normalized, { exact: 100, prefix: 60, includes: 40 });
    const summaryScore = fieldScore(page.summary, normalized, { exact: 25, prefix: 25, includes: 25 });
    const bodyScore = fieldScore(pageBodyText(page), normalized, { exact: 10, prefix: 10, includes: 10 });
    const score = titleScore + summaryScore + bodyScore;
    if (score > 0) {
      scored.push({
        score,
        result: { type: "page", id: page.id, title: page.title, summary: page.summary, path: page.path, kbId: page.kbId },
      });
    }
  }

  const assetsToSearch = kbId ? dataset.assets.filter(a => a.homeKbId === kbId) : dataset.assets;

  for (const asset of assetsToSearch) {
    if (asset.status !== "active") {
      continue;
    }
    const titleScore = fieldScore(asset.title, normalized, { exact: 90, prefix: 50, includes: 30 });
    const descriptionScore = fieldScore(asset.description, normalized, { exact: 15, prefix: 15, includes: 15 });
    const slugScore = fieldScore(asset.slug, normalized, { exact: 15, prefix: 15, includes: 15 });
    const score = titleScore + descriptionScore + slugScore;
    if (score > 0) {
      scored.push({
        score,
        result: { type: "asset", id: asset.id, title: asset.title, summary: asset.description, slug: asset.slug, kbId: asset.homeKbId },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title));
  const memoryResults = scored.map((entry) => entry.result);
  recordSearchEvent({ query, kbId, resultCount: memoryResults.length }).catch(() => {});
  return memoryResults;
}

export async function getAdminCounts() {
  const dataset = await getDataset();
  return {
    publishedKbs: dataset.knowledgeBases.filter((kb) => kb.status === "published").length,
    publishedPages: dataset.pages.filter((page) => page.status === "published").length,
    draftPages: dataset.pages.filter((page) => page.status === "draft").length,
    archivedPages: dataset.pages.filter((page) => page.status === "archived").length,
    activeAssets: dataset.assets.filter((asset) => asset.status === "active").length,
    archivedAssets: dataset.assets.filter((asset) => asset.status === "archived").length,
    storageMode: isDatabaseEnabled() ? ("neon" as const) : ("in-memory" as const),
  };
}

export async function updateAssetStatus(assetId: string, status: Asset["status"]): Promise<Asset> {
  const normalizedId = normalizeRecordId(assetId);
  const dataset = await getDataset();
  const existing = dataset.assets.find((asset) => asset.id === normalizedId);
  if (!existing) {
    throw new Error("Asset not found.");
  }

  const updated: Asset = {
    ...existing,
    status,
    updatedDisplayDate: new Date().toISOString().slice(0, 10),
  };

  if (isDatabaseEnabled()) {
    await updateAssetRecord(updated);
  } else {
    const list = runtimeAssets();
    const index = list.findIndex((asset) => asset.id === normalizedId);
    if (index >= 0) {
      list[index] = updated;
    }
  }

  return updated;
}

export async function updateAssetDescription(assetId: string, description: string): Promise<Asset> {
  const normalizedId = normalizeRecordId(assetId);
  const dataset = await getDataset();
  const existing = dataset.assets.find((asset) => asset.id === normalizedId);
  if (!existing) {
    throw new Error("Asset not found.");
  }

  const updated: Asset = {
    ...existing,
    description: description.trim(),
    updatedDisplayDate: new Date().toISOString().slice(0, 10),
  };

  if (isDatabaseEnabled()) {
    await updateAssetRecord(updated);
  } else {
    const list = runtimeAssets();
    const index = list.findIndex((asset) => asset.id === normalizedId);
    if (index >= 0) {
      list[index] = updated;
    }
  }

  return updated;
}

export async function updateAssetAltText(assetId: string, altText: string): Promise<Asset> {
  const normalizedId = normalizeRecordId(assetId);
  const dataset = await getDataset();
  const existing = dataset.assets.find((asset) => asset.id === normalizedId);
  if (!existing) {
    throw new Error("Asset not found.");
  }

  const updated: Asset = {
    ...existing,
    altText: altText.trim(),
    updatedDisplayDate: new Date().toISOString().slice(0, 10),
  };

  if (isDatabaseEnabled()) {
    await updateAssetRecord(updated);
  } else {
    const list = runtimeAssets();
    const index = list.findIndex((asset) => asset.id === normalizedId);
    if (index >= 0) {
      list[index] = updated;
    }
  }

  return updated;
}

export async function permanentlyDeletePage(pageId: string): Promise<void> {
  const normalizedId = normalizeRecordId(pageId);
  if (isDatabaseEnabled()) {
    await deletePageFromDb(normalizedId);
    return;
  }
  const pages = runtimePages();
  const index = pages.findIndex((page) => page.id === normalizedId);
  if (index >= 0) {
    pages.splice(index, 1);
  }
  deletedPageIds().add(normalizedId);
}

export async function permanentlyDeleteAsset(assetId: string): Promise<void> {
  const normalizedId = normalizeRecordId(assetId);
  if (isDatabaseEnabled()) {
    await deleteAssetFromDb(normalizedId);
    return;
  }
  const assets = runtimeAssets();
  const index = assets.findIndex((asset) => asset.id === normalizedId);
  if (index >= 0) {
    assets.splice(index, 1);
  }
  runtimeVersions().delete(normalizedId);
  deletedAssetIds().add(normalizedId);
}

export async function getAllKbsForAdmin(): Promise<KnowledgeBase[]> {
  const dataset = await getDataset();
  return [...dataset.knowledgeBases].sort((a, b) => a.title.localeCompare(b.title));
}

export async function getAllPagesForAdmin(kbId: string): Promise<KbPage[]> {
  const dataset = await getDataset();
  return orderPagesForTree(dataset.pages.filter((page) => page.kbId === kbId));
}

function normalizeRecordId(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export async function getPageByIdForAdmin(pageId: string): Promise<KbPage | null> {
  const normalizedId = normalizeRecordId(pageId);
  if (isDatabaseEnabled()) {
    const fromDb = await loadPageById(normalizedId);
    if (fromDb) {
      return fromDb;
    }
  }
  const dataset = await getDataset();
  return dataset.pages.find((page) => page.id === normalizedId) ?? null;
}

export interface CreatePageInput {
  kbId: string;
  title: string;
  slug?: string;
  parentPath?: string[];
  summary?: string;
  visibility?: PageVisibility;
  status?: PageStatus;
  blocks: ContentBlock[];
  ownerLabel?: string;
  contactEmail?: string;
  sortOrder?: number;
  showToc?: boolean;
  tocDepth?: number;
  showSummary?: boolean;
}

export async function createPage(input: CreatePageInput): Promise<KbPage> {
  const dataset = await getDataset();

  const kb = dataset.knowledgeBases.find((candidate) => candidate.id === input.kbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }

  const parentPath = input.parentPath ?? [];
  if (parentPath.length > 0) {
    const parentExists = dataset.pages.some(
      (page) => page.kbId === input.kbId && page.path.join("/") === parentPath.join("/"),
    );
    if (!parentExists) {
      throw new Error("Parent page not found.");
    }
  }

  const baseSlug = slugify(input.slug?.trim() || input.title);
  assertPageSlugAllowed(baseSlug);
  const siblingSlugs = new Set(
    dataset.pages
      .filter(
        (page) =>
          page.kbId === input.kbId &&
          page.path.length === parentPath.length + 1 &&
          page.path.slice(0, -1).join("/") === parentPath.join("/"),
      )
      .map((page) => page.path[page.path.length - 1]),
  );
  let slug = baseSlug;
  let suffix = 2;
  while (siblingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const maxSiblingOrder = Math.max(
    0,
    ...dataset.pages
      .filter(
        (page) =>
          page.kbId === input.kbId &&
          page.path.length === parentPath.length + 1 &&
          page.path.slice(0, -1).join("/") === parentPath.join("/"),
      )
      .map((page) => page.sortOrder),
  );
  const page: KbPage = {
    id: `page-${crypto.randomUUID()}`,
    kbId: input.kbId,
    title: input.title.trim() || "Untitled page",
    slug,
    path: [...parentPath, slug],
    sortOrder: input.sortOrder ?? maxSiblingOrder + 10,
    summary: input.summary?.trim() ?? "",
    status: input.status ?? "draft",
    visibility: input.visibility ?? "public",
    ownerLabel: input.ownerLabel?.trim() || kb.title,
    contactEmail: input.contactEmail?.trim() ?? "",
    lastReviewedDate: today,
    updatedDisplayDate: today,
    blocks: input.blocks,
    relatedPageIds: [],
    relatedAssetIds: [],
    showToc: input.showToc ?? true,
    tocDepth: input.tocDepth ?? 3,
    showSummary: input.showSummary ?? true,
  };

  if (isDatabaseEnabled()) {
    await insertPage(page);
  } else {
    runtimePages().push(page);
  }

  return page;
}

export interface UpdatePageInput {
  pageId: string;
  title: string;
  slug?: string;
  parentPath?: string[];
  summary?: string;
  visibility?: PageVisibility;
  status?: PageStatus;
  blocks: ContentBlock[];
  sortOrder?: number;
  ownerLabel?: string;
  contactEmail?: string;
  lastReviewedDate?: string;
  showToc?: boolean;
  tocDepth?: number;
  showSummary?: boolean;
  nextReviewDate?: string | null;
}

function hasPathPrefix(path: string[], prefix: string[]) {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function storeRuntimePage(page: KbPage) {
  const pages = runtimePages();
  const existingIndex = pages.findIndex((candidate) => candidate.id === page.id);
  if (existingIndex >= 0) {
    pages[existingIndex] = page;
  } else {
    pages.push(page);
  }
}

export async function updatePage(input: UpdatePageInput, editorEmail?: string): Promise<KbPage> {
  const dataset = await getDataset();
  const existing = dataset.pages.find((page) => page.id === input.pageId);
  if (!existing) {
    throw new Error("Page not found.");
  }

  const kb = dataset.knowledgeBases.find((candidate) => candidate.id === existing.kbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }

  const oldPath = existing.path;
  const pathBefore = new Map(dataset.pages.map((page) => [page.id, [...page.path]]));
  const parentPath = input.parentPath ?? oldPath.slice(0, -1);
  if (parentPath.length > 0) {
    if (hasPathPrefix(parentPath, oldPath)) {
      throw new Error("A page cannot be nested under itself or one of its child pages.");
    }
    const parentExists = dataset.pages.some(
      (page) => page.kbId === existing.kbId && page.path.join("/") === parentPath.join("/"),
    );
    if (!parentExists) {
      throw new Error("Parent page not found.");
    }
  }

  const baseSlug = slugify(input.slug?.trim() || input.title);
  assertPageSlugAllowed(baseSlug);
  const siblingSlugs = new Set(
    dataset.pages
      .filter(
        (page) =>
          page.id !== existing.id &&
          page.kbId === existing.kbId &&
          page.path.length === parentPath.length + 1 &&
          page.path.slice(0, -1).join("/") === parentPath.join("/"),
      )
      .map((page) => page.path[page.path.length - 1]),
  );
  let slug = baseSlug;
  let suffix = 2;
  while (siblingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const newPath = [...parentPath, slug];
  const changedPages = dataset.pages
    .filter((page) => page.kbId === existing.kbId && hasPathPrefix(page.path, oldPath))
    .map((page) => {
      const pathSuffix = page.path.slice(oldPath.length);
      if (page.id === existing.id) {
        return {
          ...page,
          title: input.title.trim() || "Untitled page",
          slug,
          path: newPath,
          sortOrder: input.sortOrder ?? page.sortOrder,
          summary: input.summary?.trim() ?? "",
          status: input.status ?? page.status,
          visibility: input.visibility ?? page.visibility,
          ownerLabel: input.ownerLabel?.trim() ?? page.ownerLabel,
          contactEmail: input.contactEmail?.trim() ?? page.contactEmail,
          lastReviewedDate: input.lastReviewedDate?.trim() || page.lastReviewedDate,
          updatedDisplayDate: today,
          blocks: input.blocks,
          showToc: input.showToc ?? page.showToc,
          tocDepth: input.tocDepth ?? page.tocDepth,
          showSummary: input.showSummary ?? page.showSummary,
          nextReviewDate: input.nextReviewDate ?? page.nextReviewDate,
        };
      }
      return {
        ...page,
        path: [...newPath, ...pathSuffix],
      };
    });

  if (isDatabaseEnabled()) {

    await updatePages(changedPages, editorEmail);
  } else {
    changedPages.forEach(storeRuntimePage);
  }

  await recordPublishedPathRedirects(existing.kbId, pathBefore, changedPages);

  const updated = changedPages.find((page) => page.id === existing.id);
  if (!updated) {
    throw new Error("Could not update page.");
  }
  return updated;
}

export async function updatePageStatus(pageId: string, status: PageStatus): Promise<KbPage> {
  const existing = await getPageByIdForAdmin(normalizeRecordId(pageId));
  if (!existing) {
    throw new Error("Page not found.");
  }

  const updated: KbPage = {
    ...existing,
    status,
    updatedDisplayDate: new Date().toISOString().slice(0, 10),
  };

  if (isDatabaseEnabled()) {

    await updatePageStatusColumn(existing.id, updated.status, updated.updatedDisplayDate);
  } else {
    storeRuntimePage(updated);
  }

  return updated;
}

export interface PageLayoutItem {
  pageId: string;
  parentPath: string[];
  sortOrder: number;
}

export async function updatePageLayout(
  kbId: string,
  items: PageLayoutItem[],
  editorEmail?: string,
): Promise<void> {
  const dataset = await getDataset();
  const pages = dataset.pages.filter((page) => page.kbId === kbId);
  const itemByPageId = new Map(items.map((item) => [item.pageId, item]));
  const changedRoots = pages.filter((page) => itemByPageId.has(page.id));

  const nextById = new Map(pages.map((page) => [page.id, { ...page }]));
  const pathBefore = new Map(pages.map((page) => [page.id, [...page.path]]));

  for (const page of changedRoots) {
    const item = itemByPageId.get(page.id)!;
    if (item.parentPath.length > 0 && hasPathPrefix(item.parentPath, page.path)) {
      throw new Error("A page cannot be nested under itself or one of its child pages.");
    }
    if (item.parentPath.length > 0) {
      const parentExists = pages.some(
        (candidate) => candidate.path.join("/") === item.parentPath.join("/"),
      );
      if (!parentExists) {
        throw new Error("Parent page not found.");
      }
    }
    const next = nextById.get(page.id)!;
    next.path = [...item.parentPath, page.slug];
    next.sortOrder = item.sortOrder;
  }

  const changed: KbPage[] = [];
  for (const root of changedRoots) {
    const oldPath = pathBefore.get(root.id)!;
    const nextRoot = nextById.get(root.id)!;
    for (const page of pages) {
      if (page.id === root.id || !hasPathPrefix(page.path, oldPath) || page.path.length <= oldPath.length) {
        continue;
      }
      if (itemByPageId.has(page.id)) {
        continue;
      }
      const descendant = nextById.get(page.id)!;
      descendant.path = [...nextRoot.path, ...page.path.slice(oldPath.length)];
    }
  }

  for (const next of nextById.values()) {
    const oldPath = pathBefore.get(next.id);
    const orderChanged = next.sortOrder !== pages.find((page) => page.id === next.id)?.sortOrder;
    if (!oldPath || oldPath.join("/") !== next.path.join("/") || orderChanged) {
      changed.push(next);
    }
  }

  if (isDatabaseEnabled()) {

    await updatePages(changed, editorEmail);
  } else {
    changed.forEach(storeRuntimePage);
  }

  await recordPublishedPathRedirects(kbId, pathBefore, changed);
}

export async function verifyPage(
  page: KbPage,
  verifier: string,
): Promise<{ verifiedAt: string; verifiedBy: string; nextReviewDate: string }> {
  const now = new Date();
  const nextReview = new Date();
  nextReview.setMonth(now.getMonth() + 6);

  const verifiedAt = now.toISOString();
  const verifiedBy = verifier;
  const nextReviewDate = nextReview.toISOString().split("T")[0];

  if (isDatabaseEnabled()) {
    await updatePageLifecycle(page.id, { verifiedAt, verifiedBy, nextReviewDate });
  } else {
    storeRuntimePage({ ...page, verifiedAt, verifiedBy, nextReviewDate });
  }

  return { verifiedAt, verifiedBy, nextReviewDate };
}

function normalizeRedirectPath(path: string) {
  return path
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export async function getRedirectsForAdmin(kbId: string): Promise<KbRedirect[]> {
  const rows = isDatabaseEnabled()
    ? await loadRedirectsForKb(kbId)
    : runtimeRedirects().filter((redirect) => redirect.kbId === kbId);
  return rows
    .filter((redirect) => redirect.status === "active")
    .sort((a, b) => a.fromPath.localeCompare(b.fromPath));
}

export interface CreateRedirectInput {
  kbId: string;
  fromPath: string;
  toPath: string;
  reason?: string;
}

export async function upsertManualRedirect(input: CreateRedirectInput): Promise<KbRedirect> {
  const fromPath = normalizeRedirectPath(input.fromPath);
  const toPath = normalizeRedirectPath(input.toPath);
  if (!fromPath || !toPath) {
    throw new Error("From and to paths are required.");
  }
  if (fromPath === toPath) {
    throw new Error("From and to paths must be different.");
  }

  const redirect: KbRedirect = {
    id: `redirect-${crypto.randomUUID()}`,
    kbId: input.kbId,
    fromPath,
    toPath,
    status: "active",
    createdAt: new Date().toISOString().slice(0, 10),
    reason: input.reason?.trim() || "manual",
  };

  if (isDatabaseEnabled()) {
    await insertRedirect(redirect);
  } else {
    const list = runtimeRedirects();
    const index = list.findIndex(
      (candidate) => candidate.kbId === input.kbId && candidate.fromPath === fromPath,
    );
    if (index >= 0) {
      list[index] = redirect;
    } else {
      list.push(redirect);
    }
  }
  return redirect;
}

export async function getRedirectById(redirectId: string): Promise<KbRedirect | null> {
  if (isDatabaseEnabled()) {
    const dataset = await getDataset();
    for (const kb of dataset.knowledgeBases) {
      const rows = await loadRedirectsForKb(kb.id);
      const found = rows.find((row) => row.id === redirectId);
      if (found) {
        return found;
      }
    }
    return null;
  }
  return runtimeRedirects().find((row) => row.id === redirectId) ?? null;
}

export async function deactivateRedirect(redirectId: string): Promise<void> {
  const redirect = await getRedirectById(redirectId);
  if (!redirect) {
    throw new Error("Redirect not found.");
  }
  const inactive: KbRedirect = { ...redirect, status: "inactive" };
  if (isDatabaseEnabled()) {
    await insertRedirect(inactive);
  } else {
    const list = runtimeRedirects();
    const index = list.findIndex((row) => row.id === redirectId);
    if (index >= 0) {
      list[index] = inactive;
    }
  }
}

export async function removeRedirect(redirectId: string): Promise<void> {
  if (isDatabaseEnabled()) {
    await deleteRedirectById(redirectId);
    return;
  }
  const list = runtimeRedirects();
  const index = list.findIndex((row) => row.id === redirectId);
  if (index >= 0) {
    list.splice(index, 1);
  }
}
