import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import type { ContentBlock, KbPage, KnowledgeBase } from "@/lib/types";

export interface StaleExcerptItem {
  pageId: string;
  pageTitle: string;
  kbId: string;
  kbSlug: string;
  sourcePageId: string;
  sourceTitle: string;
  sourceUpdatedDisplayDate: string;
  excerptBlockId: string;
}

function excerptBlocks(page: KbPage): Array<Extract<ContentBlock, { type: "excerpt" }>> {
  return page.blocks.filter((block): block is Extract<ContentBlock, { type: "excerpt" }> => block.type === "excerpt");
}

export async function listStaleExcerpts(): Promise<StaleExcerptItem[]> {
  const kbs = await getAllKbsForAdmin();
  const pages = (await Promise.all(kbs.map((kb) => getAllPagesForAdmin(kb.id)))).flat();
  const kbById = new Map(kbs.map((kb) => [kb.id, kb]));
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const stale: StaleExcerptItem[] = [];

  for (const page of pages) {
    if (page.status === "archived") {
      continue;
    }
    const kb = kbById.get(page.kbId);
    if (!kb) {
      continue;
    }
    for (const block of excerptBlocks(page)) {
      const source = pageById.get(block.sourcePageId);
      if (!source) {
        stale.push({
          pageId: page.id,
          pageTitle: page.title,
          kbId: kb.id,
          kbSlug: kb.slug,
          sourcePageId: block.sourcePageId,
          sourceTitle: "(missing source page)",
          sourceUpdatedDisplayDate: "",
          excerptBlockId: block.blockId,
        });
        continue;
      }
      const pageUpdated = new Date(page.updatedDisplayDate).getTime();
      const sourceUpdated = new Date(source.updatedDisplayDate).getTime();
      if (Number.isFinite(pageUpdated) && Number.isFinite(sourceUpdated) && sourceUpdated > pageUpdated) {
        stale.push({
          pageId: page.id,
          pageTitle: page.title,
          kbId: kb.id,
          kbSlug: kb.slug,
          sourcePageId: source.id,
          sourceTitle: source.title,
          sourceUpdatedDisplayDate: source.updatedDisplayDate,
          excerptBlockId: block.blockId,
        });
      }
    }
  }

  return stale.slice(0, 50);
}
