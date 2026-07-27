import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import type { ContentBlock, KbPage, KnowledgeBase } from "@/lib/types";

export interface ExcerptIndexItem {
  pageId: string;
  pageTitle: string;
  pageStatus: string;
  kbId: string;
  kbTitle: string;
  kbSlug: string;
  excerptBlockId: string;
  sourcePageId: string;
  sourceTitle: string;
  sourceStatus: string;
  label: string;
  headingBlockId?: string;
  isStale: boolean;
}

/** Walk top-level and nested card / procedure / sourced children for excerpt blocks. */
export function collectExcerptBlocks(
  blocks: ContentBlock[],
): Array<Extract<ContentBlock, { type: "excerpt" }>> {
  const found: Array<Extract<ContentBlock, { type: "excerpt" }>> = [];
  for (const block of blocks) {
    if (block.type === "excerpt") {
      found.push(block);
      continue;
    }
    if (block.type === "card" || block.type === "procedure_section" || block.type === "sourced") {
      found.push(...collectExcerptBlocks(block.blocks));
    }
  }
  return found;
}

export async function listExcerptIndex(allowedKbIds: string[] | null = null): Promise<ExcerptIndexItem[]> {
  const kbs = await getAllKbsForAdmin();
  const scopedKbs = allowedKbIds ? kbs.filter((kb) => allowedKbIds.includes(kb.id)) : kbs;
  const kbById = new Map<string, KnowledgeBase>(scopedKbs.map((kb) => [kb.id, kb]));
  // Sources may live outside the editor's assigned KBs; load all pages for title lookup,
  // but only index excerpt *hosts* the session can access.
  const allPages = (await Promise.all(kbs.map((kb) => getAllPagesForAdmin(kb.id)))).flat();
  const pageById = new Map<string, KbPage>(allPages.map((page) => [page.id, page]));
  const hostPages = allowedKbIds
    ? allPages.filter((page) => allowedKbIds.includes(page.kbId))
    : allPages;
  const items: ExcerptIndexItem[] = [];

  for (const page of hostPages) {
    if (page.status === "archived") {
      continue;
    }
    const kb = kbById.get(page.kbId);
    if (!kb) {
      continue;
    }
    for (const block of collectExcerptBlocks(page.blocks)) {
      const source = pageById.get(block.sourcePageId);
      const pageUpdated = new Date(page.updatedDisplayDate).getTime();
      const sourceUpdated = source ? new Date(source.updatedDisplayDate).getTime() : NaN;
      const isStale =
        !source ||
        (Number.isFinite(pageUpdated) && Number.isFinite(sourceUpdated) && sourceUpdated > pageUpdated);
      items.push({
        pageId: page.id,
        pageTitle: page.title,
        pageStatus: page.status,
        kbId: kb.id,
        kbTitle: kb.title,
        kbSlug: kb.slug,
        excerptBlockId: block.blockId,
        sourcePageId: block.sourcePageId,
        sourceTitle: source?.title ?? "(missing source)",
        sourceStatus: source?.status ?? "missing",
        label: block.label?.trim() || "",
        headingBlockId: block.sourceHeadingBlockId,
        isStale,
      });
    }
  }

  return items.sort((left, right) => {
    if (left.isStale !== right.isStale) {
      return left.isStale ? -1 : 1;
    }
    return left.pageTitle.localeCompare(right.pageTitle);
  });
}
