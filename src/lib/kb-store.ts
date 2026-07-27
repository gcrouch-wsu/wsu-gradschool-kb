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
  loadAssetByIdFromDb,
  loadAssetBySlugFromDb,
  loadAssetForDelivery,
  loadAssetsForKbFromDb,
  loadDatasetFromDb,
  loadKnowledgeBaseByIdFromDb,
  loadKnowledgeBaseBySlugFromDb,
  loadKnowledgeBasesFromDb,
  loadPageById,
  loadPageByPathFromDb,
  loadPagesForKbFromDb,
  loadPagesForKbWithoutBlocksFromDb,
  loadVersionsForAsset,
  replaceVersionsForAsset,
  deleteAsset as deleteAssetFromDb,
  deletePage as deletePageFromDb,
  getSql,
  updateAssetRecord,
  updateKbHomepagePageId,
  updateKbRequireSummary,
  updateKbAiPrompts,
  updatePages,
  updatePageStatusColumn,
  updatePageLifecycle,
  listPageRevisionsFromDb,
  getPageRevisionFromDb,
  cleanupPageRevisionsInDb,
  cleanupPageRevisionsForPageInDb,
  type PageRevisionWrite,
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
import { isStaffVisiblePageStatus } from "@/lib/page-status";
import { rewriteKbLinksInBlocks } from "@/lib/kb-link-rewrite";
import {
  formatAssetTagsForSearch,
  formatPageTagsForSearch,
  normalizeAssetTags,
  normalizePageTags,
} from "@/lib/page-tags";
import { expandSearchQueryWithSynonyms } from "@/lib/search-synonyms";
import { rankFuzzyCandidates } from "@/lib/search-fuzzy";
import { loadSiteSettings } from "@/lib/db";
import type {
  Asset,
  AssetUsage,
  AssetVersion,
  ContentBlock,
  KbDataset,
  KbPage,
  KbRedirect,
  KnowledgeBase,
  PageRevision,
  PageRevisionAction,
  PageRevisionSnapshot,
  PageRevisionSummary,
  PageNodeKind,
  PageStatus,
  PageTreeNode,
  PageVisibility,
} from "@/lib/types";

const globalForRuntime = globalThis as unknown as {
  __kbRuntimeAssets?: Asset[];
  __kbRuntimePages?: KbPage[];
  __kbRuntimeVersions?: Map<string, AssetVersion[]>;
  __kbRuntimeRedirects?: KbRedirect[];
  __kbRuntimeKbHomepages?: Map<string, string | null>;
  __kbRuntimeKbRequireSummary?: Map<string, boolean>;
  __kbRuntimeKbAiPrompts?: Map<string, { aiSummaryPrompt: string; aiPagePrompt: string }>;
  __kbRuntimePageRevisions?: PageRevision[];
  __kbDeletedAssetIds?: Set<string>;
  __kbDeletedPageIds?: Set<string>;
};

function runtimePageRevisions(): PageRevision[] {
  if (!globalForRuntime.__kbRuntimePageRevisions) {
    globalForRuntime.__kbRuntimePageRevisions = [];
  }
  return globalForRuntime.__kbRuntimePageRevisions;
}

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

function runtimeKbHomepages(): Map<string, string | null> {
  if (!globalForRuntime.__kbRuntimeKbHomepages) {
    globalForRuntime.__kbRuntimeKbHomepages = new Map();
  }
  return globalForRuntime.__kbRuntimeKbHomepages;
}

function runtimeKbRequireSummary(): Map<string, boolean> {
  if (!globalForRuntime.__kbRuntimeKbRequireSummary) {
    globalForRuntime.__kbRuntimeKbRequireSummary = new Map();
  }
  return globalForRuntime.__kbRuntimeKbRequireSummary;
}

function runtimeKbAiPrompts(): Map<string, { aiSummaryPrompt: string; aiPagePrompt: string }> {
  if (!globalForRuntime.__kbRuntimeKbAiPrompts) {
    globalForRuntime.__kbRuntimeKbAiPrompts = new Map();
  }
  return globalForRuntime.__kbRuntimeKbAiPrompts;
}

function applyKbRuntimeOverrides(kbs: KnowledgeBase[]): KnowledgeBase[] {
  const homepageOverrides = runtimeKbHomepages();
  const requireSummaryOverrides = runtimeKbRequireSummary();
  const aiPromptOverrides = runtimeKbAiPrompts();
  if (
    homepageOverrides.size === 0 &&
    requireSummaryOverrides.size === 0 &&
    aiPromptOverrides.size === 0
  ) {
    return kbs;
  }
  return kbs.map((kb) => {
    let next = kb;
    if (homepageOverrides.has(kb.id)) {
      next = { ...next, homepagePageId: homepageOverrides.get(kb.id) ?? null };
    }
    if (requireSummaryOverrides.has(kb.id)) {
      next = { ...next, requireSummary: requireSummaryOverrides.get(kb.id) !== false };
    }
    if (aiPromptOverrides.has(kb.id)) {
      const prompts = aiPromptOverrides.get(kb.id)!;
      next = {
        ...next,
        aiSummaryPrompt: prompts.aiSummaryPrompt,
        aiPagePrompt: prompts.aiPagePrompt,
      };
    }
    return next;
  });
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
  const homepageOverrides = runtimeKbHomepages();
  const requireSummaryOverrides = runtimeKbRequireSummary();
  const aiPromptOverrides = runtimeKbAiPrompts();
  const deletedPages = deletedPageIds();
  const deletedAssets = deletedAssetIds();
  if (
    extraPages.length === 0 &&
    extraAssets.length === 0 &&
    homepageOverrides.size === 0 &&
    requireSummaryOverrides.size === 0 &&
    aiPromptOverrides.size === 0 &&
    deletedPages.size === 0 &&
    deletedAssets.size === 0
  ) {
    return dbDataset;
  }
  const pageOverrides = new Map(extraPages.map((page) => [page.id, page]));
  const seedPageIds = new Set(dbDataset.pages.map((page) => page.id));
  const seedAssetIds = new Set(dbDataset.assets.map((asset) => asset.id));
  return {
    knowledgeBases: applyKbRuntimeOverrides(dbDataset.knowledgeBases),
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
  const homepageOverrides = runtimeKbHomepages();
  const requireSummaryOverrides = runtimeKbRequireSummary();
  const aiPromptOverrides = runtimeKbAiPrompts();
  const deletedPages = deletedPageIds();
  const deletedAssets = deletedAssetIds();
  if (
    extra.length === 0 &&
    extraAssets.length === 0 &&
    homepageOverrides.size === 0 &&
    requireSummaryOverrides.size === 0 &&
    aiPromptOverrides.size === 0 &&
    deletedPages.size === 0 &&
    deletedAssets.size === 0
  ) {
    return seedDataset;
  }
  const pageOverrides = new Map(extra.map((page) => [page.id, page]));
  return {
    knowledgeBases: applyKbRuntimeOverrides(seedDataset.knowledgeBases),
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

const getDbKnowledgeBases = cache(loadKnowledgeBasesFromDb);
const getDbKnowledgeBaseBySlug = cache(loadKnowledgeBaseBySlugFromDb);
const getDbKnowledgeBaseById = cache(loadKnowledgeBaseByIdFromDb);
const getDbPageById = cache(loadPageById);
const getDbPageByPath = cache(loadPageByPathFromDb);
const getDbPagesForKb = cache(loadPagesForKbFromDb);
const getDbPageSummariesForKb = cache(loadPagesForKbWithoutBlocksFromDb);
const getDbAssetById = cache(loadAssetByIdFromDb);
const getDbAssetBySlug = cache(loadAssetBySlugFromDb);
const getDbAssetsForKb = cache(loadAssetsForKbFromDb);

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
      (page) => page.kbId === kbId && isStaffVisiblePageStatus(page.status),
    );
  }
  const published = publishedPages(dataset, kbId);
  return published.filter((page) => !isStaffOnly(published, page));
}

function visiblePageList(pages: KbPage[], kbId: string, includeStaff: boolean) {
  return visiblePages({ knowledgeBases: [], pages, assets: [] }, kbId, includeStaff);
}

