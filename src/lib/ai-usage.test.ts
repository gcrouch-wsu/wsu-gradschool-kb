import { describe, expect, it } from "vitest";
import { addAiTokenUsage, parseAiTokenUsage } from "@/lib/ai-usage";

describe("ai-usage helpers", () => {
  it("parses OpenAI-compatible usage fields", () => {
    expect(
      parseAiTokenUsage({
        usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
      }),
    ).toEqual({
      promptTokens: 12,
      completionTokens: 34,
      totalTokens: 46,
      callCount: 1,
    });
  });

  it("falls back to input/output token aliases and sums when total is missing", () => {
    expect(
      parseAiTokenUsage({
        usage: { input_tokens: 5, output_tokens: 7 },
      }),
    ).toEqual({
      promptTokens: 5,
      completionTokens: 7,
      totalTokens: 12,
      callCount: 1,
    });
  });

  it("returns zeros when usage is absent", () => {
    expect(parseAiTokenUsage({})).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      callCount: 1,
    });
    expect(parseAiTokenUsage(null)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      callCount: 1,
    });
  });

  it("adds usage across retries", () => {
    expect(
      addAiTokenUsage(
        { promptTokens: 10, completionTokens: 20, totalTokens: 30, callCount: 1 },
        { promptTokens: 4, completionTokens: 6, totalTokens: 10, callCount: 1 },
      ),
    ).toEqual({
      promptTokens: 14,
      completionTokens: 26,
      totalTokens: 40,
      callCount: 2,
    });
  });
});
