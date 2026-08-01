// Client-safe. This module is imported by client components (the page editor readiness
// panel, the settings prompt screen), so it must stay free of gateway credentials and
// provider fetches — those live in summary-draft-gateway.ts (FB-42).
import { blocksToPlainText } from "@/lib/revision-diff";
import type { ContentBlock } from "@/lib/types";

export const SUMMARY_DRAFT_MAX_BODY_CHARS = 100_000;

/** Cap on cleaned AI draft text written into the summary field. */
export const SUMMARY_DRAFT_MAX_CHARS = 2_500;

/** Default system prompt used when Site Settings has no custom AI summary prompt. */
export const DEFAULT_AI_SUMMARY_SYSTEM_PROMPT = [
  "You write page summaries for a university graduate-school knowledge base.",
  "You MUST base the summary on the FULL page content provided (all sections), not only the opening paragraphs.",
  "Cover the page purpose and the main topics from every major section in the outline.",
  "Your entire reply must be the finished summary as continuous prose: usually 2–4 sentences (up to 6 for long multi-section pages).",
  "Start the reply with the first word of the summary. Do not include reasoning, planning, outlines, numbered lists, headings, markdown, or preamble.",
  "End with a complete sentence (period). Tone: clear, neutral, governance-appropriate. Do not invent facts not present in the page.",
].join(" ");

/** Completion budget for summary drafts (provider max_tokens). */
export const SUMMARY_DRAFT_MAX_TOKENS = 1_200;

const REASONING_START =
  /^(the user wants|i need to|i'll |i will |let me |first[,:]|okay[,.]|sure[,.]|here(?:'s| is) (?:my |the )?plan)\b/i;

const SUMMARY_START =
  /(?:^|\n)\s*((?:The|This|These)\s+(?:page|article|guide|document|section|handbook|resource)\b[\s\S]+)/i;

const DRAFT_DELIMITERS =
  /(?:^|\n)\s*(?:Let me draft|Here(?:'s| is) (?:the |my |a )?summary|Final (?:answer|summary)|Summary text|Draft)\s*:\s*/gi;

const MIN_BODY_CHARS = 120;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/(div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/** Plain text optimized for summarization (heading markers + full body). */
export function formatBlocksForSummary(blocks: ContentBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const text = stripHtml(block.html ?? block.text ?? "");
        if (text) lines.push(`${"#".repeat(block.level)} ${text}`);
        break;
      }
      case "paragraph":
      case "alert":
        lines.push(stripHtml(block.html ?? block.text ?? ""));
        break;
      case "list":
        for (let i = 0; i < block.items.length; i += 1) {
          const html = block.itemHtml?.[i];
          lines.push(`- ${stripHtml(html ?? block.items[i] ?? "")}`);
        }
        break;
      case "card":
        if (block.title) lines.push(`### ${block.title}`);
        lines.push(formatBlocksForSummary(block.blocks));
        break;
      case "procedure_section":
        lines.push(`## ${block.title}`);
        lines.push(formatBlocksForSummary(block.blocks));
        break;
      case "sourced":
        lines.push(`## ${block.headingText || block.label || "Source"}`);
        lines.push(formatBlocksForSummary(block.blocks));
        break;
      case "table":
        for (const row of block.rows ?? []) {
          lines.push(row.map((cell) => stripHtml(cell)).join(" | "));
        }
        break;
      case "image":
        if (block.alt) lines.push(`[Image: ${block.alt}]`);
        break;
      case "asset_link":
        lines.push(`[File: ${block.label || block.assetId}]`);
        break;
      case "video":
        if (block.title) lines.push(`[Video: ${block.title}]`);
        break;
      case "section_divider":
        lines.push("---");
        break;
      case "excerpt":
        lines.push(`[Excerpt: ${block.label || block.sourcePageId}]`);
        break;
      default:
        break;
    }
  }
  return lines
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean)
    .join("\n");
}

export function extractOutline(bodyText: string): string {
  const headings = bodyText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{2,3}\s+\S/.test(line));
  if (headings.length === 0) return "(no section headings)";
  return headings.join("\n");
}