function buildTreeFromPages(visible: KbPage[]): PageTreeNode[] {
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

export async function getPublishedKbs(): Promise<KnowledgeBase[]> {
  if (isDatabaseEnabled()) {
    return (await getDbKnowledgeBases()).filter((kb) => kb.status === "published");
  }
  const dataset = await getDataset();
  return dataset.knowledgeBases.filter((kb) => kb.status === "published");
}

export async function getKbBySlug(slug: string, includeUnpublished = false): Promise<KnowledgeBase | null> {
  if (isDatabaseEnabled()) {
    return getDbKnowledgeBaseBySlug(slug, includeUnpublished);
  }
  const dataset = await getDataset();
  return (
    dataset.knowledgeBases.find(
      (kb) => kb.slug === slug && (includeUnpublished || kb.status === "published"),
    ) ?? null
  );
}

export async function getKbById(id: string): Promise<KnowledgeBase | null> {
  if (isDatabaseEnabled()) {
    return getDbKnowledgeBaseById(id);
  }
  const dataset = await getDataset();
  return dataset.knowledgeBases.find((kb) => kb.id === id) ?? null;
}

export async function getKbHomepagePage(kbId: string, includeStaff: boolean): Promise<KbPage | null> {
  if (isDatabaseEnabled()) {
    const kb = await getDbKnowledgeBaseById(kbId);
    if (!kb?.homepagePageId) {
      return null;
    }
    const page = await getDbPageById(kb.homepagePageId);
    if (!page || page.kbId !== kbId) {
      return null;
    }
    if (includeStaff) {
      return isStaffVisiblePageStatus(page.status) ? page : null;
    }
    if (page.status !== "published") {
      return null;
    }
    const summaries = await getDbPageSummariesForKb(kbId);
    const published = summaries.filter((candidate) => candidate.status === "published");
    const summaryPage = published.find((candidate) => candidate.id === page.id) ?? page;
    return isStaffOnly(published, summaryPage) ? null : page;
  }
  const dataset = await getDataset();
  const kb = dataset.knowledgeBases.find((candidate) => candidate.id === kbId);
  if (!kb?.homepagePageId) {
    return null;
  }
  return visiblePages(dataset, kbId, includeStaff).find((page) => page.id === kb.homepagePageId) ?? null;
}

export async function setKbHomepagePage(kbId: string, pageId: string | null): Promise<KnowledgeBase> {
  const normalizedPageId = pageId ? normalizeRecordId(pageId) : null;
  const dataset = await getDataset();
  const kb = dataset.knowledgeBases.find((candidate) => candidate.id === kbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }

  if (normalizedPageId) {
    const page = dataset.pages.find((candidate) => candidate.id === normalizedPageId);
    if (!page || page.kbId !== kbId) {
      throw new Error("Homepage page must belong to this knowledge base.");
    }
    if (page.status === "archived") {
      throw new Error("Archived pages cannot be used as a knowledge base homepage.");
    }
    if ((page.nodeKind ?? "page") !== "page") {
      throw new Error("Group headings and links cannot be used as a knowledge base homepage.");
    }
  }

  const updated: KnowledgeBase = {
    ...kb,
    homepagePageId: normalizedPageId,
    updatedOn: new Date().toISOString().slice(0, 10),
  };

  if (isDatabaseEnabled()) {
    await updateKbHomepagePageId(kbId, normalizedPageId);
  } else {
    runtimeKbHomepages().set(kbId, normalizedPageId);
  }

  return updated;
}

export async function setKbRequireSummary(kbId: string, requireSummary: boolean): Promise<KnowledgeBase> {
  const dataset = await getDataset();
  const kb = dataset.knowledgeBases.find((candidate) => candidate.id === kbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }

  const updated: KnowledgeBase = {
    ...kb,
    requireSummary,
    updatedOn: new Date().toISOString().slice(0, 10),
  };

  if (isDatabaseEnabled()) {
    await updateKbRequireSummary(kbId, requireSummary);
  } else {
    runtimeKbRequireSummary().set(kbId, requireSummary);
  }

  return updated;
}

export async function setKbAiPrompts(
  kbId: string,
  prompts: { aiSummaryPrompt: string; aiPagePrompt: string },
): Promise<KnowledgeBase> {
  const dataset = await getDataset();
  const kb = dataset.knowledgeBases.find((candidate) => candidate.id === kbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }

  const aiSummaryPrompt = prompts.aiSummaryPrompt.trim().slice(0, 8_000);
  const aiPagePrompt = prompts.aiPagePrompt.trim().slice(0, 8_000);
  const updated: KnowledgeBase = {
    ...kb,
    aiSummaryPrompt,
    aiPagePrompt,
    updatedOn: new Date().toISOString().slice(0, 10),
  };

  if (isDatabaseEnabled()) {
    await updateKbAiPrompts(kbId, { aiSummaryPrompt, aiPagePrompt });
  } else {
    runtimeKbAiPrompts().set(kbId, { aiSummaryPrompt, aiPagePrompt });
  }

  return updated;
}

export async function getVisiblePagesForKb(kbId: string, includeStaff: boolean): Promise<KbPage[]> {
  if (isDatabaseEnabled()) {
    return visiblePageList(await getDbPagesForKb(kbId), kbId, includeStaff);
  }
  const dataset = await getDataset();
  return visiblePages(dataset, kbId, includeStaff);
}

export async function buildPageTree(kbId: string, includeStaff: boolean): Promise<PageTreeNode[]> {
  if (isDatabaseEnabled()) {
    return buildTreeFromPages(visiblePageList(await getDbPageSummariesForKb(kbId), kbId, includeStaff));
  }
  const dataset = await getDataset();
  const visible = visiblePages(dataset, kbId, includeStaff);
  return buildTreeFromPages(visible);
}

export async function getBreadcrumbs(
  kbId: string,
  path: string[],
  includeStaff: boolean,
): Promise<KbPage[]> {
  const visible = isDatabaseEnabled()
    ? visiblePageList(await getDbPageSummariesForKb(kbId), kbId, includeStaff)
    : visiblePages(await getDataset(), kbId, includeStaff);
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
  if (isDatabaseEnabled()) {
    const page = await getDbPageByPath(kbId, path);
    if (!page) {
      return null;
    }
    if (includeStaff) {
      return isStaffVisiblePageStatus(page.status) ? page : null;
    }
    if (page.status !== "published") {
      return null;
    }
    const summaries = await getDbPageSummariesForKb(kbId);
    const published = summaries.filter((candidate) => candidate.status === "published");
    const summaryPage = published.find((candidate) => candidate.id === page.id) ?? page;
    return isStaffOnly(published, summaryPage) ? null : page;
  }
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
  if (isDatabaseEnabled()) {
    const asset = await getDbAssetBySlug(homeKbId, slug);
    return asset?.status === "active" ? asset : null;
  }
  const dataset = await getDataset();
  return (
    dataset.assets.find(
      (asset) => asset.homeKbId === homeKbId && asset.slug === slug && asset.status === "active",
    ) ?? null
  );
}

export async function getAssetById(assetId: string): Promise<Asset | null> {
  if (isDatabaseEnabled()) {
    const asset = await getDbAssetById(assetId);
    return asset?.status === "active" ? asset : null;
  }
  const dataset = await getDataset();
  return dataset.assets.find((asset) => asset.id === assetId && asset.status === "active") ?? null;
}

export async function getAssetStatusById(assetId: string): Promise<string | null> {
  if (isDatabaseEnabled()) {
    return (await getDbAssetById(assetId))?.status ?? null;
  }
  const dataset = await getDataset();
  return dataset.assets.find((asset) => asset.id === assetId)?.status ?? null;
}

export async function getAssetHomeKbId(assetId: string): Promise<string | null> {
  if (isDatabaseEnabled()) {
    return (await getDbAssetById(normalizeRecordId(assetId)))?.homeKbId ?? null;
  }
  const dataset = await getDataset();
  return dataset.assets.find((asset) => asset.id === normalizeRecordId(assetId))?.homeKbId ?? null;
}

export async function getAssetUsages(assetId: string): Promise<AssetUsage[]> {
  const normalizedId = normalizeRecordId(assetId);
  if (isDatabaseEnabled()) {
    const { listIndexedUsagesForAsset } = await import("@/lib/asset-usages");
    const indexed = await listIndexedUsagesForAsset(normalizedId);
    if (indexed && indexed.length > 0) {
      return indexed;
    }
    // Fall back to a live scan when the index is empty (e.g. pre-migration pages).
    const asset = await getDbAssetById(normalizedId);
    if (!asset) {
      return [];
    }
    return extractAssetUsages(await getDbPagesForKb(asset.homeKbId), normalizedId);
  }
  const dataset = await getDataset();
  return extractAssetUsages(dataset.pages, normalizedId);
}

export interface ExcerptReference {
  pageId: string;
  pageTitle: string;
  kbId: string;
}

// Pages (in any KB) whose top-level excerpt blocks reference the given source
// page. Mirrors the asset-usage SQL probe: excerpts are top-level blocks by
// the serializer contract, so jsonb_array_elements over blocks is exact.
export async function getExcerptReferencesToPage(sourcePageId: string): Promise<ExcerptReference[]> {
  const normalizedId = normalizeRecordId(sourcePageId);
  if (isDatabaseEnabled()) {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, title, kb_id
      FROM kb_pages
      WHERE id <> ${normalizedId}
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(kb_pages.blocks) AS block
          WHERE block.value->>'type' = 'excerpt'
            AND block.value->>'sourcePageId' = ${normalizedId}
        )
      ORDER BY title
      LIMIT 10
    `) as unknown as Array<{ id: string; title: string; kb_id: string }>;
    return rows.map((row) => ({ pageId: row.id, pageTitle: row.title, kbId: row.kb_id }));
  }
  const dataset = await getDataset();
  return dataset.pages
    .filter(
      (page) =>
        page.id !== normalizedId &&
        page.blocks.some((block) => block.type === "excerpt" && block.sourcePageId === normalizedId),
    )
    .map((page) => ({ pageId: page.id, pageTitle: page.title, kbId: page.kbId }));
}

export async function assetHasPublicPublishedUsage(asset: Asset): Promise<boolean> {
  if (isDatabaseEnabled()) {
    const sql = getSql();
    // Selected-text document links store data-asset-id inside rich-text HTML (nested in
    // blocks JSON). Match both escaped JSON and plain attribute forms.
    const dataAssetAttr = `%data-asset-id="${asset.id}"%`;
    const dataAssetAttrEscaped = `%data-asset-id=\\"${asset.id}\\"%`;
    const rows = (await sql`
      SELECT 1
      FROM kb_pages
      WHERE kb_pages.kb_id = ${asset.homeKbId}
        AND kb_pages.status = 'published'
        AND kb_pages.visibility = 'public'
        AND (
          kb_pages.related_asset_ids @> ${JSON.stringify([asset.id])}::jsonb
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(kb_pages.blocks) AS block
            WHERE block.value->>'type' IN ('image', 'asset_link')
              AND block.value->>'assetId' = ${asset.id}
          )
          OR kb_pages.blocks::text LIKE ${dataAssetAttr}
          OR kb_pages.blocks::text LIKE ${dataAssetAttrEscaped}
        )
        AND NOT EXISTS (
          SELECT 1 FROM kb_pages p2
          WHERE p2.kb_id = kb_pages.kb_id
            AND p2.visibility = 'staff'
            AND p2.status = 'published'
            AND (kb_pages.path = p2.path OR kb_pages.path LIKE p2.path || '/%')
        )
      LIMIT 1
    `) as unknown as unknown[];
    return rows.length > 0;
  }
  const pages = (await getDataset()).pages.filter((page) => page.kbId === asset.homeKbId);
  const published = pages.filter((page) => page.status === "published");
  if (published.length === 0) {
    return false;
  }
  const pageById = new Map(published.map((page) => [page.id, page]));
  return extractAssetUsages(published, asset.id).some((usage) => {
    const page = pageById.get(usage.pageId);
    return Boolean(page && !isStaffOnly(published, page));
  });
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
  tags?: unknown;

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
  tags?: unknown;
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
    tags: normalizeAssetTags(input.tags),
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
  if (isDatabaseEnabled()) {
    return (await getDbAssetsForKb(kbId)).sort((a, b) => a.title.localeCompare(b.title));
  }
  const dataset = await getDataset();
  return dataset.assets
    .filter((asset) => (kbId ? asset.homeKbId === kbId : true))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getAssetAdminDetail(assetId: string): Promise<AssetAdminDetail | null> {
  if (isDatabaseEnabled()) {
    const asset = await getDbAssetById(assetId);
    if (!asset) {
      return null;
    }
    const versions = await loadVersions(assetId);
    const synced = versions.length > 0 ? applyActiveVersionToAsset(asset, versions) : asset;
    const [kb, usages] = await Promise.all([getDbKnowledgeBaseById(asset.homeKbId), getAssetUsages(assetId)]);
    return {
      asset: synced,
      versions,
      usages,
      publicUrl: kb && asset.status === "active" ? `/kb/${kb.slug}/files/${asset.slug}` : null,
    };
  }
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

async function lookupActiveRedirect(kbId: string, fromPath: string): Promise<KbRedirect | null> {
  if (isDatabaseEnabled()) {
    return loadActiveRedirect(kbId, fromPath);
  }
  return (
    runtimeRedirects().find(
      (candidate) =>
        candidate.kbId === kbId &&
        candidate.fromPath === fromPath &&
        candidate.status === "active",
    ) ?? null
  );
}

export type ActiveRedirectTarget =
  | { kind: "path"; path: string[] }
  | { kind: "href"; href: string };

/**
 * A page moved more than once (e.g. reorganized twice in one session) leaves a chain of
 * redirects — each hop only records old -> new for that one move, so an older bookmark can
 * land on an intermediate path that itself now redirects elsewhere. Follow the chain here
 * (bounded, with a visited-set to guard against a cycle) so callers always get the final path.
 * Cross-KB moves store an absolute `/kb/...` target and stop the chain there.
 */
export async function getActiveRedirectTarget(
  kbId: string,
  path: string[],
): Promise<ActiveRedirectTarget | null> {
  let fromPath = path.join("/");
  if (!fromPath) {
    return null;
  }
  const visited = new Set<string>();
  let resolved: ActiveRedirectTarget | null = null;
  for (let hop = 0; hop < 10; hop += 1) {
    if (visited.has(fromPath)) {
      // Cycle: don't follow it back onto a path we've already visited. Bail out entirely
      // rather than resolving to an arbitrary intermediate node in the loop.
      resolved = null;
      break;
    }
    visited.add(fromPath);
    const redirect = await lookupActiveRedirect(kbId, fromPath);
    if (!redirect?.toPath) {
      break;
    }
    if (redirect.toPath.startsWith("/")) {
      resolved = { kind: "href", href: redirect.toPath };
      break;
    }
    const nextPath = redirect.toPath.split("/").filter(Boolean);
    resolved = { kind: "path", path: nextPath };
    fromPath = nextPath.join("/");
  }
  return resolved;
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

export interface SearchKbOptions {
  includeAllKbs?: boolean;
  readableKbIds?: string[];
  staffKbIds?: string[] | null;
  /** Exact case-insensitive tag facets (all must match). */
  tags?: string[];
  /** @deprecated Use tags — single tag facet kept for compatibility. */
  tag?: string;
}

function blocksBodyText(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      if ("text" in block) {
        return block.text;
      }
      if ("items" in block) {
        return block.items.join(" ");
      }
      if ("rows" in block) {
        return block.rows.flat().join(" ");
      }
      if (block.type === "card" || block.type === "procedure_section" || block.type === "sourced") {
        const title = "title" in block ? (block.title ?? "") : "";
        return `${title} ${blocksBodyText(block.blocks)}`;
      }
      return "";
    })
    .join(" ");
}

function pageBodyText(page: KbPage): string {
  return blocksBodyText(page.blocks);
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

function normalizeSearchTags(options: SearchKbOptions): string[] {
  const tags = [...(options.tags ?? [])];
  if (options.tag?.trim()) {
    tags.push(options.tag.trim());
  }
  return [...new Set(tags.map((tag) => tag.toLowerCase()).filter(Boolean))];
}

function matchesTagFacets(tags: unknown, requiredTags: string[]): boolean {
  if (requiredTags.length === 0) {
    return true;
  }
  const pageTags = normalizePageTags(tags).map((tag) => tag.toLowerCase());
  return requiredTags.every((required) => pageTags.includes(required));
}

export async function searchKb(
  kbId: string | undefined,
  query: string,
  includeStaff: boolean,
  options: SearchKbOptions = {},
): Promise<SearchResult[]> {
  const tagFacets = normalizeSearchTags(options);
  const settings = await loadSiteSettings();
  const expandedQuery = expandSearchQueryWithSynonyms(query, settings.searchSynonymGroups);
  const normalized = expandedQuery.trim().toLowerCase();
  if (!normalized && tagFacets.length === 0) {
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

    if (!searchTokens && tagFacets.length === 0) return [];

    const readableKbIds = [...new Set(options.readableKbIds ?? [])];
    const hasReadableScope = options.readableKbIds !== undefined;
    const staffKbIds = options.staffKbIds === null ? null : [...new Set(options.staffKbIds ?? [])];
    const includeAllKbs = Boolean(options.includeAllKbs);
    const tagFilterPages =
      tagFacets.length > 0
        ? sql`AND (
            SELECT COUNT(DISTINCT lower(required.tag))
            FROM unnest(${tagFacets}::text[]) AS required(tag)
            WHERE EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(kb_pages.tags, '[]'::jsonb)) AS page_tag
              WHERE lower(page_tag) = lower(required.tag)
            )
          ) = ${tagFacets.length}`
        : sql``;
    const tagFilterAssets =
      tagFacets.length > 0
        ? sql`AND (
            SELECT COUNT(DISTINCT lower(required.tag))
            FROM unnest(${tagFacets}::text[]) AS required(tag)
            WHERE EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(kb_assets.tags, '[]'::jsonb)) AS asset_tag
              WHERE lower(asset_tag) = lower(required.tag)
            )
          ) = ${tagFacets.length}`
        : sql``;
    const pageTextMatch = searchTokens
      ? sql`(search_vector @@ to_tsquery('english', ${searchTokens})
             OR search_vector @@ websearch_to_tsquery('english', ${normalized}))`
      : sql`TRUE`;
    const assetTextMatch = searchTokens
      ? sql`(search_vector @@ to_tsquery('english', ${searchTokens})
             OR search_vector @@ websearch_to_tsquery('english', ${normalized}))`
      : sql`TRUE`;
    const pageRank = searchTokens
      ? sql`(GREATEST(
                ts_rank_cd(search_vector, to_tsquery('english', ${searchTokens})),
                ts_rank_cd(search_vector, websearch_to_tsquery('english', ${normalized}))
              ) * 1.2)`
      : sql`1.0`;
    const assetRank = searchTokens
      ? sql`GREATEST(
               ts_rank_cd(search_vector, to_tsquery('english', ${searchTokens})),
               ts_rank_cd(search_vector, websearch_to_tsquery('english', ${normalized}))
             )`
      : sql`1.0`;

    const kbFilterPages = kbId
      ? includeAllKbs
        ? sql`AND kb_pages.kb_id = ${kbId}`
        : hasReadableScope
          ? readableKbIds.includes(kbId)
            ? sql`AND kb_pages.kb_id = ${kbId}`
            : sql`AND FALSE`
          : sql`
              AND kb_pages.kb_id = ${kbId}
              AND EXISTS (
                SELECT 1 FROM knowledge_bases kb
                WHERE kb.id = kb_pages.kb_id AND kb.status = 'published' AND kb.visibility = 'public'
              )
            `
      : includeAllKbs
        ? sql``
        : hasReadableScope
          ? readableKbIds.length > 0
            ? sql`AND kb_pages.kb_id = ANY(${readableKbIds}::text[])`
            : sql`AND FALSE`
        : readableKbIds.length > 0
          ? sql`AND (
              EXISTS (
                SELECT 1 FROM knowledge_bases kb
                WHERE kb.id = kb_pages.kb_id AND kb.status = 'published' AND kb.visibility = 'public'
              )
              OR kb_pages.kb_id = ANY(${readableKbIds}::text[])
            )`
          : sql`AND EXISTS (
              SELECT 1 FROM knowledge_bases kb
              WHERE kb.id = kb_pages.kb_id AND kb.status = 'published' AND kb.visibility = 'public'
            )`;
    const kbFilterAssets = kbId
      ? includeAllKbs
        ? sql`AND kb_assets.home_kb_id = ${kbId}`
        : hasReadableScope
          ? readableKbIds.includes(kbId)
            ? sql`AND kb_assets.home_kb_id = ${kbId}`
            : sql`AND FALSE`
          : sql`
              AND kb_assets.home_kb_id = ${kbId}
              AND EXISTS (
                SELECT 1 FROM knowledge_bases kb
                WHERE kb.id = kb_assets.home_kb_id AND kb.status = 'published' AND kb.visibility = 'public'
              )
            `
      : includeAllKbs
        ? sql``
        : hasReadableScope
          ? readableKbIds.length > 0
            ? sql`AND kb_assets.home_kb_id = ANY(${readableKbIds}::text[])`
            : sql`AND FALSE`
        : readableKbIds.length > 0
          ? sql`AND (
              EXISTS (
                SELECT 1 FROM knowledge_bases kb
                WHERE kb.id = kb_assets.home_kb_id AND kb.status = 'published' AND kb.visibility = 'public'
              )
              OR kb_assets.home_kb_id = ANY(${readableKbIds}::text[])
            )`
          : sql`AND EXISTS (
              SELECT 1 FROM knowledge_bases kb
              WHERE kb.id = kb_assets.home_kb_id AND kb.status = 'published' AND kb.visibility = 'public'
            )`;

    const staffPageAccess = !includeStaff
      ? sql`FALSE`
      : staffKbIds === null || options.staffKbIds === undefined
        ? sql`TRUE`
        : staffKbIds.length > 0
          ? sql`kb_pages.kb_id = ANY(${staffKbIds}::text[])`
          : sql`FALSE`;
    const pageVisibilityFilter = sql`AND (
      (
        kb_pages.status = 'published'
        AND kb_pages.visibility = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM kb_pages p2
          WHERE p2.kb_id = kb_pages.kb_id
            AND p2.visibility = 'staff'
            AND p2.status = 'published'
            AND (kb_pages.path = p2.path OR kb_pages.path LIKE p2.path || '/%')
        )
      )
      OR (
        ${staffPageAccess}
        AND kb_pages.status IN ('published', 'draft')
      )
    )`;

    const pageRows = await sql`
      SELECT id, title, summary, path, kb_id,
             ${pageRank} AS rank
      FROM kb_pages
      WHERE ${pageTextMatch}
      AND kb_pages.node_kind = 'page'
      ${kbFilterPages}
      ${pageVisibilityFilter}
      ${tagFilterPages}
      ORDER BY rank DESC
      LIMIT 20
    `;

    const assetRows = await sql`
      SELECT id, title, description as summary, slug, home_kb_id as kb_id,
             ${assetRank} AS rank
      FROM kb_assets
      WHERE ${assetTextMatch}
      AND status = 'active'
      AND asset_type = 'document'
      ${kbFilterAssets}
      ${tagFilterAssets}
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
      const assetKbId = row.kb_id as string;
      const canReadStaffAsset = includeStaff && (staffKbIds === null || staffKbIds.includes(assetKbId));
      if (!canReadStaffAsset) {
        const asset = await getAssetById(row.id as string);
        if (!asset || !(await assetHasPublicPublishedUsage(asset))) {
          continue;
        }
      }
      scored.push({
        score: row.rank as number,
        result: { type: "asset", id: row.id as string, title: row.title as string, summary: row.summary as string, slug: row.slug as string, kbId: row.kb_id as string },
      });
    }

    scored.sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title));
    let results = scored.map((entry) => entry.result);
    if (results.length === 0 && normalized.length >= 3) {
      const dataset = await getDataset();
      const fallbackCandidates = (
        kbId
          ? visiblePages(dataset, kbId, includeStaff)
          : dataset.pages.filter((page) => page.status === "published" || (includeStaff && isStaffVisiblePageStatus(page.status)))
      )
        .filter((page) => (page.nodeKind ?? "page") === "page" && matchesTagFacets(page.tags, tagFacets))
        .map((page) => ({
          id: page.id,
          title: page.title,
          summary: page.summary,
          tags: normalizePageTags(page.tags),
          path: page.path,
          kbId: page.kbId,
        }));
      const fallbackScored = rankFuzzyCandidates(normalized, fallbackCandidates).map((entry) => ({
        score: entry.score,
        result: {
          type: "page" as const,
          id: entry.candidate.id,
          title: entry.candidate.title,
          summary: entry.candidate.summary,
          path: entry.candidate.path,
          kbId: entry.candidate.kbId,
        },
      }));
      results = fallbackScored.map((entry) => entry.result);
    }
    recordSearchEvent({ query, kbId, resultCount: results.length }).catch(() => {});
    return results;
  }

  const dataset = await getDataset();
  const scored: ScoredResult[] = [];

  const readableKbIds = new Set(options.readableKbIds ?? []);
  const hasReadableScope = options.readableKbIds !== undefined;
  const staffKbIds = options.staffKbIds === null || options.staffKbIds === undefined
    ? null
    : new Set(options.staffKbIds);
  const kbById = new Map(dataset.knowledgeBases.map((kb) => [kb.id, kb]));
  const canReadKb = (candidateKbId: string) => {
    const kb = kbById.get(candidateKbId);
    if (options.includeAllKbs) {
      return !kbId || candidateKbId === kbId;
    }
    if (hasReadableScope) {
      return readableKbIds.has(candidateKbId) && (!kbId || candidateKbId === kbId);
    }
    if (kbId && candidateKbId !== kbId) {
      return false;
    }
    return Boolean(kb?.status === "published" && kb.visibility === "public");
  };
  const canReadStaffPages = (candidateKbId: string) =>
    includeStaff && (staffKbIds === null || staffKbIds.has(candidateKbId));
  const publishedPagesByKb = new Map<string, KbPage[]>();
  for (const page of dataset.pages) {
    if (page.status !== "published") {
      continue;
    }
    publishedPagesByKb.set(page.kbId, [...(publishedPagesByKb.get(page.kbId) ?? []), page]);
  }

  const pagesToSearch = (
    kbId
      ? canReadKb(kbId)
        ? visiblePages(dataset, kbId, includeStaff)
        : []
      : dataset.pages.filter((page) => {
          if (!canReadKb(page.kbId)) {
            return false;
          }
          if (canReadStaffPages(page.kbId)) {
            return isStaffVisiblePageStatus(page.status);
          }
          if (page.status !== "published") {
            return false;
          }
          return !isStaffOnly(publishedPagesByKb.get(page.kbId) ?? [], page);
        })
  ).filter((page) => (page.nodeKind ?? "page") === "page");

  for (const page of pagesToSearch) {
    if (!matchesTagFacets(page.tags, tagFacets)) {
      continue;
    }
    const titleScore = fieldScore(page.title, normalized, { exact: 100, prefix: 60, includes: 40 });
    const summaryScore = fieldScore(page.summary, normalized, { exact: 25, prefix: 25, includes: 25 });
    const tagScore = fieldScore(formatPageTagsForSearch(page.tags), normalized, { exact: 45, prefix: 35, includes: 25 });
    const bodyScore = fieldScore(pageBodyText(page), normalized, { exact: 10, prefix: 10, includes: 10 });
    const score = normalized
      ? titleScore + summaryScore + tagScore + bodyScore
      : matchesTagFacets(page.tags, tagFacets)
        ? 50
        : 0;
    if (score > 0) {
      scored.push({
        score,
        result: { type: "page", id: page.id, title: page.title, summary: page.summary, path: page.path, kbId: page.kbId },
      });
    }
  }

  if (scored.length === 0 && normalized.length >= 3) {
    const fuzzyCandidates = pagesToSearch
      .filter((page) => matchesTagFacets(page.tags, tagFacets))
      .map((page) => ({
        id: page.id,
        title: page.title,
        summary: page.summary,
        tags: normalizePageTags(page.tags),
        path: page.path,
        kbId: page.kbId,
      }));
    for (const entry of rankFuzzyCandidates(normalized, fuzzyCandidates)) {
      scored.push({
        score: entry.score,
        result: {
          type: "page",
          id: entry.candidate.id,
          title: entry.candidate.title,
          summary: entry.candidate.summary,
          path: entry.candidate.path,
          kbId: entry.candidate.kbId,
        },
      });
    }
  }

  const assetsToSearch = kbId
    ? canReadKb(kbId)
      ? dataset.assets.filter((asset) => asset.homeKbId === kbId)
      : []
    : dataset.assets.filter((asset) => canReadKb(asset.homeKbId));

  for (const asset of assetsToSearch) {
    if (asset.status !== "active" || asset.assetType !== "document") {
      continue;
    }
    if (!matchesTagFacets(asset.tags, tagFacets)) {
      continue;
    }
    if (!canReadStaffPages(asset.homeKbId) && !(await assetHasPublicPublishedUsage(asset))) {
      continue;
    }
    const titleScore = fieldScore(asset.title, normalized, { exact: 90, prefix: 50, includes: 30 });
    const descriptionScore = fieldScore(asset.description, normalized, { exact: 15, prefix: 15, includes: 15 });
    const tagScore = fieldScore(formatAssetTagsForSearch(asset.tags), normalized, { exact: 35, prefix: 25, includes: 18 });
    const slugScore = fieldScore(asset.slug, normalized, { exact: 15, prefix: 15, includes: 15 });
    const score = normalized
      ? titleScore + descriptionScore + tagScore + slugScore
      : matchesTagFacets(asset.tags, tagFacets)
        ? 40
        : 0;
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

export async function updateAssetMetadata(
  assetId: string,
  patch: { description?: string; altText?: string; tags?: unknown },
): Promise<{ asset: Asset; fields: string[] }> {
  const normalizedId = normalizeRecordId(assetId);
  const dataset = await getDataset();
  const existing = dataset.assets.find((asset) => asset.id === normalizedId);
  if (!existing) {
    throw new Error("Asset not found.");
  }

  const fields: string[] = [];
  const updated: Asset = {
    ...existing,
    updatedDisplayDate: new Date().toISOString().slice(0, 10),
  };
  if (typeof patch.description === "string") {
    updated.description = patch.description.trim();
    fields.push("description");
  }
  if (typeof patch.altText === "string") {
    updated.altText = patch.altText.trim();
    fields.push("altText");
  }
  if (patch.tags !== undefined) {
    updated.tags = normalizeAssetTags(patch.tags);
    fields.push("tags");
  }
  if (fields.length === 0) {
    throw new Error("A description, altText, or tags value is required.");
  }

  if (isDatabaseEnabled()) {
    await updateAssetRecord(updated);
  } else {
    const list = runtimeAssets();
    const index = list.findIndex((asset) => asset.id === normalizedId);
    if (index >= 0) {
      list[index] = updated;
    } else {
      list.push(updated);
    }
  }

  return { asset: updated, fields };
}

export async function updateAssetDescription(assetId: string, description: string): Promise<Asset> {
  const { asset } = await updateAssetMetadata(assetId, { description });
  return asset;
}

export async function updateAssetAltText(assetId: string, altText: string): Promise<Asset> {
  const { asset } = await updateAssetMetadata(assetId, { altText });
  return asset;
}

export async function updateAssetTags(assetId: string, tags: unknown): Promise<Asset> {
  const { asset } = await updateAssetMetadata(assetId, { tags });
  return asset;
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
  const revisions = runtimePageRevisions();
  const remaining = revisions.filter((rev) => rev.pageId !== normalizedId);
  revisions.length = 0;
  revisions.push(...remaining);
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
  if (isDatabaseEnabled()) {
    return [...(await getDbKnowledgeBases())].sort((a, b) => a.title.localeCompare(b.title));
  }
  const dataset = await getDataset();
  return [...dataset.knowledgeBases].sort((a, b) => a.title.localeCompare(b.title));
}

export async function getAllPagesForAdmin(kbId: string): Promise<KbPage[]> {
  if (isDatabaseEnabled()) {
    return orderPagesForTree(await getDbPagesForKb(kbId));
  }
  const dataset = await getDataset();
  return orderPagesForTree(dataset.pages.filter((page) => page.kbId === kbId));
}

export async function getAllPageSummariesForAdmin(kbId: string): Promise<KbPage[]> {
  if (isDatabaseEnabled()) {
    return orderPagesForTree(await getDbPageSummariesForKb(kbId));
  }
  return getAllPagesForAdmin(kbId);
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
  tags?: unknown;
  visibility?: PageVisibility;
  status?: PageStatus;
  blocks: ContentBlock[];
  ownerLabel?: string;
  contactEmail?: string;
  sortOrder?: number;
  showToc?: boolean;
  tocDepth?: number;
  showSummary?: boolean;
  showPrintButton?: boolean;
  nodeKind?: PageNodeKind;
  linkUrl?: string;
  linkNewTab?: boolean;
  // Attribution for the initial revision (the create snapshot). Falls back to ""
  // when a create path has no session (e.g. seeding).
  authorEmail?: string;
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
    tags: normalizePageTags(input.tags),
    status: input.status ?? "draft",
    visibility: input.visibility ?? "public",
    ownerLabel: input.ownerLabel?.trim() || kb.title,
    contactEmail:
      input.contactEmail?.trim() ||
      (input.authorEmail?.includes("@") ? input.authorEmail.trim() : "") ||
      "",
    lastReviewedDate: today,
    updatedDisplayDate: today,
    blocks: input.blocks,
    relatedPageIds: [],
    relatedAssetIds: [],
    showToc: input.showToc ?? true,
    tocDepth: input.tocDepth ?? 3,
    showSummary: input.showSummary ?? true,
    showPrintButton: input.showPrintButton ?? true,
    nodeKind: input.nodeKind ?? "page",
    linkUrl: input.linkUrl ?? "",
    linkNewTab: input.linkNewTab ?? false,
  };

  // Snapshot the page at creation so the original content is recoverable even
  // if it is never edited again (e.g. a committed import). Written atomically
  // with the page insert.
  const initialRevision = revisionWriteForPage(page, input.authorEmail ?? "", "save");
  if (isDatabaseEnabled()) {
    await insertPage(page, initialRevision);
    const { rebuildAssetUsagesForPage } = await import("@/lib/asset-usages");
    await rebuildAssetUsagesForPage(page);
  } else {
    runtimePages().push(page);
    runtimePageRevisions().push(runtimeRevisionFromWrite(initialRevision, nextMemoryRevisionNumber(page.id)));
  }

  return page;
}

