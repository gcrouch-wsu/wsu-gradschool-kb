import { afterEach, describe, expect, it, vi } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth";
import { collectSourcedBlocks, scanSourcedContentForReview } from "@/lib/sourced-review";
import type { ContentBlock, KbPage, KnowledgeBase } from "@/lib/types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isCronAuthorized", () => {
  it("rejects when CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", "");
    delete process.env.CRON_SECRET;
    const request = new Request("http://localhost/api/admin/cron/x", {
      headers: { authorization: "Bearer anything" },
    });
    expect(isCronAuthorized(request)).toBe(false);
  });

  it("accepts a matching bearer token", () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const request = new Request("http://localhost/api/admin/cron/x", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    expect(isCronAuthorized(request)).toBe(true);
  });
});

describe("collectSourcedBlocks", () => {
  it("finds sourced blocks nested in cards and procedures", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "p1",
        type: "paragraph",
        text: "Intro",
      },
      {
        blockId: "card1",
        type: "card",
        background: "paper",
        blocks: [
          {
            blockId: "src1",
            type: "sourced",
            sourceUrl: "https://gradschool.wsu.edu/example/",
            sourceAnchor: "sec",
            contentHash: "abc",
            headingText: "Example",
            blocks: [],
          },
        ],
      },
    ];
    expect(collectSourcedBlocks(blocks)).toEqual([
      {
        blockId: "src1",
        sourceUrl: "https://gradschool.wsu.edu/example/",
        sourceAnchor: "sec",
        contentHash: "abc",
        label: "Example",
      },
    ]);
  });
});

describe("scanSourcedContentForReview", () => {
  function kb(id: string, slug: string): KnowledgeBase {
    return {
      id,
      slug,
      title: slug,
      description: "",
      status: "published",
      visibility: "public",
      updatedOn: "2026-01-01",
    };
  }

  function page(overrides: Partial<KbPage> & Pick<KbPage, "id" | "kbId" | "blocks">): KbPage {
    return {
      title: "Page",
      slug: "page",
      path: ["page"],
      sortOrder: 0,
      summary: "",
      status: "published",
      visibility: "public",
      ownerLabel: "Office",
      contactEmail: "a@b.edu",
      lastReviewedDate: "2026-01-01",
      nextReviewDate: "2027-01-01",
      showToc: true,
      tocDepth: 3,
      relatedPageIds: [],
      relatedAssetIds: [],
      updatedDisplayDate: "2026-01-01",
      ...overrides,
    };
  }

  it("scopes checks to allowedKbIds and dedupes identical source fetches", async () => {
    const kbStore = await import("@/lib/kb-store");
    const sourced = await import("@/lib/sourced-content");
    vi.spyOn(kbStore, "getAllKbsForAdmin").mockResolvedValue([kb("kb-a", "a"), kb("kb-b", "b")]);
    vi.spyOn(kbStore, "getAllPagesForAdmin").mockImplementation(async (kbId: string) => {
      const sourcedBlock: ContentBlock = {
        blockId: `src-${kbId}`,
        type: "sourced",
        sourceUrl: "https://gradschool.wsu.edu/shared/",
        sourceAnchor: "same",
        contentHash: "hash-1",
        headingText: "Shared",
        blocks: [],
      };
      return [page({ id: `page-${kbId}`, kbId, blocks: [sourcedBlock] })];
    });
    const check = vi.spyOn(sourced, "checkSourcedSection").mockResolvedValue("changed");

    const result = await scanSourcedContentForReview(["kb-a"]);

    expect(result.checked).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.kbSlug).toBe("a");
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/health", () => {
  it("returns ok without auth", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe("wsu-gradschool-kb");
    expect(typeof body.timestamp).toBe("string");
  });
});

describe("POST /api/admin/sourced-content/scan", () => {
  it("rejects viewers via requireAdminMutation", async () => {
    const { NextResponse } = await import("next/server");
    const security = await import("@/lib/security");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }),
    });
    const { POST } = await import("@/app/api/admin/sourced-content/scan/route");
    const response = await POST(new Request("http://localhost/api/admin/sourced-content/scan", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("scopes the scan with accessibleKbIds for an editor session", async () => {
    const security = await import("@/lib/security");
    const auth = await import("@/lib/auth");
    const review = await import("@/lib/sourced-review");
    const session = {
      userId: "ed-1",
      email: "editor@example.edu",
      role: "editor" as const,
      source: "managed" as const,
      expiresAt: Date.now() + 60_000,
      version: "v1" as const,
    };
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({ ok: true, email: session.email, session });
    vi.spyOn(auth, "accessibleKbIds").mockResolvedValue(["kb-allowed"]);
    const scan = vi.spyOn(review, "scanSourcedContentForReview").mockResolvedValue({ checked: 0, findings: [] });

    const { POST } = await import("@/app/api/admin/sourced-content/scan/route");
    const response = await POST(new Request("http://localhost/api/admin/sourced-content/scan", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(scan).toHaveBeenCalledWith(["kb-allowed"]);
  });
});