/** Client-safe readiness check — no server-only imports. */
export function assessPageReadyForSummaryDraft(input: {
  title: string;
  blocks: ContentBlock[];
}): { ok: true; bodyText: string } | { ok: false; message: string } {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, message: "Add a page title before drafting a summary with AI." };
  }
  const bodyText = formatBlocksForSummary(input.blocks).trim() || blocksToPlainText(input.blocks).trim();
  if (bodyText.length < MIN_BODY_CHARS) {
    return {
      ok: false,
      message: `Finish the page body first (at least ${MIN_BODY_CHARS} characters of content) so AI can draft a useful summary.`,
    };
  }
  return { ok: true, bodyText };
}

export function buildSummaryDraftPrompt(
  title: string,
  bodyText: string,
  systemPrompt = DEFAULT_AI_SUMMARY_SYSTEM_PROMPT,
): {
  system: string;
  user: string;
} {
  const clipped =
    bodyText.length > SUMMARY_DRAFT_MAX_BODY_CHARS
      ? `${bodyText.slice(0, SUMMARY_DRAFT_MAX_BODY_CHARS)}\n\n[Truncated for length — prefer earlier and later sections equally in the summary.]`
      : bodyText;
  const outline = extractOutline(clipped);
  const system = systemPrompt.trim() || DEFAULT_AI_SUMMARY_SYSTEM_PROMPT;
  return {
    system,
    user: [
      `Page title: ${title}`,
      "",
      "Section outline (must be reflected in the summary):",
      outline,
      "",
      "Full page content:",
      clipped,
      "",
      "Write a summary of the entire page now.",
      "Reply with the summary prose only — no planning, no lists, no commentary.",
    ].join("\n"),
  };
}

function looksLikeReasoningLeak(text: string): boolean {
  const head = text.slice(0, 280);
  if (REASONING_START.test(head.trim())) {
    return true;
  }
  // Numbered planning outline near the start (e.g. "1. Before you begin - …").
  if (/\n\s*\d+\.\s+\S[\s\S]{0,120}\n\s*\d+\.\s+\S/.test(`\n${head}`)) {
    return true;
  }
  return false;
}

function extractFinishedSummary(text: string): string {
  const parts = text.split(DRAFT_DELIMITERS).map((part) => part.trim()).filter(Boolean);
  let candidate = parts.length > 1 ? parts[parts.length - 1] : text;

  if (looksLikeReasoningLeak(candidate)) {
    const match = candidate.match(SUMMARY_START);
    if (match?.[1]) {
      candidate = match[1].trim();
    }
  }

  // Drop trailing planning fragments if the model appended more notes after the prose.
  candidate = candidate.split(/\n\s*(?:Let me |I need to |Next[,:]|TODO:)/i)[0]?.trim() || candidate;
  return candidate;
}

export function cleanSummaryDraft(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    text = fenced[1].trim();
  }
  // Strip think / reasoning channel tags (closed or truncated).
  text = text.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
  text = text.replace(/^[\s\S]*?<\/think>/i, "").trim();
  text = text.replace(/<\/?think\b[^>]*>/gi, "").trim();

  text = extractFinishedSummary(text);
  text = text.replace(/^["“]|["”]$/g, "").trim();
  text = text.replace(/^Summary:\s*/i, "").trim();
  text = text.replace(/^["“]|["”]$/g, "").trim();
  // Collapse to a single prose field value.
  text = text.replace(/\s+/g, " ").trim();

  if (!text || looksLikeReasoningLeak(text)) {
    return "";
  }
  if (text.length <= SUMMARY_DRAFT_MAX_CHARS) {
    return text;
  }
  // Prefer a sentence boundary when capping, so we never store a mid-word cut.
  const clipped = text.slice(0, SUMMARY_DRAFT_MAX_CHARS);
  const lastStop = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  if (lastStop >= 80) {
    return clipped.slice(0, lastStop + 1).trim();
  }
  return clipped.trim();
}

/** True when the draft ends like a finished sentence (not mid-clause truncation). */
export function isCompleteSummaryDraft(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  // Mid-generation cuts often end on a comma or a dangling connector ("…, noting").
  if (/,\s*$/.test(trimmed) || /\b(?:noting|including|and|or|but|with|for|to|of|the|a|an)\s*$/i.test(trimmed)) {
    return false;
  }
  return /[.!?]["’”']?\s*$/.test(trimmed);
}
