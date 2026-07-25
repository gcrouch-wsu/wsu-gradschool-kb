import { checkSourcedSection, type SourcedCheckState } from "@/lib/sourced-content";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import type { ContentBlock, KbPage } from "@/lib/types";

export interface SourcedReviewFinding {
  pageId: string;
  pageTitle: string;
  pageStatus: string;
  kbSlug: string;
  blockId: string;
  label: string;
  sourceUrl: string;
  sourceAnchor?: string;
  state: Exclude<SourcedCheckState, "unchanged">;
}

export function collectSourcedBlocks(blocks: ContentBlock[]): Array<{
  blockId: string;
  sourceUrl: string;
  sourceAnchor?: string;
  contentHash?: string;
  label: string;
}> {
  const found: Array<{
    blockId: string;
    sourceUrl: string;
    sourceAnchor?: string;
    contentHash?: string;
    label: string;
  }> = [];

  function walk(list: ContentBlock[]) {
    for (const block of list) {
      if (block.type === "sourced") {
        found.push({
          blockId: block.blockId,
          sourceUrl: block.sourceUrl,
          sourceAnchor: block.sourceAnchor,
          contentHash: block.contentHash,
          label: block.label || block.headingText || block.sourceUrl,
        });
        walk(block.blocks);
      } else if (block.type === "card" || block.type === "procedure_section") {
        walk(block.blocks);
      }
    }
  }

  walk(blocks);
  return found;
}

/**
 * Re-check every sourced-content block in the editor's accessible KBs.
 * Uses the existing fetch+hash check (no wp-json polling yet).
 */
export async function scanSourcedContentForReview(
  allowedKbIds: string[] | null = null,
): Promise<{ checked: number; findings: SourcedReviewFinding[] }> {
  const allowed = allowedKbIds === null ? null : new Set(allowedKbIds);
  const allKbs = await getAllKbsForAdmin();
  const kbs = allowed === null ? allKbs : allKbs.filter((kb) => allowed.has(kb.id));
  const findings: SourcedReviewFinding[] = [];
  let checked = 0;

  for (const kb of kbs) {
    const pages: KbPage[] = await getAllPagesForAdmin(kb.id);
    for (const page of pages) {
      if (page.status === "archived") continue;
      const sourced = collectSourcedBlocks(page.blocks);
      for (const block of sourced) {
        checked += 1;
        const state = await checkSourcedSection(block.sourceUrl, block.sourceAnchor, block.contentHash);
        if (state === "unchanged") continue;
        findings.push({
          pageId: page.id,
          pageTitle: page.title,
          pageStatus: page.status,
          kbSlug: kb.slug,
          blockId: block.blockId,
          label: block.label,
          sourceUrl: block.sourceUrl,
          sourceAnchor: block.sourceAnchor,
          state,
        });
      }
    }
  }

  return { checked, findings };
}
