import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";
import type { AdminSession } from "@/lib/auth";
import type { ContentBlock, KnowledgeBase, KbPage } from "@/lib/types";

const blocks: ContentBlock[] = [
  {
    blockId: "p1",
    type: "paragraph",
    text: "Students must complete all required forms before the published deadline.",
  },
];

const page: KbPage = {
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
  blocks,
  relatedPageIds: [],
  relatedAssetIds: [],
  showToc: true,
  tocDepth: 2,
};

const kb: KnowledgeBase = {
  id: "kb-grad-school",
  title: "Graduate School",
  slug: "graduate-school",
  description: "",
  status: "published",
  visibility: "public",
  updatedOn: "2026-07-25",
  aiSummaryPrompt: "",
  aiPagePrompt: "",
};

function session(role: AdminSession["role"] = "owner"): AdminSession {
  return {
    userId: "owner-1",
    email: "owner@example.edu",
    role,
    source: "managed",
    expiresAt: Date.now() + 60_000,
    version: "v1",
  };
}

async function post(body: Record<string, unknown> = { title: "Ready", blocks }) {
  const { POST } = await import("@/app/api/admin/pages/[pageId]/page-review/route");
  return POST(
    new Request("http://localhost/api/admin/pages/page-1/page-review", {
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
  const rateLimit = await import("@/lib/rate-limit");
  vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
    ok: true,
    email: "owner@example.edu",
    session: session(),
  });
  vi.spyOn(security, "requireKbAccess").mockResolvedValue(null);
  vi.spyOn(store, "getPageByIdForAdmin").mockResolvedValue(page);
  vi.spyOn(store, "getKbById").mockResolvedValue(kb);
  vi.spyOn(rateLimit, "rateLimit").mockResolvedValue({
    allowed: true,
    remaining: 5,
    retryAfterSeconds: 0,
  });
}

function mockAiEnv() {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("AI_PROVIDER_ENDPOINT", "https://ai.example/v1/chat/completions");
  vi.stubEnv("AI_API_KEY", "vck_test");
  vi.stubEnv("AI_MODEL", "test-model");
}

describe("POST /api/admin/pages/[pageId]/page-review", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns the admin mutation guard response", async () => {
    const security = await import("@/lib/security");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }),
    });
    const response = await post();
    expect(response.status).toBe(401);
  });

  it("enforces KB access before review", async () => {
    const security = await import("@/lib/security");
    const store = await import("@/lib/kb-store");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: true,
      email: "editor@example.edu",
      session: session("editor"),
    });
    vi.spyOn(store, "getPageByIdForAdmin").mockResolvedValue(page);
    vi.spyOn(security, "requireKbAccess").mockResolvedValue(
      NextResponse.json({ message: "You are not assigned to this knowledge base." }, { status: 403 }),
    );

    const response = await post();
    expect(response.status).toBe(403);
  });

  it("rate limits page review requests", async () => {
    await mockAuthedPage();
    const rateLimit = await import("@/lib/rate-limit");
    vi.mocked(rateLimit.rateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });

    const response = await post();
    expect(response.status).toBe(429);
  });

  it("uses the KB page prompt override before the site default", async () => {
    mockAiEnv();
    await mockAuthedPage();
    const db = await import("@/lib/db");
    const store = await import("@/lib/kb-store");
    const pageReview = await import("@/lib/page-review-core");
    vi.mocked(store.getKbById).mockResolvedValue({
      ...kb,
      aiPagePrompt: "KB page prompt",
    });
    vi.spyOn(db, "loadSiteSettings").mockResolvedValue({
      ...DEFAULT_SITE_SETTINGS,
      aiPagePrompt: "Site page prompt",
    });
    const requestSpy = vi
      .spyOn(pageReview, "requestPageReviewFromGateway")
      .mockResolvedValue({
        overview: "Looks good.",
        suggestions: [],
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, callCount: 1 },
      });

    const response = await post();
    expect(response.status).toBe(200);
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: "KB page prompt",
      }),
    );
  });

  it("returns provider failures without persisting", async () => {
    mockAiEnv();
    await mockAuthedPage();
    const db = await import("@/lib/db");
    const pageReview = await import("@/lib/page-review-core");
    vi.spyOn(db, "loadSiteSettings").mockResolvedValue(DEFAULT_SITE_SETTINGS);
    vi.spyOn(pageReview, "requestPageReviewFromGateway").mockRejectedValue(new Error("provider down"));

    const response = await post();
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.message).toBe("provider down");
  });
});
