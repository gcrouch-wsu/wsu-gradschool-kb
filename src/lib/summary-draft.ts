import type { AdminSession } from "@/lib/auth";
import { resolveExcerptForRead } from "@/lib/excerpts";
import type { ContentBlock } from "@/lib/types";

// Server-side barrel: the client-safe helpers plus the gateway pieces, so route handlers
// have one import. Client components must import from `summary-draft-core` directly —
// pulling this in would drag the gateway module along with it.
export {
  DEFAULT_AI_SUMMARY_SYSTEM_PROMPT,
  SUMMARY_DRAFT_MAX_BODY_CHARS,
  SUMMARY_DRAFT_MAX_CHARS,
  SUMMARY_DRAFT_MAX_TOKENS,
  assessPageReadyForSummaryDraft,
  buildSummaryDraftPrompt,
  cleanSummaryDraft,
  formatBlocksForSummary,
  isCompleteSummaryDraft,
} from "@/lib/summary-draft-core";
export { getAiGatewayConfig, AiGatewayError, hasBilledTokens } from "@/lib/ai-gateway";
export { requestSummaryDraftFromGateway } from "@/lib/summary-draft-gateway";

/** Expand live excerpts the current editor can read so the model sees allowed included section text. Server-only. */
export async function expandBlocksForSummary(
  blocks: ContentBlock[],
  session: AdminSession,
): Promise<ContentBlock[]> {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "excerpt") {
      const resolved = await resolveExcerptForRead(block, session);
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
      out.push({ ...block, blocks: await expandBlocksForSummary(block.blocks, session) });
      continue;
    }
    if (block.type === "procedure_section") {
      out.push({ ...block, blocks: await expandBlocksForSummary(block.blocks, session) });
      continue;
    }
    if (block.type === "sourced") {
      out.push({ ...block, blocks: await expandBlocksForSummary(block.blocks, session) });
      continue;
    }
    out.push(block);
  }
  return out;
}
