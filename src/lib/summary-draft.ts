import { resolveExcerptForExport } from "@/lib/excerpts";
import type { ContentBlock } from "@/lib/types";

export {
  DEFAULT_AI_SUMMARY_SYSTEM_PROMPT,
  SUMMARY_DRAFT_MAX_BODY_CHARS,
  assessPageReadyForSummaryDraft,
  buildSummaryDraftPrompt,
  cleanSummaryDraft,
  formatBlocksForSummary,
  getAiGatewayConfig,
  requestSummaryDraftFromGateway,
} from "@/lib/summary-draft-core";

/** Expand live excerpts so the model sees included section text, not a stub. Server-only. */
export async function expandBlocksForSummary(blocks: ContentBlock[]): Promise<ContentBlock[]> {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "excerpt") {
      const resolved = await resolveExcerptForExport(block);
      if (resolved.state === "ok") {
        const label = block.label?.trim() || resolved.sectionTitle || resolved.sourceTitle;
        out.push({
          blockId: `${block.blockId}-excerpt-label`,
          type: "heading",
          level: 3,
          text: `Included from: ${label}`,
        });
        out.push(...resolved.blocks);
      } else {
        out.push({
          blockId: `${block.blockId}-excerpt-missing`,
          type: "paragraph",
          text: `[Excerpt unavailable: ${block.label || block.sourcePageId}]`,
        });
      }
      continue;
    }
    if (block.type === "card") {
      out.push({ ...block, blocks: await expandBlocksForSummary(block.blocks) });
      continue;
    }
    if (block.type === "procedure_section") {
      out.push({ ...block, blocks: await expandBlocksForSummary(block.blocks) });
      continue;
    }
    if (block.type === "sourced") {
      out.push({ ...block, blocks: await expandBlocksForSummary(block.blocks) });
      continue;
    }
    out.push(block);
  }
  return out;
}
