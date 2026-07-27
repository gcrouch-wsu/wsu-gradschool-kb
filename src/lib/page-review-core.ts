import { parseAiTokenUsage, type AiTokenUsage } from "@/lib/ai-usage";
import { blocksToPlainText } from "@/lib/revision-diff";
import { textToRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";
import { SUMMARY_DRAFT_MAX_BODY_CHARS, extractOutline, formatBlocksForSummary } from "@/lib/summary-draft-core";

export type PageReviewSeverity = "must" | "should" | "optional";
export type PageReviewKind = "prose" | "alt" | "grammar" | "style" | "structure" | "readability";

export interface PageReviewSuggestion {
  id: string;
  severity: PageReviewSeverity;
  kind: PageReviewKind;
  blockId: string;
  message: string;
  currentSnippet?: string;
  /** Replacement plain text for paragraph/heading/alert (or one list item). */
  proposedText?: string;
  /** List item index when kind targets a list item. */
  itemIndex?: number;
  /** Proposed image alt text. */
  proposedAlt?: string;
}

export interface PageReviewResult {
  overview: string;
  suggestions: PageReviewSuggestion[];
}

/** Default system prompt for AI page style / readability / grammar review. */
export const DEFAULT_AI_PAGE_SYSTEM_PROMPT = [
  "You review graduate-school knowledge-base pages for style consistency, readability, grammar, and accessibility.",
  "Return ONLY valid JSON (no markdown fences, no preamble, no reasoning) matching this shape:",
  '{"overview":"1-3 sentence review summary","suggestions":[{"id":"s1","severity":"must|should|optional","kind":"prose|alt|grammar|style|structure|readability","blockId":"<exact block id>","message":"why this change","currentSnippet":"short quote","proposedText":"optional full replacement for that block text","itemIndex":0,"proposedAlt":"optional better alt text"}]}',
  "Rules:",
  "- Use only blockIds from the provided inventory. Never invent block ids.",
  "- Prefer minimal diffs: proposedText/proposedAlt only when you can give concrete replacement wording.",
  "- For images: if alt is missing, vague, or decorative-but-informative, suggest proposedAlt (kind alt).",
  "- Do not rewrite excerpt or sourced blocks; you may leave a structure note without proposedText.",
  "- Keep WSU Graduate School tone: clear, neutral, governance-appropriate.",
  "- Cap suggestions at 25, highest severity first.",
  "- Do not invent policy facts. Do not include chain-of-thought outside the JSON.",
].join(" ");

const SEVERITIES: PageReviewSeverity[] = ["must", "should", "optional"];
const KINDS: PageReviewKind[] = ["prose", "alt", "grammar", "style", "structure", "readability"];

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

function walkBlocks(
  blocks: ContentBlock[],
  visit: (block: ContentBlock, path: string) => void,
  path = "",
): void {
  for (const block of blocks) {
    visit(block, path);
    if (block.type === "card" || block.type === "procedure_section") {
      walkBlocks(block.blocks, visit, `${path}${block.blockId}/`);
    }
  }
}

/** Compact inventory the model can cite by blockId. */
export function buildBlockInventory(blocks: ContentBlock[]): string {
  const lines: string[] = [];
  walkBlocks(blocks, (block) => {
    switch (block.type) {
      case "paragraph":
      case "heading":
      case "alert": {
        const text = stripHtml(block.html ?? block.text ?? "").slice(0, 240);
        lines.push(
          `- ${block.blockId} [${block.type}${block.type === "heading" ? ` h${block.level}` : ""}]: ${text || "(empty)"}`,
        );
        break;
      }
      case "list": {
        const items = block.items.map((item, i) => `  [${i}] ${stripHtml(item).slice(0, 120)}`).join("\n");
        lines.push(`- ${block.blockId} [list${block.ordered ? " ol" : " ul"}]:\n${items || "  (empty)"}`);
        break;
      }
      case "image": {
        const alt = block.decorative ? "(decorative)" : block.alt?.trim() || "(MISSING ALT)";
        lines.push(`- ${block.blockId} [image]: alt=${alt}`);
        break;
      }
      case "excerpt":
        lines.push(`- ${block.blockId} [excerpt]: do not rewrite body`);
        break;
      case "sourced":
        lines.push(`- ${block.blockId} [sourced]: do not rewrite body`);
        break;
      case "table":
        lines.push(`- ${block.blockId} [table]: ${block.rows.length} rows`);
        break;
      default:
        lines.push(`- ${block.blockId} [${block.type}]`);
    }
  });
  return lines.join("\n");
}

export function buildPageReviewPrompt(input: {
  title: string;
  blocks: ContentBlock[];
  systemPrompt?: string;
}): { system: string; user: string } {
  const bodyText = formatBlocksForSummary(input.blocks);
  const clipped =
    bodyText.length > SUMMARY_DRAFT_MAX_BODY_CHARS
      ? `${bodyText.slice(0, SUMMARY_DRAFT_MAX_BODY_CHARS)}\n\n[Truncated for length.]`
      : bodyText;
  const outline = extractOutline(clipped);
  const system = (input.systemPrompt ?? "").trim() || DEFAULT_AI_PAGE_SYSTEM_PROMPT;
  return {
    system,
    user: [
      `Page title: ${input.title}`,
      "",
      "Section outline:",
      outline || "(none)",
      "",
      "Block inventory (use these exact blockIds):",
      buildBlockInventory(input.blocks) || "(no blocks)",
      "",
      "Full page body:",
      clipped || blocksToPlainText(input.blocks),
      "",
      "Return the JSON review object now.",
    ].join("\n"),
  };
}

function asSeverity(value: unknown): PageReviewSeverity {
  return SEVERITIES.includes(value as PageReviewSeverity) ? (value as PageReviewSeverity) : "should";
}

function asKind(value: unknown): PageReviewKind {
  return KINDS.includes(value as PageReviewKind) ? (value as PageReviewKind) : "style";
}

export function parsePageReviewResponse(raw: string): PageReviewResult {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  text = text.replace(/^[\s\S]*?<\/think>/i, "").trim();
  // Prefer the outermost JSON object if the model added chatter.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The AI provider returned a review that was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The AI provider returned an empty review.");
  }
  const record = parsed as Record<string, unknown>;
  const overview =
    typeof record.overview === "string" ? record.overview.replace(/\s+/g, " ").trim().slice(0, 800) : "";
  const rawSuggestions = Array.isArray(record.suggestions) ? record.suggestions : [];
  const suggestions: PageReviewSuggestion[] = [];
  const seenIds = new Map<string, number>();
  for (let i = 0; i < rawSuggestions.length && suggestions.length < 40; i += 1) {
    const item = rawSuggestions[i];
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const blockId = typeof row.blockId === "string" ? row.blockId.trim() : "";
    const message = typeof row.message === "string" ? row.message.replace(/\s+/g, " ").trim() : "";
    if (!blockId || !message) continue;
    const baseId = typeof row.id === "string" && row.id.trim() ? row.id.trim().slice(0, 56) : `s${i + 1}`;
    const duplicateCount = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, duplicateCount + 1);
    const id = duplicateCount === 0 ? baseId : `${baseId}-${duplicateCount + 1}`.slice(0, 64);
    const suggestion: PageReviewSuggestion = {
      id,
      severity: asSeverity(row.severity),
      kind: asKind(row.kind),
      blockId: blockId.slice(0, 120),
      message: message.slice(0, 500),
    };
    if (typeof row.currentSnippet === "string" && row.currentSnippet.trim()) {
      suggestion.currentSnippet = row.currentSnippet.replace(/\s+/g, " ").trim().slice(0, 240);
    }
    if (typeof row.proposedText === "string" && row.proposedText.trim()) {
      suggestion.proposedText = row.proposedText.trim().slice(0, 4_000);
    }
    if (typeof row.proposedAlt === "string" && row.proposedAlt.trim()) {
      suggestion.proposedAlt = row.proposedAlt.trim().slice(0, 500);
    }
    if (typeof row.itemIndex === "number" && Number.isInteger(row.itemIndex) && row.itemIndex >= 0) {
      suggestion.itemIndex = row.itemIndex;
    }
    suggestions.push(suggestion);
  }
  return { overview, suggestions };
}

