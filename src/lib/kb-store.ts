import { cache } from "react";
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
  updateAssetRecord,
  updatePages,
  getSql,
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

/**
 * Pages created at runtime when no database is configured. Stored on globalThis
 * so they are shared across route bundles within a single server process (each
 * Next.js route is its own module instance). This makes the no-DB fallback
 * usable for local development; production should set DATABASE_URL (Neon).
 */
const globalForRuntime = globalThis as unknown as {
  __kbRuntimeAssets?: Asset[];
  __kbRuntimePages?: KbPage[];
  __kbRuntimeVersions?: Map<string, AssetVersion[]>;
  __kbRuntimeRedirects?: KbRedirect[];
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

/** Merge in-memory pages/assets created on this instance into a DB-backed dataset. */
function mergeRuntimeIntoDataset(dbDataset: KbDataset): KbDataset {
  const extraPages = runtimePages();
  const extraAssets = runtimeAssets();
  if (extraPages.length === 0 && extraAssets.length === 0) {
    return dbDataset;
  }
  const pageOverrides = new Map(extraPages.map((page) => [page.id, page]));
  const seedPageIds = new Set(dbDataset.pages.map((page) => page.id));
  const seedAssetIds = new Set(dbDataset.assets.map((asset) => asset.id));
  return {
    knowledgeBases: dbDataset.knowledgeBases,
    pages: [
      ...dbDataset.pages.map((page) => pageOverrides.get(page.id) ?? page),
      ...extraPages.filter((page) => !seedPageIds.has(page.id)),
    ],
    assets: [
      ...dbDataset.assets,
      ...extraAssets.filter((asset) => !seedAssetIds.has(asset.id)),
    ],
  };
}

/**
 * Single source of truth for reading KB content. Uses Neon when DATABASE_URL is
 * configured, otherwise the in-memory seed dataset. Cached per request render.
 */
const getDataset = cache(async (): Promise<KbDataset> => {
  if (isDatabaseEnabled()) {
    return mergeRuntimeIntoDataset(await loadDatasetFromDb());
  }
  const extra = runtimePages();
  const extraAssets = runtimeAssets();
  if (extra.length === 0 && extraAssets.length === 0) {
    return seedDataset;
  }
  const pageOverrides = new Map(extra.map((page) => [page.id, page]));
  return {
    knowledgeBases: seedDataset.knowledgeBases,
    pages: [
      ...seedDataset.pages.map((page) => pageOverrides.get(page.id) ?? page),
      ...extra.filter((page) => !seedDataset.pages.some((seedPage) => seedPage.id === page.id)),
    ],
    assets: [...seedDataset.assets, ...extraAssets],
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
  // A page is staff-only if it, or any ancestor in its path, is marked "staff".
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

/**
 * Pages a viewer may see. Public visitors get published, public pages only.
 * Staff (signed-in admins) additionally see drafts and staff-only pages so they
 * can preview imported content before publishing.
 */
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

/** Status of an asset by id (any status), or null if it does not exist. */
export async function getAssetStatusById(assetId: string): Promise<string | null> {
  const dataset = await getDataset();
  return dataset.assets.find((asset) => asset.id === assetId)?.status ?? null;
}

/**
 * Every place an asset is used across pages, for impact review before replacing
 * or archiving it (project_spec.md §11). Reads current page content.
 */
export async function getAssetUsages(assetId: string): Promise<AssetUsage[]> {
  const dataset = await getDataset();
  return extractAssetUsages(dataset.pages, assetId);
}

/**
 * Resolve an active asset including its `body` for the stable file route. Unlike
 * `getAssetBySlug`, this loads the (potentially large) body, so it must only be
 * used by the streaming delivery route — not by list/render paths.
 */
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

/**
 * Score a field match. Exact equality and prefix matches rank above a plain
 * substring hit so the most relevant results surface first (project_spec.md §14).
 */
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

/**
 * KB-scoped search with simple relevance ranking. Until Postgres FTS + aliases
 * land (project_spec.md §14), this ranks current titles highest, then summaries,
 * then body and asset metadata. Results are deduped by record and sorted by score.
 */
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
    
    // 1. Safe Tokenization for FTS: prevent syntax errors from characters like &, |, :, !
    // We reduce each token to alphanumerics and drop empties. The last token gets :*
    // for robust type-ahead behavior.
    const safeTokens = normalized
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/gi, ""))
      .filter(Boolean);

    const searchTokens = safeTokens.length > 0
      ? safeTokens.map((t, i) => (i === safeTokens.length - 1 ? `${t}:*` : t)).join(" & ")
      : null;

    if (!searchTokens) return [];

    const statusFilter = includeStaff ? sql`IN ('published', 'draft')` : sql`= 'published'`;
    
    // Global search or scoped
    const kbFilterPages = kbId ? sql`AND kb_id = ${kbId}` : sql``;
    const kbFilterAssets = kbId ? sql`AND home_kb_id = ${kbId}` : sql``;

    // Visibility filter: Public users should not see pages where they or any ancestor is 'staff'
    // We use a trailing slash check to ensure slug boundaries (e.g. /admin vs /administration)
    const visibilityFilter = includeStaff 
      ? sql`` 
      : sql`AND visibility = 'public' AND NOT EXISTS (
          SELECT 1 FROM kb_pages p2 
          WHERE p2.kb_id = kb_pages.kb_id 
            AND p2.visibility = 'staff' 
            AND (kb_pages.path = p2.path OR kb_pages.path LIKE p2.path || '/%')
        )`;

    // FTS query for pages: OR the prefix query with the natural websearch query
    // and take the greatest rank. We bias pages by 1.2x.
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

    // FTS query for assets
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
    
    // For global search, we need to prefix the result with the KB it belongs to
    // or just return the standard result. The UI handles routing.
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
    return scored.map((entry) => entry.result);
  }

  // Fallback to in-memory ranking
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
  return scored.map((entry) => entry.result);
}