export interface UpdatePageInput {
  pageId: string;
  title: string;
  slug?: string;
  parentPath?: string[];
  summary?: string;
  tags?: unknown;
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
  showPrintButton?: boolean;
  nextReviewDate?: string | null;
  reviewAssigneeEmail?: string;
  reviewSlaDays?: number | null;
  publishAt?: string | null;
  linkUrl?: string;
  linkNewTab?: boolean;
  // Optional so ordinary editor saves (which don't touch related links) leave
  // them untouched; revision restore passes them to restore the full snapshot.
  relatedPageIds?: string[];
  relatedAssetIds?: string[];
  nextStepsHeading?: string;
  nextStepsIntro?: string;
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

function snapshotFromPage(page: KbPage): PageRevisionSnapshot {
  return {
    title: page.title,
    slug: page.slug,
    path: [...page.path],
    summary: page.summary,
    tags: normalizePageTags(page.tags),
    status: page.status,
    visibility: page.visibility,
    ownerLabel: page.ownerLabel,
    contactEmail: page.contactEmail,
    lastReviewedDate: page.lastReviewedDate,
    blocks: structuredClone(page.blocks),
    relatedPageIds: [...page.relatedPageIds],
    relatedAssetIds: [...page.relatedAssetIds],
    showToc: page.showToc,
    tocDepth: page.tocDepth,
    showSummary: page.showSummary,
    showPrintButton: page.showPrintButton,
    nextReviewDate: page.nextReviewDate ?? null,
    reviewAssigneeEmail: page.reviewAssigneeEmail ?? "",
    reviewSlaDays: page.reviewSlaDays ?? null,
    nextStepsHeading: page.nextStepsHeading ?? "",
    nextStepsIntro: page.nextStepsIntro ?? "",
    nodeKind: page.nodeKind ?? "page",
    linkUrl: page.linkUrl ?? "",
    linkNewTab: page.linkNewTab ?? false,
  };
}

function nextMemoryRevisionNumber(pageId: string): number {
  const existing = runtimePageRevisions().filter((rev) => rev.pageId === pageId);
  return existing.reduce((max, rev) => Math.max(max, rev.revisionNumber), 0) + 1;
}

// Build the DB revision-write payload for a page's current state.
function revisionWriteForPage(
  page: KbPage,
  authorEmail: string,
  action: PageRevisionAction,
): PageRevisionWrite {
  return {
    id: `revision-${crypto.randomUUID()}`,
    pageId: page.id,
    kbId: page.kbId,
    title: page.title,
    authorEmail,
    action,
    snapshot: snapshotFromPage(page),
    createdAt: new Date().toISOString(),
  };
}

// Materialise a runtime (in-memory) revision from a write payload.
function runtimeRevisionFromWrite(write: PageRevisionWrite, revisionNumber: number): PageRevision {
  return {
    ...write.snapshot,
    id: write.id,
    pageId: write.pageId,
    kbId: write.kbId,
    revisionNumber,
    authorEmail: write.authorEmail,
    action: write.action,
    createdAt: write.createdAt,
  };
}

export async function updatePage(
  input: UpdatePageInput,
  editorEmail?: string,
  revisionAction: PageRevisionAction = "save",
): Promise<KbPage> {
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
      throw new Error(
        "Parent page not found. If this page was moved to another knowledge base or reorganized, reload the editor and save again.",
      );
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
          tags: input.tags === undefined ? page.tags : normalizePageTags(input.tags),
          status: input.status ?? page.status,
          visibility: input.visibility ?? page.visibility,
          ownerLabel: input.ownerLabel?.trim() ?? page.ownerLabel,
          contactEmail: input.contactEmail?.trim() ?? page.contactEmail,
          lastReviewedDate: input.lastReviewedDate?.trim() || page.lastReviewedDate,
          updatedDisplayDate: today,
          blocks: input.blocks,
          relatedPageIds: input.relatedPageIds ?? page.relatedPageIds,
          relatedAssetIds: input.relatedAssetIds ?? page.relatedAssetIds,
          showToc: input.showToc ?? page.showToc,
          tocDepth: input.tocDepth ?? page.tocDepth,
          showSummary: input.showSummary ?? page.showSummary,
          showPrintButton: input.showPrintButton ?? page.showPrintButton,
          nextReviewDate: input.nextReviewDate ?? page.nextReviewDate,
          reviewAssigneeEmail: input.reviewAssigneeEmail ?? page.reviewAssigneeEmail,
          reviewSlaDays: input.reviewSlaDays !== undefined ? input.reviewSlaDays : page.reviewSlaDays,
          nextStepsHeading: input.nextStepsHeading ?? page.nextStepsHeading ?? "",
          nextStepsIntro: input.nextStepsIntro ?? page.nextStepsIntro ?? "",
          publishAt: input.publishAt !== undefined ? input.publishAt : page.publishAt,
          linkUrl: input.linkUrl ?? page.linkUrl,
          linkNewTab: input.linkNewTab ?? page.linkNewTab,
        };
      }
      return {
        ...page,
        path: [...newPath, ...pathSuffix],
      };
    });

  const updated = changedPages.find((page) => page.id === existing.id);
  if (!updated) {
    throw new Error("Could not update page.");
  }

  // Snapshot the page as it will be saved. Written inside the same DB
  // transaction as the page update (see updatePages) so a rejected/locked save
  // never leaves an orphan revision.
  const revisionWrite = revisionWriteForPage(updated, editorEmail ?? "", revisionAction);

  if (isDatabaseEnabled()) {
    await updatePages(changedPages, editorEmail, [revisionWrite]);
    const { rebuildAssetUsagesForPage } = await import("@/lib/asset-usages");
    await rebuildAssetUsagesForPage(updated);
  } else {
    changedPages.forEach(storeRuntimePage);
    runtimePageRevisions().push(runtimeRevisionFromWrite(revisionWrite, nextMemoryRevisionNumber(updated.id)));
  }

  await recordPublishedPathRedirects(existing.kbId, pathBefore, changedPages);

  return updated;
}

