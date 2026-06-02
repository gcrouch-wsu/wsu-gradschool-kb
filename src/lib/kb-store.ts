import { cache } from "react";
import { insertPage, isDatabaseEnabled, loadDatasetFromDb } from "@/lib/db";
import { seedDataset } from "@/lib/demo-data";
import { slugify } from "@/lib/slug";
import type {
  Asset,
  ContentBlock,
  KbDataset,
  KbPage,
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
const globalForRuntime = globalThis as unknown as { __kbRuntimePages?: KbPage[] };

function runtimePages(): KbPage[] {
  if (!globalForRuntime.__kbRuntimePages) {
    globalForRuntime.__kbRuntimePages = [];
  }
  return globalForRuntime.__kbRuntimePages;
}

/**
 * Single source of truth for reading KB content. Uses Neon when DATABASE_URL is
 * configured, otherwise the in-memory seed dataset. Cached per request render.
 */
const getDataset = cache(async (): Promise<KbDataset> => {
  if (isDatabaseEnabled()) {
    return loadDatasetFromDb();
  }
  const extra = runtimePages();
  if (extra.length === 0) {
    return seedDataset;
  }
  return {
    knowledgeBases: seedDataset.knowledgeBases,
    pages: [...seedDataset.pages, ...extra],
    assets: seedDataset.assets,
  };
});

function pathKey(path: string[]) {
  return path.join("/");
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
    list.sort((a, b) => a.page.title.localeCompare(b.page.title));
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

export type SearchResult =
  | { type: "page"; id: string; title: string; summary: string; path: string[] }
  | { type: "asset"; id: string; title: string; summary: string; slug: string };

export async function searchKb(
  kbId: string,
  query: string,
  includeStaff: boolean,
): Promise<SearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const dataset = await getDataset();

  const pageResults: SearchResult[] = visiblePages(dataset, kbId, includeStaff)
    .map((page): SearchResult | null => {
      const body = page.blocks
        .map((block) => ("text" in block ? block.text : "items" in block ? block.items.join(" ") : ""))
        .join(" ");
      const haystack = `${page.title} ${page.summary} ${body}`.toLowerCase();
      return haystack.includes(normalized)
        ? { type: "page", id: page.id, title: page.title, summary: page.summary, path: page.path }
        : null;
    })
    .filter((result): result is SearchResult => result !== null);

  const assetResults: SearchResult[] = dataset.assets
    .filter((asset) => asset.homeKbId === kbId && asset.status === "active")
    .map((asset): SearchResult | null => {
      const haystack = `${asset.title} ${asset.description} ${asset.slug}`.toLowerCase();
      return haystack.includes(normalized)
        ? { type: "asset", id: asset.id, title: asset.title, summary: asset.description, slug: asset.slug }
        : null;
    })
    .filter((result): result is SearchResult => result !== null);

  return [...pageResults, ...assetResults];
}

/** Admin dashboard counts (published pages / active assets across all KBs). */
export async function getAdminCounts() {
  const dataset = await getDataset();
  return {
    publishedKbs: dataset.knowledgeBases.filter((kb) => kb.status === "published").length,
    publishedPages: dataset.pages.filter((page) => page.status === "published").length,
    activeAssets: dataset.assets.filter((asset) => asset.status === "active").length,
    storageMode: isDatabaseEnabled() ? ("neon" as const) : ("in-memory" as const),
  };
}

/** All knowledge bases (including drafts) for admin tooling. */
export async function getAllKbsForAdmin(): Promise<KnowledgeBase[]> {
  const dataset = await getDataset();
  return [...dataset.knowledgeBases].sort((a, b) => a.title.localeCompare(b.title));
}

/** All pages for a KB (any status) for admin parent-selection. */
export async function getAllPagesForAdmin(kbId: string): Promise<KbPage[]> {
  const dataset = await getDataset();
  return dataset.pages
    .filter((page) => page.kbId === kbId)
    .sort((a, b) => a.path.join("/").localeCompare(b.path.join("/")));
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
  const page: KbPage = {
    id: `page-${crypto.randomUUID()}`,
    kbId: input.kbId,
    title: input.title.trim() || "Untitled page",
    slug,
    path: [...parentPath, slug],
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
  };

  if (isDatabaseEnabled()) {
    await insertPage(page);
  } else {
    runtimePages().push(page);
  }

  return page;
}
