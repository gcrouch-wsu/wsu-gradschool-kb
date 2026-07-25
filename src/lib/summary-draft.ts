import { blocksToPlainText } from "@/lib/revision-diff";
import type { ContentBlock } from "@/lib/types";

const MIN_BODY_CHARS = 120;
const MAX_BODY_CHARS = 12_000;

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

export function assessPageReadyForSummaryDraft(input: {
  title: string;
  blocks: ContentBlock[];
}): { ok: true; bodyText: string } | { ok: false; message: string } {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, message: "Add a page title before drafting a summary with AI." };
  }
  const bodyText = blocksToPlainText(input.blocks).trim();
  if (bodyText.length < MIN_BODY_CHARS) {
    return {
      ok: false,
      message: `Finish the page body first (at least ${MIN_BODY_CHARS} characters of content) so AI can draft a useful summary.`,
    };
  }
  return { ok: true, bodyText };
}

export function buildSummaryDraftPrompt(title: string, bodyText: string): {
  system: string;
  user: string;
} {
  const clipped =
    bodyText.length > MAX_BODY_CHARS
      ? `${bodyText.slice(0, MAX_BODY_CHARS)}\n\n[Truncated for length.]`
      : bodyText;
  return {
    system: [
      "You write short page summaries for a university graduate-school knowledge base.",
      "Return only the summary text: one or two plain sentences.",
      "No markdown, no bullet lists, no quotation marks wrapping the whole answer, no title prefix.",
      "Tone: clear, neutral, governance-appropriate. Do not invent facts not present in the page.",
    ].join(" "),
    user: `Page title: ${title}\n\nPage content:\n${clipped}\n\nWrite the summary now.`,
  };
}

export function cleanSummaryDraft(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    text = fenced[1].trim();
  }
  text = text.replace(/^["“]|["”]$/g, "").trim();
  text = text.replace(/^Summary:\s*/i, "").trim();
  text = text.replace(/^["“]|["”]$/g, "").trim();
  return text.replace(/\s+/g, " ").slice(0, 600);
}

export async function requestSummaryDraftFromGateway(input: {
  title: string;
  bodyText: string;
  endpoint: string;
  apiKey: string;
  model: string;
}): Promise<string> {
  const { system, user } = buildSummaryDraftPrompt(input.title, input.bodyText);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
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
        max_tokens: 200,
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