export async function listPageRevisions(pageId: string): Promise<PageRevisionSummary[]> {
  const normalizedId = normalizeRecordId(pageId);
  if (isDatabaseEnabled()) {
    return listPageRevisionsFromDb(normalizedId);
  }
  return runtimePageRevisions()
    .filter((rev) => rev.pageId === normalizedId)
    .sort((a, b) => b.revisionNumber - a.revisionNumber)
    .slice(0, 50)
    .map((rev) => ({
      id: rev.id,
      pageId: rev.pageId,
      kbId: rev.kbId,
      revisionNumber: rev.revisionNumber,
      title: rev.title,
      status: rev.status,
      authorEmail: rev.authorEmail,
      action: rev.action,
      createdAt: rev.createdAt,
    }));
}

export async function getPageRevision(revisionId: string): Promise<PageRevision | null> {
  const normalizedId = normalizeRecordId(revisionId);
  if (isDatabaseEnabled()) {
    return getPageRevisionFromDb(normalizedId);
  }
  return runtimePageRevisions().find((rev) => rev.id === normalizedId) ?? null;
}

// Restore = a NEW save from a past snapshot (never a history rewrite), so it
// goes through updatePage and creates its own revision with action "restore".
// Edit-lock semantics are preserved because updatePage/updatePages enforce them.
export async function restorePageRevision(revisionId: string, editorEmail: string): Promise<KbPage> {
  const revision = await getPageRevision(revisionId);
  if (!revision) {
    throw new Error("Revision not found.");
  }
  const page = await getPageByIdForAdmin(revision.pageId);
  if (!page) {
    throw new Error("Page not found.");
  }
  return updatePage(
    {
      pageId: revision.pageId,
      title: revision.title,
      slug: revision.slug,
      parentPath: revision.path.slice(0, -1),
      summary: revision.summary,
      tags: revision.tags ?? page.tags ?? [],
      visibility: revision.visibility,
      status: revision.status,
      blocks: revision.blocks,
      ownerLabel: revision.ownerLabel,
      contactEmail: revision.contactEmail,
      lastReviewedDate: revision.lastReviewedDate,
      relatedPageIds: revision.relatedPageIds,
      relatedAssetIds: revision.relatedAssetIds,
      showToc: revision.showToc,
      tocDepth: revision.tocDepth,
      showSummary: revision.showSummary,
      showPrintButton: revision.showPrintButton,
      nextReviewDate: revision.nextReviewDate ?? null,
      linkUrl: revision.linkUrl ?? "",
      linkNewTab: revision.linkNewTab ?? false,
    },
    editorEmail,
    "restore",
  );
}

