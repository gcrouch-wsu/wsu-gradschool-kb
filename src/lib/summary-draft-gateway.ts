import { AiGatewayError } from "@/lib/ai-gateway";
import {
  addAiTokenUsage,
  emptyAiTokenUsage,
  parseAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai-usage-core";
import {
  DEFAULT_AI_SUMMARY_SYSTEM_PROMPT,
  SUMMARY_DRAFT_MAX_TOKENS,
  buildSummaryDraftPrompt,
  cleanSummaryDraft,
  isCompleteSummaryDraft,
} from "@/lib/summary-draft-core";

// Server-only: this file holds the provider fetch and is handed an API key. See ai-gateway.ts.
if (typeof window !== "undefined") {
  throw new Error("summary-draft-gateway.ts is server-only and must not be imported from client code.");
}

async function postSummaryDraftChat(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal: AbortSignal;
}): Promise<{ content: string; usage: AiTokenUsage }> {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      temperature: 0.15,
      max_tokens: SUMMARY_DRAFT_MAX_TOKENS,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
    choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
    output_text?: string;
    text?: string;
    usage?: Record<string, unknown>;
  };
  const usage = parseAiTokenUsage(json);
  if (!response.ok) {
    const providerMessage = json.error?.message || json.message || `HTTP ${response.status}`;
    throw new AiGatewayError(`AI provider request failed: ${providerMessage}`, usage);
  }
  return {
    content: String(json.choices?.[0]?.message?.content || json.output_text || json.text || ""),
    usage,
  };
}

export async function requestSummaryDraftFromGateway(input: {
  title: string;
  bodyText: string;
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
}): Promise<{ summary: string; usage: AiTokenUsage }> {
  const { system, user } = buildSummaryDraftPrompt(
    input.title,
    input.bodyText,
    input.systemPrompt ?? DEFAULT_AI_SUMMARY_SYSTEM_PROMPT,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  let usage = emptyAiTokenUsage();
  try {
    let raw = await postSummaryDraftChat({
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      model: input.model,
      system,
      user,
      signal: controller.signal,
    });
    usage = addAiTokenUsage(usage, raw.usage);
    let summary = cleanSummaryDraft(raw.content);

    // One automatic retry when the model burned tokens on planning and truncated.
    if (!summary || !isCompleteSummaryDraft(summary)) {
      raw = await postSummaryDraftChat({
        endpoint: input.endpoint,
        apiKey: input.apiKey,
        model: input.model,
        system:
          "Write only the finished page summary as continuous prose. No planning. No lists. Start with the summary. End with a period.",
        user: [
          user,
          "",
          "IMPORTANT: Your previous reply was cut off or included planning.",
          "Reply now with the complete summary only, starting immediately with the first sentence.",
        ].join("\n"),
        signal: controller.signal,
      });
      usage = addAiTokenUsage(usage, raw.usage);
      summary = cleanSummaryDraft(raw.content);
    }

    // These two reject a call the provider already billed. They throw empty usage because
    // the catch below attaches the running total — passing it here would double-count.
    if (!summary) {
      throw new AiGatewayError(
        "The AI provider returned planning text instead of a summary. Try Draft with AI again.",
      );
    }
    if (!isCompleteSummaryDraft(summary)) {
      throw new AiGatewayError("The AI draft was cut off mid-sentence. Try Draft with AI again.");
    }
    return { summary, usage };
  } catch (error) {
    if (error instanceof AiGatewayError) {
      // `usage` totals the calls that succeeded; `error.usage` covers the one that failed.
      throw new AiGatewayError(error.message, addAiTokenUsage(usage, error.usage));
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiGatewayError("The AI provider timed out. Try again in a moment.", usage);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
