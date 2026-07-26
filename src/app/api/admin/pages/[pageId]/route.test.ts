import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth";
import type { ContentBlock, KbPage, KnowledgeBase } from "@/lib/types";

const blocks: ContentBlock[] = [{ blockId: "p1", type: "paragraph", text: "Ready page." }];

const page: KbPage = {
  id: "page-1",
  kbId: "kb-grad-school",
  title: "Ready",
  slug: "ready",
  path: ["ready"],
  sortOrder: 1,
  summary: "Ready summary.",
  tags: ["ready"],
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
  id: page.kbId,
  title: "Graduate School",
  slug: "graduate-school",
  description: "",
  status: "published",
  visibility: "public",
  updatedOn: "2026-07-25",
};

function session(role: AdminSession["role"]): AdminSession {
  return {
    userId: `${role}-1`,
    email: `${role}@example.edu`,
    role,
    source: "managed",
    expiresAt: Date.now() + 60_000,
    version: "v1",
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    title: "Ready",
    slug: "ready",
    summary: "Ready summary.",
    visibility: "public",
    status: "draft",
    parentPath: [],
    sortOrder: 1,
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-07-25",
    blocks,
    showToc: true,
    tocDepth: 2,
    ...overrides,
  };
}

async function patch(input: Record<string, unknown>, role: AdminSession["role"] = "owner") {
  const security = await import("@/lib/security");
  const store = await import("@/lib/kb-store");
  vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
    ok: true,
    email: `${role}@example.edu`,
    session: session(role),
  });
  vi.spyOn(security, "requireKbAccess").mockResolvedValue(null);
  vi.spyOn(store, "getPageByIdForAdmin").mockResolvedValue(page);
  vi.spyOn(store, "getKbById").mockResolvedValue(kb);
  vi.spyOn(store, "getAssetStatusById").mockResolvedValue("active");
  vi.spyOn(store, "updatePage").mockResolvedValue({ ...page, ...input, status: input.status as KbPage["status"] });
  const audit = await import("@/lib/audit-log");
  vi.spyOn(audit, "recordAuditEvent").mockResolvedValue(undefined);
  const excerpts = await import("@/lib/excerpts");
  vi.spyOn(excerpts, "checkExcerptSourceForPublish").mockResolvedValue("ok");
  const { PATCH } = await import("@/app/api/admin/pages/[pageId]/route");
  return PATCH(
    new Request("http://localhost/api/admin/pages/page-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    { params: Promise.resolve({ pageId: "page-1" }) },
  );
}

describe("PATCH /api/admin/pages/[pageId]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("blocks editors from publishing through full page saves", async () => {
    const store = await import("@/lib/kb-store");
    const updateSpy = vi.spyOn(store, "updatePage");
    const response = await patch(body({ status: "published" }), "editor");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Only an owner or admin can publish pages. Submit the page for review instead.",
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("blocks editors from scheduling a publish", async () => {
    const store = await import("@/lib/kb-store");
    const updateSpy = vi.spyOn(store, "updatePage");
    const response = await patch(body({ publishAt: "2026-08-01T12:00" }), "editor");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Only an owner or admin can schedule publishing.",
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("passes normalized tags to page saves", async () => {
    const store = await import("@/lib/kb-store");
    const updateSpy = vi.spyOn(store, "updatePage");
    const response = await patch(body({ tags: "visa, deadlines, Visa" }), "owner");
    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["visa", "deadlines"],
      }),
      "owner@example.edu",
    );
  });
});
