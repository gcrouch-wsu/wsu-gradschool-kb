import { checkSourcedSection, type SourcedCheckState } from "@/lib/sourced-content";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import type { ContentBlock, KbPage } from "@/lib/types";

/** Cap parallel live fetches so on-demand scans stay within serverless budgets. */
const SOURCE_CHECK_CONCURRENCY = 5;

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

function sourceCheckKey(sourceUrl: string, sourceAnchor?: string, contentHash?: string) {
  return `${sourceUrl}\0${sourceAnchor ?? ""}\0${contentHash ?? ""}`;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(workers);
}

/**
 * Re-check every sourced-content block in the editor's accessible KBs.
 * Uses the existing fetch+hash check (no wp-json polling yet).
 * Identical source URL/anchor/hash pairs are checked once; fetches run with a concurrency cap.
 */
export async function scanSourcedContentForReview(
  allowedKbIds: string[] | null = null,
): Promise<{ checked: number; findings: SourcedReviewFinding[] }> {
  const allowed = allowedKbIds === null ? null : new Set(allowedKbIds);
  const allKbs = await getAllKbsForAdmin();
  const kbs = allowed === null ? allKbs : allKbs.filter((kb) => allowed.has(kb.id));
  const findings: SourcedReviewFinding[] = [];
  let checked = 0;

  type Job = {
    page: KbPage;
    kbSlug: string;
    block: ReturnType<typeof collectSourcedBlocks>[number];
  };
  const jobs: Job[] = [];

  for (const kb of kbs) {
    const pages: KbPage[] = await getAllPagesForAdmin(kb.id);
    for (const page of pages) {
      if (page.status === "archived") continue;
      for (const block of collectSourcedBlocks(page.blocks)) {
        jobs.push({ page, kbSlug: kb.slug, block });
      }
    }
  }

  const uniqueMeta = new Map<
    string,
    { sourceUrl: string; sourceAnchor?: string; contentHash?: string }
  >();
  for (const job of jobs) {
    const key = sourceCheckKey(job.block.sourceUrl, job.block.sourceAnchor, job.block.contentHash);
    if (!uniqueMeta.has(key)) {
      uniqueMeta.set(key, {
        sourceUrl: job.block.sourceUrl,
        sourceAnchor: job.block.sourceAnchor,
        contentHash: job.block.contentHash,
      });
    }
  }

  const stateByKey = new Map<string, SourcedCheckState>();
  await mapPool([...uniqueMeta.entries()], SOURCE_CHECK_CONCURRENCY, async ([key, meta]) => {
    const state = await checkSourcedSection(meta.sourceUrl, meta.sourceAnchor, meta.contentHash);
    stateByKey.set(key, state);
  });

  for (const job of jobs) {
    checked += 1;
    const key = sourceCheckKey(job.block.sourceUrl, job.block.sourceAnchor, job.block.contentHash);
    const state = stateByKey.get(key) ?? "unreachable";
    if (state === "unchanged") continue;
    findings.push({
      pageId: job.page.id,
      pageTitle: job.page.title,
      pageStatus: job.page.status,
      kbSlug: job.kbSlug,
      blockId: job.block.blockId,
      label: job.block.label,
      sourceUrl: job.block.sourceUrl,
      sourceAnchor: job.block.sourceAnchor,
      state,
    });
  }

  return { checked, findings };
}
