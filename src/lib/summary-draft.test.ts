import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessPageReadyForSummaryDraft,
  buildSummaryDraftPrompt,
  cleanSummaryDraft,
  formatBlocksForSummary,
  requestSummaryDraftFromGateway,
} from "@/lib/summary-draft";
import type { ContentBlock } from "@/lib/types";

function longBody(): ContentBlock[] {
  return [
    {
      blockId: "h1",
      type: "heading",
      level: 2,
      text: "Eligibility",
    },
    {
      blockId: "p1",
      type: "paragraph",
      text: "Students must complete all required forms before the published deadline and meet residency rules for the term in question. ".repeat(
        3,
      ),
    },
    {
      blockId: "h2",
      type: "heading",
      level: 2,
      text: "Deadlines",
    },
    {
      blockId: "p2",
      type: "paragraph",
      text: "Submit materials by the published term deadline listed on the calendar. Late packets are returned. ".repeat(
        2,
      ),
    },
  ];
}

describe("summary-draft helpers", () => {
  it("rejects incomplete pages", () => {
    const missingTitle = assessPageReadyForSummaryDraft({
      title: "  ",
      blocks: longBody(),
    });
    expect(missingTitle.ok).toBe(false);

    const shortBody = assessPageReadyForSummaryDraft({
      title: "Policy",
      blocks: [{ blockId: "p", type: "paragraph", text: "Too short." }],
    });
    expect(shortBody.ok).toBe(false);
  });

  it("accepts a complete enough page", () => {
    const ready = assessPageReadyForSummaryDraft({
      title: "Assistantships",
      blocks: longBody(),
    });
    expect(ready.ok).toBe(true);
    if (ready.ok) {
      expect(ready.bodyText.length).toBeGreaterThan(120);
    }
  });

  it("formats headings for the model and includes them in the outline", () => {
    const text = formatBlocksForSummary(longBody());
    expect(text).toContain("## Eligibility");
    expect(text).toContain("## Deadlines");
    const prompt = buildSummaryDraftPrompt("Assistantships", text);
    expect(prompt.user).toContain("Section outline");
    expect(prompt.user).toContain("## Eligibility");
    expect(prompt.user).toContain("## Deadlines");
    expect(prompt.system).toMatch(/FULL page content/i);
  });

  it("cleans model output", () => {
    expect(cleanSummaryDraft('  "Summary: Hello world."  ')).toBe("Hello world.");
    expect(cleanSummaryDraft("<think>plan</think>\nFinal answer here.")).toBe("Final answer here.");
  });
});

describe("requestSummaryDraftFromGateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts OpenAI-compatible payload and returns cleaned content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'Summary: "A clear draft."' } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const summary = await requestSummaryDraftFromGateway({
      title: "Assistantships",
      bodyText: formatBlocksForSummary(longBody()),
      endpoint: "https://ai.example/v1/chat/completions",
      apiKey: "vck_test",
      model: "inclusionai/ling-3.0-flash-free",
    });

    expect(summary).toBe("A clear draft.");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.example/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer vck_test",
    });
    const payload = JSON.parse(String(init.body)) as {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.model).toBe("inclusionai/ling-3.0-flash-free");
    expect(payload.max_tokens).toBeGreaterThanOrEqual(400);
    expect(payload.messages[1]?.content).toContain("## Eligibility");
    expect(payload.messages[1]?.content).toContain("Write a summary of the entire page now.");
  });

  it("accepts output_text when choices are absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ output_text: "Alternate shape summary." }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      requestSummaryDraftFromGateway({
        title: "T",
        bodyText: "x".repeat(200),
        endpoint: "https://ai.example/v1",
        apiKey: "k",
        model: "m",
      }),
    ).resolves.toBe("Alternate shape summary.");
  });

  it("surfaces provider HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      requestSummaryDraftFromGateway({
        title: "T",
        bodyText: "x".repeat(200),
        endpoint: "https://ai.example/v1",
        apiKey: "k",
        model: "m",
      }),
    ).rejects.toThrow(/quota exceeded/);
  });

  it("maps AbortError to a timeout message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      }),
    );
    await expect(
      requestSummaryDraftFromGateway({
        title: "T",
        bodyText: "x".repeat(200),
        endpoint: "https://ai.example/v1",
        apiKey: "k",
        model: "m",
      }),
    ).rejects.toThrow(/timed out/i);
  });
});
