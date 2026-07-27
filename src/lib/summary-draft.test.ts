import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessPageReadyForSummaryDraft,
  buildSummaryDraftPrompt,
  cleanSummaryDraft,
  formatBlocksForSummary,
  isCompleteSummaryDraft,
  requestSummaryDraftFromGateway,
} from "@/lib/summary-draft-core";
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

  it("strips leaked planning and keeps the drafted prose", () => {
    const leaked = [
      'The user wants a summary of the entire "Graduate Program Bylaw Guidance" page.',
      "I need to cover all major sections in continuous prose, 3-6 sentences.",
      "Let me map out the key content from each section:",
      "1. Before you begin - purpose of the page",
      "2. Components of graduate program bylaws",
      "I need to condense this into 3-6 sentences of continuous prose. Let me draft:",
      "The page serves as a comprehensive guide for developing or revising graduate program bylaws,",
      "noting that programs must align with Graduate School policy and submit bylaws annually.",
    ].join("\n");
    const cleaned = cleanSummaryDraft(leaked);
    expect(cleaned.startsWith("The page serves as a comprehensive guide")).toBe(true);
    expect(cleaned).not.toMatch(/Let me map|The user wants|1\. Before you begin/i);
  });

  it("returns empty when only reasoning is present", () => {
    expect(
      cleanSummaryDraft(
        "The user wants a summary. Let me map out the key content:\n1. One\n2. Two\nI need to condense this.",
      ),
    ).toBe("");
  });

  it("detects mid-sentence truncation", () => {
    expect(
      isCompleteSummaryDraft(
        "This page provides comprehensive guidance for developing or revising graduate program bylaws, noting",
      ),
    ).toBe(false);
    expect(
      isCompleteSummaryDraft(
        "This page provides comprehensive guidance for developing or revising graduate program bylaws.",
      ),
    ).toBe(true);
  });

  it("caps cleaned drafts at SUMMARY_DRAFT_MAX_CHARS", async () => {
    const { SUMMARY_DRAFT_MAX_CHARS } = await import("@/lib/summary-draft-core");
    const long = "The page covers graduate policies in detail. ".repeat(200);
    expect(cleanSummaryDraft(long).length).toBeLessThanOrEqual(SUMMARY_DRAFT_MAX_CHARS);
    expect(isCompleteSummaryDraft(cleanSummaryDraft(long))).toBe(true);
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

    expect(summary.summary).toBe("A clear draft.");
    expect(summary.usage.callCount).toBe(1);
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
    expect(payload.max_tokens).toBeGreaterThanOrEqual(1000);
    expect(payload.messages[1]?.content).toContain("## Eligibility");
    expect(payload.messages[1]?.content).toContain("Write a summary of the entire page now.");
    expect(payload.messages[1]?.content).toMatch(/summary prose only/i);
  });

  it("retries once when the first draft is truncated mid-sentence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "This page provides comprehensive guidance for developing or revising graduate program bylaws, noting",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "This page provides comprehensive guidance for developing or revising graduate program bylaws, noting annual submission to the Graduate School.",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestSummaryDraftFromGateway({
        title: "Bylaws",
        bodyText: "x".repeat(200),
        endpoint: "https://ai.example/v1",
        apiKey: "k",
        model: "m",
      }),
    ).resolves.toMatchObject({ summary: expect.stringMatching(/Graduate School\.$/) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects responses that are only planning text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "The user wants a summary. Let me map out:\n1. One\n2. Two\nI need to condense this.",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
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
    ).rejects.toThrow(/planning text|cut off mid-sentence/i);
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
    ).resolves.toMatchObject({ summary: "Alternate shape summary." });
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
