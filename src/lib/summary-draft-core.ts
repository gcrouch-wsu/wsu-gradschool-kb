import { blocksToPlainText } from "@/lib/revision-diff";
import type { ContentBlock } from "@/lib/types";

export const SUMMARY_DRAFT_MAX_BODY_CHARS = 100_000;

/** Default system prompt used when Site Settings has no custom AI summary prompt. */
export const DEFAULT_AI_SUMMARY_SYSTEM_PROMPT = [
  "You write page summaries for a university graduate-school knowledge base.",
  "You MUST base the summary on the FULL page content provided (all sections), not only the opening paragraphs.",
  "Cover the page purpose and the main topics from every major section in the outline.",
  "Return only the summary text: usually 2–4 plain sentences (more only if needed for multi-section pages).",
  "No markdown, no bullet lists, no quotation marks wrapping the whole answer, no title prefix, no preamble.",
  "Tone: clear, neutral, governance-appropriate. Do not invent facts not present in the page.",
].join(" ");

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

function extractOutline(bodyText: string): string {
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
    ].join("\n"),
  };
}

export function cleanSummaryDraft(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    text = fenced[1].trim();
  }
  text = text.replace(/^[\s\S]*?<\/think>/i, "").trim();
  text = text.replace(/^["“]|["”]$/g, "").trim();
  text = text.replace(/^Summary:\s*/i, "").trim();
  text = text.replace(/^["“]|["”]$/g, "").trim();
  return text.replace(/\s+/g, " ").slice(0, 900);
}

export function getAiGatewayConfig(): {
  endpoint: string;
  apiKey: string;
  model: string;
} | null {
  const endpoint = (process.env.AI_PROVIDER_ENDPOINT || "").trim();
  const apiKey = (process.env.AI_API_KEY || "").trim();
  const model = (process.env.AI_MODEL || "").trim();
  if (!endpoint || !apiKey || !model) {
    return null;
  }
  return { endpoint, apiKey, model };
}

export async function requestSummaryDraftFromGateway(input: {
  title: string;
  bodyText: string;
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
}): Promise<string> {
  const { system, user } = buildSummaryDraftPrompt(
    input.title,
    input.bodyText,
    input.systemPrompt ?? DEFAULT_AI_SUMMARY_SYSTEM_PROMPT,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(input.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        max_tokens: 450,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The AI provider timed out. Try again in a moment.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
    choices?: Array<{ message?: { content?: string } }>;
    output_text?: string;
    text?: string;
  };
  if (!response.ok) {
    const providerMessage = json.error?.message || json.message || `HTTP ${response.status}`;
    throw new Error(`AI provider request failed: ${providerMessage}`);
  }
  const raw =
    json.choices?.[0]?.message?.content || json.output_text || json.text || "";
  const summary = cleanSummaryDraft(String(raw));
  if (!summary) {
    throw new Error("The AI provider returned an empty summary.");
  }
  return summary;
}
