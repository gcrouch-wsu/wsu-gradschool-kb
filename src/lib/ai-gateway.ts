import { emptyAiTokenUsage, type AiTokenUsage } from "@/lib/ai-usage-core";

// Server-only. This module reads gateway credentials from the environment, so it must never
// end up in a client bundle. Client components import prompt constants and readiness helpers
// from the `*-core` modules instead; those hold no credential or network code (FB-42).
if (typeof window !== "undefined") {
  throw new Error("ai-gateway.ts is server-only and must not be imported from client code.");
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

/**
 * Carries the tokens a call already consumed alongside the failure.
 *
 * A provider request that returns 200 and then fails our own post-processing (empty draft,
 * truncated prose, unparseable review) has still been billed. Throwing a plain Error there
 * loses the usage and the call never reaches `kb_ai_usage`, so metering silently
 * under-reports exactly the failures worth watching (FB-42).
 */
export class AiGatewayError extends Error {
  readonly usage: AiTokenUsage;

  constructor(message: string, usage: AiTokenUsage = emptyAiTokenUsage()) {
    super(message);
    this.name = "AiGatewayError";
    this.usage = usage;
  }
}

/** Usage recorded on a failure path is only worth writing when the provider actually billed. */
export function hasBilledTokens(usage: AiTokenUsage): boolean {
  return usage.totalTokens > 0 || usage.promptTokens > 0 || usage.completionTokens > 0;
}
