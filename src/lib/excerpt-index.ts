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
  headingBlockId?: string;
  isStale: boolean;
}

function excerptBlocks(blocks: ContentBlock[]): Array<Extract<ContentBlock, { type: "excerpt" }>> {
  return blocks.filter((block): block is Extract<ContentBlock, { type: "excerpt" }> => block.type === "excerpt");
}

export async function listExcerptIndex(allowedKbIds: string[] | null = null): Promise<ExcerptIndexItem[]> {
  const kbs = await getAllKbsForAdmin();
  const scopedKbs = allowedKbIds ? kbs.filter((kb) => allowedKbIds.includes(kb.id)) : kbs;
  const kbById = new Map<string, KnowledgeBase>(scopedKbs.map((kb) => [kb.id, kb]));
  const pages = (await Promise.all(scopedKbs.map((kb) => getAllPagesForAdmin(kb.id)))).flat();
  const pageById = new Map<string, KbPage>(pages.map((page) => [page.id, page]));
  const items: ExcerptIndexItem[] = [];

  for (const page of pages) {
    if (page.status === "archived") {
      continue;
    }
    const kb = kbById.get(page.kbId);
    if (!kb) {
      continue;
    }
    for (const block of excerptBlocks(page.blocks)) {
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
