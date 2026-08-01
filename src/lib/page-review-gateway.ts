import { AiGatewayError } from "@/lib/ai-gateway";
import { parseAiTokenUsage, type AiTokenUsage } from "@/lib/ai-usage-core";
import {
  buildPageReviewPrompt,
  parsePageReviewResponse,
  type PageReviewResult,
} from "@/lib/page-review-core";
import type { ContentBlock } from "@/lib/types";

// Server-only: this file holds the provider fetch and is handed an API key. See ai-gateway.ts.
if (typeof window !== "undefined") {
  throw new Error("page-review-gateway.ts is server-only and must not be imported from client code.");
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
      // Nothing came back, so nothing was billed that we can account for.
      throw new AiGatewayError("The AI page review timed out. Try again.");
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
    throw new AiGatewayError(message, usage);
  }

  // A 200 with unusable content was still billed — carry the usage so it gets metered.
  const content = payload?.choices?.[0]?.message?.content || payload?.output_text || payload?.text;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiGatewayError("The AI provider returned an empty page review.", usage);
  }
  return { ...parsePageReviewResponse(content), usage };
}