// Retention: keep the newest 50 revisions per page.
export async function cleanupPageRevisions(keepPerPage = 50): Promise<number> {
  if (isDatabaseEnabled()) {
    return cleanupPageRevisionsInDb(keepPerPage);
  }
  const all = runtimePageRevisions();
  const byPage = new Map<string, PageRevision[]>();
  for (const rev of all) {
    byPage.set(rev.pageId, [...(byPage.get(rev.pageId) ?? []), rev]);
  }
  const keep = new Set<string>();
  for (const revs of byPage.values()) {
    revs
      .sort((a, b) => b.revisionNumber - a.revisionNumber)
      .slice(0, keepPerPage)
      .forEach((rev) => keep.add(rev.id));
  }
  const removed = all.length - keep.size;
  const kept = all.filter((rev) => keep.has(rev.id));
  all.length = 0;
  all.push(...kept);
  return removed;
}

export async function cleanupPageRevisionsForPage(pageId: string, keepPerPage = 50): Promise<number> {
  const normalizedId = normalizeRecordId(pageId);
  if (isDatabaseEnabled()) {
    return cleanupPageRevisionsForPageInDb(normalizedId, keepPerPage);
  }
  const all = runtimePageRevisions();
  const pageRevisions = all
    .filter((rev) => rev.pageId === normalizedId)
    .sort((a, b) => b.revisionNumber - a.revisionNumber);
  const keep = new Set(pageRevisions.slice(0, keepPerPage).map((rev) => rev.id));
  const before = all.length;
  const kept = all.filter((rev) => rev.pageId !== normalizedId || keep.has(rev.id));
  all.length = 0;
  all.push(...kept);
  return before - kept.length;
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
    const { rebuildAssetUsagesForPage } = await import("@/lib/asset-usages");
    await rebuildAssetUsagesForPage(updated);
  } else {
    storeRuntimePage(updated);
  }

  return updated;
}

