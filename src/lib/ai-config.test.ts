import { describe, expect, it, vi } from "vitest";
import { formatAiModelLabel, getAiProviderInfo } from "@/lib/ai-config";
import { emptyAiTokenUsage, normalizeAiUsageForRecord } from "@/lib/ai-usage-core";

describe("ai-config", () => {
  it("reports configured when all env vars are present", () => {
    vi.stubEnv("AI_MODEL", "inclusionai/ling-3.0-flash-free");
    vi.stubEnv("AI_PROVIDER_ENDPOINT", "https://ai.example/v1/chat/completions");
    vi.stubEnv("AI_API_KEY", "vck_test");
    expect(getAiProviderInfo()).toEqual({
      model: "inclusionai/ling-3.0-flash-free",
      configured: true,
      hasEndpoint: true,
      hasKey: true,
    });
    expect(formatAiModelLabel(getAiProviderInfo())).toBe("inclusionai/ling-3.0-flash-free");
    vi.unstubAllEnvs();
  });

  it("labels incomplete config when model is set without credentials", () => {
    vi.stubEnv("AI_MODEL", "inclusionai/ling-3.0-flash-free");
    vi.stubEnv("AI_PROVIDER_ENDPOINT", "");
    vi.stubEnv("AI_API_KEY", "");
    expect(formatAiModelLabel(getAiProviderInfo())).toBe(
      "inclusionai/ling-3.0-flash-free (incomplete config)",
    );
    vi.unstubAllEnvs();
  });
});

describe("normalizeAiUsageForRecord", () => {
  it("counts a successful call even when token totals are zero", () => {
    expect(normalizeAiUsageForRecord(emptyAiTokenUsage())).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      callCount: 1,
    });
  });
});