/** Admin dashboard counts (published pages / active assets across all KBs). */
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

/** Update an asset's human description (e.g. saving an image's alt text centrally). */
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

/** All knowledge bases (including drafts) for admin tooling. */
export async function getAllKbsForAdmin(): Promise<KnowledgeBase[]> {
  const dataset = await getDataset();
  return [...dataset.knowledgeBases].sort((a, b) => a.title.localeCompare(b.title));
}

/** All pages for a KB (any status) for admin parent-selection. */
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
}

/**
 * Create a new page and persist it (Neon when configured, otherwise the
 * in-memory dataset). The slug is made unique among its siblings so the page
 * slots cleanly into the nested site navigation under the chosen parent.
 */
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

/**
 * Update a page, optionally moving it under a new parent. Moving a page cascades
 * path changes to descendants so the public tree remains connected.
 */
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
        };
      }
      return {
        ...page,
        path: [...newPath, ...pathSuffix],
      };
    });

  if (isDatabaseEnabled()) {
    // Pass editorEmail so the DB write enforces the edit lock: the row is only
    // updated when the lock is free, owned by this editor, or expired. A dropped
    // or expired lock makes updatePages throw rather than silently overwrite a
    // concurrent editor's changes.
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
    await updatePages([updated]);
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

/**
 * Reorder and re-nest a set of pages. Each changed root page cascades path
 * changes to descendants. This powers the admin page-tree drag/drop manager.
 */
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
    // Enforce edit locks: a reorder re-paths pages, so refuse to move any page
    // another editor currently holds a lock on (their unexpired lock fails the
    // WHERE clause and updatePages throws). Pages with no active lock pass freely.
    await updatePages(changed, editorEmail);
  } else {
    changed.forEach(storeRuntimePage);
  }

  await recordPublishedPathRedirects(kbId, pathBefore, changed);
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

export async function deactivateRedirect(redirectId: string): Promise<void> {
  const dataset = await getDataset();
  let redirect: KbRedirect | undefined;
  if (isDatabaseEnabled()) {
    const kbs = dataset.knowledgeBases;
    for (const kb of kbs) {
      const rows = await loadRedirectsForKb(kb.id);
      redirect = rows.find((row) => row.id === redirectId);
      if (redirect) {
        break;
      }
    }
  } else {
    redirect = runtimeRedirects().find((row) => row.id === redirectId);
  }
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