/** Cron helper: publish drafts whose publishAt is due and that clear the publish gate. */
export async function publishDueDraftPages(now = new Date()): Promise<{
  attempted: number;
  published: string[];
  blocked: Array<{ pageId: string; issues: string[] }>;
}> {
  const { checkExcerptSourceForPublish } = await import("@/lib/excerpts");
  const { validatePageForPublish } = await import("@/lib/publish-gate");
  const dataset = await getDataset();
  const due = dataset.pages.filter((page) => {
    if (page.status !== "draft") return false;
    if ((page.nodeKind ?? "page") !== "page" && (page.nodeKind ?? "page") !== "group" && (page.nodeKind ?? "page") !== "link") {
      return false;
    }
    if (!page.publishAt) return false;
    const when = new Date(page.publishAt);
    return !Number.isNaN(when.getTime()) && when.getTime() <= now.getTime();
  });

  const published: string[] = [];
  const blocked: Array<{ pageId: string; issues: string[] }> = [];

  for (const page of due) {
    const kb = dataset.knowledgeBases.find((candidate) => candidate.id === page.kbId);
    const issues = await validatePageForPublish(page, getAssetStatusById, checkExcerptSourceForPublish, {
      requireSummary: kb?.requireSummary !== false,
    });
    if (issues.length > 0) {
      blocked.push({ pageId: page.id, issues });
      continue;
    }
    await updatePageStatus(page.id, "published");
    // Clear schedule after publish so the cron doesn't re-attempt.
    const cleared: KbPage = {
      ...(await getPageByIdForAdmin(page.id))!,
      publishAt: null,
    };
    if (isDatabaseEnabled()) {
      await updatePages([cleared]);
    } else {
      storeRuntimePage(cleared);
    }
    published.push(page.id);
  }

  return { attempted: due.length, published, blocked };
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
        throw new Error(
          "Parent page not found. If this page was moved to another knowledge base or reorganized, reload the editor and save again.",
        );
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

function remintBlockIds(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map((block) => {
    const blockId = `block-${crypto.randomUUID()}`;
    if (block.type === "card" || block.type === "procedure_section" || block.type === "sourced") {
      return { ...block, blockId, blocks: remintBlockIds(block.blocks) };
    }
    return { ...block, blockId };
  });
}

function prepareRelocatedBlocks(
  blocks: ContentBlock[],
  fromSlug: string,
  toSlug: string,
  remint: boolean,
): ContentBlock[] {
  const rewritten = rewriteKbLinksInBlocks(blocks, fromSlug, toSlug);
  return remint ? remintBlockIds(rewritten) : rewritten;
}

function allocateUniqueSlug(
  pages: KbPage[],
  kbId: string,
  parentPath: string[],
  preferred: string,
  excludePageId?: string,
): string {
  const baseSlug = slugify(preferred);
  assertPageSlugAllowed(baseSlug);
  const siblingSlugs = new Set(
    pages
      .filter(
        (page) =>
          page.id !== excludePageId &&
          page.kbId === kbId &&
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
  return slug;
}

function collectSubtree(pages: KbPage[], root: KbPage): KbPage[] {
  return pages
    .filter((page) => page.kbId === root.kbId && hasPathPrefix(page.path, root.path))
    .sort((a, b) => a.path.length - b.path.length || a.sortOrder - b.sortOrder);
}

export type RelocateMode = "copy" | "move";

export interface RelocatePageInput {
  pageId: string;
  targetKbId: string;
  parentPath?: string[];
  mode: RelocateMode;
  /** When false, copy only the root page. Move always includes descendants. */
  includeChildren?: boolean;
  authorEmail?: string;
}

export interface RelocatePageResult {
  rootPage: KbPage;
  pages: KbPage[];
  mode: RelocateMode;
  sourceKbId: string;
  targetKbId: string;
}

/**
 * Copy or move a page (and optionally its descendants) into another knowledge base.
 * Move requires a different KB; published moves leave absolute `/kb/...` redirects on the source KB.
 * Loads only the source/destination KB page lists (not the full site dataset) so large sites
 * don't time out serverless relocate requests.
 */
export async function relocatePage(input: RelocatePageInput): Promise<RelocatePageResult> {
  const source = await getPageByIdForAdmin(input.pageId);
  if (!source) {
    throw new Error("Page not found.");
  }

  const [sourceKb, targetKb] = await Promise.all([getKbById(source.kbId), getKbById(input.targetKbId)]);
  if (!sourceKb || !targetKb) {
    throw new Error("Knowledge base not found.");
  }

  if (input.mode === "move" && input.targetKbId === source.kbId) {
    throw new Error("Use Nest under or the page tree to reorganize within the same knowledge base.");
  }

  const parentPath = input.parentPath ?? [];
  const [sourcePages, destinationPages] = await Promise.all([
    getAllPagesForAdmin(source.kbId),
    input.targetKbId === source.kbId
      ? Promise.resolve(null)
      : getAllPagesForAdmin(input.targetKbId),
  ]);
  const destPages = destinationPages ?? sourcePages;

  if (parentPath.length > 0) {
    const parentExists = destPages.some((page) => page.path.join("/") === parentPath.join("/"));
    if (!parentExists) {
      throw new Error("Parent page not found in the destination knowledge base.");
    }
  }

  const rootInTree = sourcePages.find((page) => page.id === source.id) ?? source;
  const includeChildren = input.includeChildren !== false;
  const subtree = collectSubtree(sourcePages, rootInTree);
  if (!includeChildren && subtree.length > 1 && input.mode === "move") {
    throw new Error("Move always includes child pages. Move or delete children first to relocate only this page.");
  }
  const pagesToRelocate =
    input.mode === "move" || includeChildren ? subtree : subtree.filter((page) => page.id === source.id);

  if (input.mode === "copy") {
    return copyPagesAcrossKb({
      source: rootInTree,
      sourceKb,
      targetKb,
      parentPath,
      pagesToRelocate,
      destinationPages: destPages,
      authorEmail: input.authorEmail ?? "",
    });
  }

  return movePagesAcrossKb({
    source: rootInTree,
    sourceKb,
    targetKb,
    parentPath,
    pagesToRelocate,
    destinationPages: destPages,
    authorEmail: input.authorEmail ?? "",
  });
}

async function copyPagesAcrossKb({
  source,
  sourceKb,
  targetKb,
  parentPath,
  pagesToRelocate,
  destinationPages,
  authorEmail,
}: {
  source: KbPage;
  sourceKb: KnowledgeBase;
  targetKb: KnowledgeBase;
  parentPath: string[];
  pagesToRelocate: KbPage[];
  destinationPages: KbPage[];
  authorEmail: string;
}): Promise<RelocatePageResult> {
  const idMap = new Map<string, string>();
  for (const page of pagesToRelocate) {
    idMap.set(page.id, `page-${crypto.randomUUID()}`);
  }

  const created: KbPage[] = [];
  const workingPages = [...destinationPages];

  for (const page of pagesToRelocate) {
    let destParent = parentPath;
    if (page.id !== source.id) {
      const parentOldPath = page.path.slice(0, -1);
      const parentOld = pagesToRelocate.find((candidate) => candidate.path.join("/") === parentOldPath.join("/"));
      if (!parentOld) {
        throw new Error("Could not resolve parent while copying page tree.");
      }
      const parentNew = created.find((candidate) => candidate.id === idMap.get(parentOld.id));
      if (!parentNew) {
        throw new Error("Could not resolve parent while copying page tree.");
      }
      destParent = parentNew.path;
    }

    const slug = allocateUniqueSlug(workingPages, targetKb.id, destParent, page.slug);
    const today = new Date().toISOString().slice(0, 10);
    const maxSiblingOrder = Math.max(
      0,
      ...workingPages
        .filter(
          (candidate) =>
            candidate.kbId === targetKb.id &&
            candidate.path.length === destParent.length + 1 &&
            candidate.path.slice(0, -1).join("/") === destParent.join("/"),
        )
        .map((candidate) => candidate.sortOrder),
    );

    const relatedPageIds = page.relatedPageIds.map((id) => idMap.get(id) ?? id);

    const copy: KbPage = {
      ...page,
      id: idMap.get(page.id)!,
      kbId: targetKb.id,
      slug,
      path: [...destParent, slug],
      sortOrder: maxSiblingOrder + 10,
      status: "draft",
      blocks: prepareRelocatedBlocks(page.blocks, sourceKb.slug, targetKb.slug, true),
      relatedPageIds,
      relatedAssetIds: [...page.relatedAssetIds],
      updatedDisplayDate: today,
      lastReviewedDate: page.lastReviewedDate || today,
      lockedBy: null,
      lockedAt: null,
      verifiedAt: null,
      verifiedBy: null,
    };

    const initialRevision = revisionWriteForPage(copy, authorEmail, "save");
    if (isDatabaseEnabled()) {
      await insertPage(copy, initialRevision);
    } else {
      runtimePages().push(copy);
      runtimePageRevisions().push(runtimeRevisionFromWrite(initialRevision, nextMemoryRevisionNumber(copy.id)));
    }
    workingPages.push(copy);
    created.push(copy);
  }

  const rootPage = created.find((page) => page.id === idMap.get(source.id))!;
  return {
    rootPage,
    pages: created,
    mode: "copy",
    sourceKbId: source.kbId,
    targetKbId: targetKb.id,
  };
}

async function movePagesAcrossKb({
  source,
  sourceKb,
  targetKb,
  parentPath,
  pagesToRelocate,
  destinationPages,
  authorEmail,
}: {
  source: KbPage;
  sourceKb: KnowledgeBase;
  targetKb: KnowledgeBase;
  parentPath: string[];
  pagesToRelocate: KbPage[];
  destinationPages: KbPage[];
  authorEmail: string;
}): Promise<RelocatePageResult> {
  const pathBefore = new Map(pagesToRelocate.map((page) => [page.id, [...page.path]]));

  if (sourceKb.homepagePageId && pagesToRelocate.some((page) => page.id === sourceKb.homepagePageId)) {
    await setKbHomepagePage(sourceKb.id, null);
  }

  const workingPages = [...destinationPages];
  const moved: KbPage[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const ordered = [...pagesToRelocate].sort((a, b) => a.path.length - b.path.length);
  for (const page of ordered) {
    let destParent = parentPath;
    if (page.id !== source.id) {
      const parentOldPath = page.path.slice(0, -1);
      const parentMoved = moved.find(
        (candidate) => pathBefore.get(candidate.id)?.join("/") === parentOldPath.join("/"),
      );
      if (!parentMoved) {
        throw new Error("Could not resolve parent while moving page tree.");
      }
      destParent = parentMoved.path;
    }

    const slug = allocateUniqueSlug(
      workingPages.concat(moved),
      targetKb.id,
      destParent,
      page.slug,
      page.id,
    );
    const maxSiblingOrder = Math.max(
      0,
      ...workingPages
        .concat(moved)
        .filter(
          (candidate) =>
            candidate.kbId === targetKb.id &&
            candidate.path.length === destParent.length + 1 &&
            candidate.path.slice(0, -1).join("/") === destParent.join("/"),
        )
        .map((candidate) => candidate.sortOrder),
    );

    const next: KbPage = {
      ...page,
      kbId: targetKb.id,
      slug,
      path: [...destParent, slug],
      sortOrder: page.id === source.id ? maxSiblingOrder + 10 : page.sortOrder,
      blocks: prepareRelocatedBlocks(page.blocks, sourceKb.slug, targetKb.slug, false),
      updatedDisplayDate: today,
      lockedBy: null,
      lockedAt: null,
    };
    moved.push(next);
  }

  const revisions = moved.map((page) => revisionWriteForPage(page, authorEmail, "save"));
  // Skip the editorEmail lock guard: relocate is an explicit admin action and must succeed
  // even when the page is open/locked in another tab. Locks are cleared on the written rows.
  if (isDatabaseEnabled()) {
    await updatePages(moved, undefined, revisions);
  } else {
    for (const page of moved) {
      storeRuntimePage(page);
    }
    for (const revision of revisions) {
      runtimePageRevisions().push(runtimeRevisionFromWrite(revision, nextMemoryRevisionNumber(revision.pageId)));
    }
  }

  for (const page of moved) {
    if (page.status !== "published") continue;
    // Do not emit a public redirect into a private KB — the Location would disclose
    // the private slug (contradicts §10: unauthorized private content is indistinguishable).
    if (targetKb.visibility === "private") continue;
    const oldPath = pathBefore.get(page.id);
    if (!oldPath) continue;
    const oldKey = oldPath.join("/");
    if (!oldKey) continue;
    const href = `/kb/${targetKb.slug}/${page.path.join("/")}`;
    await upsertPathRedirect(sourceKb.id, oldKey, href, "auto-cross-kb-move");
  }

  const rootPage = moved.find((page) => page.id === source.id)!;
  return {
    rootPage,
    pages: moved,
    mode: "move",
    sourceKbId: sourceKb.id,
    targetKbId: targetKb.id,
  };
}