function mapBlocksDeep(
  blocks: ContentBlock[],
  blockId: string,
  mapper: (block: ContentBlock) => ContentBlock | null,
): { blocks: ContentBlock[]; found: boolean; applied: boolean } {
  let found = false;
  let applied = false;
  const next = blocks.map((block) => {
    if (block.blockId === blockId) {
      found = true;
      const mapped = mapper(block);
      if (mapped) {
        applied = true;
        return mapped;
      }
      return block;
    }
    if (block.type === "card" || block.type === "procedure_section") {
      const nested = mapBlocksDeep(block.blocks, blockId, mapper);
      if (nested.found) {
        found = true;
        if (nested.applied) {
          applied = true;
          return { ...block, blocks: nested.blocks };
        }
      }
    }
    return block;
  });
  return { blocks: next, found, applied };
}

/** Apply one suggestion to the block tree. Returns null if not applicable. */
export function applyPageReviewSuggestion(
  blocks: ContentBlock[],
  suggestion: PageReviewSuggestion,
): ContentBlock[] | null {
  if (suggestion.proposedAlt !== undefined) {
    const result = mapBlocksDeep(blocks, suggestion.blockId, (block) => {
      if (block.type !== "image") return null;
      return {
        ...block,
        decorative: false,
        alt: suggestion.proposedAlt,
      };
    });
    return result.applied ? result.blocks : null;
  }

  if (suggestion.proposedText === undefined) {
    return null;
  }

  const result = mapBlocksDeep(blocks, suggestion.blockId, (block) => {
    if (block.type === "paragraph" || block.type === "heading" || block.type === "alert") {
      return { ...block, text: suggestion.proposedText!, html: undefined };
    }
    if (block.type === "list" && suggestion.itemIndex !== undefined) {
      const index = suggestion.itemIndex;
      if (index < 0 || index >= block.items.length) return null;
      const existingHtml = block.itemHtml?.[index] ?? "";
      if (/<(?:ul|ol)\b/i.test(existingHtml)) return null;
      const items = [...block.items];
      items[index] = suggestion.proposedText!;
      const itemHtml = block.itemHtml ? [...block.itemHtml] : undefined;
      if (itemHtml && index < itemHtml.length) {
        itemHtml[index] = textToRichText(suggestion.proposedText!);
      }
      return { ...block, items, itemHtml };
    }
    return null;
  });
  return result.applied ? result.blocks : null;
}

export function suggestionIsActionable(suggestion: PageReviewSuggestion): boolean {
  return Boolean(suggestion.proposedAlt?.trim() || suggestion.proposedText?.trim());
}

export async function requestPageReviewFromGateway(input: {
  title: string;
  blocks: ContentBlock[];
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
}): Promise<PageReviewResult & { usage: AiTokenUsage }> {
  const { system, user } = buildPageReviewPrompt({
    title: input.title,
    blocks: input.blocks,
    systemPrompt: input.systemPrompt,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  let response: Response;
  try {
    response = await fetch(input.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The AI page review timed out. Try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
    message?: string;
    output_text?: string;
    text?: string;
    usage?: Record<string, unknown>;
  } | null;

  const usage = parseAiTokenUsage(payload);

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : typeof payload?.message === "string"
          ? payload.message
        : `AI provider returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content || payload?.output_text || payload?.text;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The AI provider returned an empty page review.");
  }
  return { ...parsePageReviewResponse(content), usage };
}
