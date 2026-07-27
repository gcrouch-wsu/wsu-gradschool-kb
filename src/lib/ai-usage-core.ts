export type AiUsageFeature = "summary_draft" | "page_review";

/** Token totals from one or more OpenAI-compatible chat completion calls. */
export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
}

export function emptyAiTokenUsage(): AiTokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
}

export function addAiTokenUsage(left: AiTokenUsage, right: AiTokenUsage): AiTokenUsage {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    callCount: left.callCount + right.callCount,
  };
}

/** Parse `usage` from an OpenAI-compatible chat completions JSON body. */
export function parseAiTokenUsage(payload: unknown): AiTokenUsage {
  const usage =
    payload && typeof payload === "object" && "usage" in payload
      ? (payload as { usage?: Record<string, unknown> }).usage
      : null;
  const promptTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0) || 0;
  const completionTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0) || 0;
  const totalTokens =
    Number(usage?.total_tokens ?? 0) || promptTokens + completionTokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    callCount: 1,
  };
}

export function aiFeatureLabel(feature: AiUsageFeature): string {
  return feature === "summary_draft" ? "Draft with AI" : "Review with AI";
}
