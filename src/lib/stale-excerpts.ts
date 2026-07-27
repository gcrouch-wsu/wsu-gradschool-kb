import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import type { ContentBlock, KbPage } from "@/lib/types";

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

/**
 * `allowedKbIds` scopes the host pages reported, matching `listStaleAssetRefs`.
 * `null` means KB-wide (owner/admin, and the cron, which mails owners/admins).
 */
export async function listStaleExcerpts(allowedKbIds: string[] | null = null): Promise<StaleExcerptItem[]> {
  const kbs = await getAllKbsForAdmin();
  const allowed = allowedKbIds === null ? null : new Set(allowedKbIds);
  const allPages = (await Promise.all(kbs.map((kb) => getAllPagesForAdmin(kb.id)))).flat();
  const kbById = new Map(kbs.map((kb) => [kb.id, kb]));
  // Sources are resolved across every KB — an excerpt may legitimately point at
  // another KB — but only host pages in scope are reported, and a source the
  // caller cannot read contributes staleness without disclosing its title.
  const pageById = new Map(allPages.map((page) => [page.id, page]));
  const hostPages = allowed === null ? allPages : allPages.filter((page) => allowed.has(page.kbId));
  const canSee = (kbId: string) => allowed === null || allowed.has(kbId);
  const stale: StaleExcerptItem[] = [];

  for (const page of hostPages) {
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
          sourceTitle: canSee(source.kbId) ? source.title : "(source in another knowledge base)",
          sourceUpdatedDisplayDate: source.updatedDisplayDate,
          excerptBlockId: block.blockId,
        });
      }
    }
  }

  return stale.slice(0, 50);
}
