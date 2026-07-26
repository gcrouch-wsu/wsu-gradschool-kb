import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentBlock } from "@/lib/types";

const longBlocks: ContentBlock[] = [
  {
    blockId: "p1",
    type: "paragraph",
    text: "Students must complete all required forms before the published deadline and meet residency rules for the term in question. ".repeat(
      3,
    ),
  },
];

describe("POST /api/admin/pages/[pageId]/summary-draft", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  function session() {
    return {
      userId: "owner-1",
      email: "owner@example.edu",
      role: "owner" as const,
      source: "managed" as const,
      expiresAt: Date.now() + 60_000,
      version: "v1" as const,
    };
  }

  async function post(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/admin/pages/[pageId]/summary-draft/route");
    return POST(
      new Request("http://localhost/api/admin/pages/page-1/summary-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ pageId: "page-1" }) },
    );
  }

  async function mockAuthedPage() {
    const security = await import("@/lib/security");
    const store = await import("@/lib/kb-store");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: true,
      email: "owner@example.edu",
      session: session(),
    });
    vi.spyOn(security, "requireKbAccess").mockResolvedValue(null);
    vi.spyOn(store, "getPageByIdForAdmin").mockResolvedValue({
      id: "page-1",
      kbId: "kb-grad-school",
      title: "Saved title",
      slug: "saved",
      path: ["saved"],
      sortOrder: 1,
      summary: "",
      status: "draft",
      visibility: "public",
      ownerLabel: "Graduate School",
      contactEmail: "gradschool@wsu.edu",
      lastReviewedDate: "2026-07-25",
      updatedDisplayDate: "2026-07-25",
      relatedPageIds: [],
      relatedAssetIds: [],
      showToc: true,
      tocDepth: 2,
      blocks: [],
    });
  }

  it("returns 501 when AI env is unset", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_PROVIDER_ENDPOINT", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    await mockAuthedPage();
    const response = await post({ title: "Ready", blocks: longBlocks });
    expect(response.status).toBe(501);
  });

  it("returns 422 when the page body is incomplete", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_PROVIDER_ENDPOINT", "https://ai.example/v1");
    vi.stubEnv("AI_API_KEY", "vck_test");
    vi.stubEnv("AI_MODEL", "test-model");
    await mockAuthedPage();
    const response = await post({ title: "Ready", blocks: [{ blockId: "p", type: "paragraph", text: "Short." }] });
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(String(data.message)).toMatch(/body/i);
  });

  it("returns 502 when the gateway call fails", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_PROVIDER_ENDPOINT", "https://ai.example/v1");
    vi.stubEnv("AI_API_KEY", "vck_test");
    vi.stubEnv("AI_MODEL", "test-model");
    await mockAuthedPage();
    const summaryDraft = await import("@/lib/summary-draft");
    vi.spyOn(summaryDraft, "requestSummaryDraftFromGateway").mockRejectedValue(new Error("provider down"));
    const response = await post({ title: "Ready", blocks: longBlocks });
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.message).toBe("provider down");
  });

  it("returns a draft summary on success", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_PROVIDER_ENDPOINT", "https://ai.example/v1");
    vi.stubEnv("AI_API_KEY", "vck_test");
    vi.stubEnv("AI_MODEL", "test-model");
    await mockAuthedPage();
    const summaryDraft = await import("@/lib/summary-draft");
    const requestSpy = vi
      .spyOn(summaryDraft, "requestSummaryDraftFromGateway")
      .mockResolvedValue("A short editable draft.");
    const response = await post({ title: "Ready", blocks: longBlocks });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true, summary: "A short editable draft." });
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Ready",
      }),
    );
    const call = requestSpy.mock.calls[0]?.[0] as { systemPrompt?: string };
    expect(typeof call.systemPrompt).toBe("string");
    expect(call.systemPrompt?.length).toBeGreaterThan(20);
  });

  it("expands excerpts through the current session read scope", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_PROVIDER_ENDPOINT", "https://ai.example/v1");
    vi.stubEnv("AI_API_KEY", "vck_test");
    vi.stubEnv("AI_MODEL", "test-model");
    await mockAuthedPage();
    const excerpts = await import("@/lib/excerpts");
    const resolveSpy = vi.spyOn(excerpts, "resolveExcerptForRead").mockResolvedValue({ state: "unavailable" });
    const summaryDraft = await import("@/lib/summary-draft");
    const requestSpy = vi
      .spyOn(summaryDraft, "requestSummaryDraftFromGateway")
      .mockResolvedValue("A short editable draft.");

    const response = await post({
      title: "Ready",
      blocks: [
        ...longBlocks,
        {
          blockId: "excerpt-1",
          type: "excerpt",
          sourcePageId: "private-source",
          label: "Private source",
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(resolveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePageId: "private-source" }),
      expect.objectContaining({ email: "owner@example.edu" }),
    );
    const call = requestSpy.mock.calls[0]?.[0] as { bodyText?: string };
    expect(call.bodyText).toContain("[Excerpt unavailable: Private source]");
  });
});
