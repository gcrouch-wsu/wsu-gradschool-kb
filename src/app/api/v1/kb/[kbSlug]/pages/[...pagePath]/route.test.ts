import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentBlock, KbPage, KnowledgeBase } from "@/lib/types";

const validBlocks: ContentBlock[] = [{ blockId: "p1", type: "paragraph", text: "Ready page." }];

const kb: KnowledgeBase = {
  id: "kb-grad-school",
  title: "Graduate School",
  slug: "graduate-school",
  description: "",
  status: "published",
  visibility: "public",
  updatedOn: "2026-07-25",
};

const page: KbPage = {
  id: "page-1",
  kbId: kb.id,
  title: "Ready",
  slug: "ready",
  path: ["ready"],
  sortOrder: 1,
  summary: "Ready summary.",
  tags: ["ready"],
  status: "published",
  visibility: "public",
  ownerLabel: "Graduate School",
  contactEmail: "gradschool@wsu.edu",
  lastReviewedDate: "2026-07-25",
  updatedDisplayDate: "2026-07-25",
  blocks: validBlocks,
  relatedPageIds: [],
  relatedAssetIds: [],
  showToc: true,
  tocDepth: 2,
};

describe("GET /api/v1/kb/[kbSlug]/pages/[...pagePath]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function getPage(kbSlug: string, pagePath: string[], auth = true) {
    const { GET } = await import("@/app/api/v1/kb/[kbSlug]/pages/[...pagePath]/route");
    return GET(
      new Request(`http://localhost/api/v1/kb/${kbSlug}/pages/${pagePath.join("/")}`, {
        headers: auth ? { Authorization: "Bearer test-key" } : undefined,
      }),
      { params: Promise.resolve({ kbSlug, pagePath }) },
    );
  }

  it("rejects missing API keys", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "test-key");
    const response = await getPage("graduate-school", ["procedures"], false);
    expect(response.status).toBe(401);
  });

  it("returns a published public page", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "test-key");
    const response = await getPage("graduate-school", ["procedures", "maintaining-program-fact-sheets"]);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.kb.slug).toBe("graduate-school");
    expect(data.page.slug).toBe("maintaining-program-fact-sheets");
    expect(Array.isArray(data.page.blocks)).toBe(true);
  });

  it("hides private KBs from global keys, and draft/staff/group/link content", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "test-key");

    expect((await getPage("graduate-school-staff", ["private-staff-orientation"])).status).toBe(404);
    expect((await getPage("draft-preview", ["procedures"])).status).toBe(404);
    expect((await getPage("graduate-school", ["templates", "graduate-program-handbooks"])).status).toBe(404);
    expect((await getPage("graduate-school", ["reference"])).status).toBe(404);
    expect((await getPage("graduate-school", ["reference", "policies-and-procedures"])).status).toBe(404);
  });

  it("lets a scoped key read a published private KB and blocks other KBs", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "graduate-school-staff:staff-only-key");

    const { GET } = await import("@/app/api/v1/kb/[kbSlug]/pages/[...pagePath]/route");
    const allowed = await GET(
      new Request("http://localhost/api/v1/kb/graduate-school-staff/pages/private-staff-orientation", {
        headers: { Authorization: "Bearer staff-only-key" },
      }),
      {
        params: Promise.resolve({
          kbSlug: "graduate-school-staff",
          pagePath: ["private-staff-orientation"],
        }),
      },
    );
    expect(allowed.status).toBe(200);
    const data = await allowed.json();
    expect(data.kb.slug).toBe("graduate-school-staff");
    expect(data.page.slug).toBe("private-staff-orientation");

    const blocked = await GET(
      new Request("http://localhost/api/v1/kb/graduate-school/pages/procedures", {
        headers: { Authorization: "Bearer staff-only-key" },
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school", pagePath: ["procedures"] }) },
    );
    expect(blocked.status).toBe(404);
  });
});

describe("PATCH /api/v1/kb/[kbSlug]/pages/[...pagePath]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function patchPage(body: Record<string, unknown>, pageOverride: Partial<KbPage> = {}) {
    vi.stubEnv("KAAS_API_KEYS", "test-key");
    const store = await import("@/lib/kb-store");
    vi.spyOn(store, "getKbBySlug").mockResolvedValue(kb);
    vi.spyOn(store, "getPageByPath").mockResolvedValue({ ...page, ...pageOverride });
    vi.spyOn(store, "getAssetStatusById").mockResolvedValue("active");
    vi.spyOn(store, "updatePage").mockImplementation(async (input) => ({
      ...page,
      ...input,
      id: page.id,
      kbId: page.kbId,
      slug: page.slug,
      path: page.path,
      sortOrder: page.sortOrder,
      tags: page.tags,
      status: "published",
    }));
    const excerpts = await import("@/lib/excerpts");
    vi.spyOn(excerpts, "checkExcerptSourceForPublish").mockResolvedValue("ok");

    const { PATCH } = await import("@/app/api/v1/kb/[kbSlug]/pages/[...pagePath]/route");
    return PATCH(
      new Request("http://localhost/api/v1/kb/graduate-school/pages/ready", {
        method: "PATCH",
        headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school", pagePath: ["ready"] }) },
    );
  }

  it("preserves the existing slug even when it no longer matches the title", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage(
      { summary: "Updated summary." },
      { title: "A much longer, completely different title" },
    );
    expect(response.status).toBe(200);
    expect(store.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({ slug: page.slug }),
      "kaas-write-api",
    );
  });

  it("allows changing the title while keeping the slug fixed", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({ title: "Human — start here" });
    expect(response.status).toBe(200);
    expect(store.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Human — start here", slug: page.slug }),
      "kaas-write-api",
    );
  });

  it("rejects an empty title", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({ title: "   " });
    expect(response.status).toBe(400);
    expect(store.updatePage).not.toHaveBeenCalled();
  });

  it("moves a page under a new parent when parentPath is given, preserving its slug", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({ parentPath: ["visualizations", "wsu-custom-visualizations"] });
    expect(response.status).toBe(200);
    expect(store.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: page.slug,
        parentPath: ["visualizations", "wsu-custom-visualizations"],
      }),
      "kaas-write-api",
    );
  });

  it("rejects a parentPath that isn't an array of strings", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({ parentPath: "visualizations" });
    expect(response.status).toBe(400);
    expect(store.updatePage).not.toHaveBeenCalled();
  });

  it("rejects unsupported block types before saving", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({
      blocks: [{ blockId: "x", type: "unsupported", text: "Bad block." }],
    });
    expect(response.status).toBe(400);
    expect(store.updatePage).not.toHaveBeenCalled();
  });

  it.each(["group", "link"] as const)(
    "rejects blocks/summary on a %s node — it has no article content",
    async (nodeKind) => {
      const store = await import("@/lib/kb-store");
      const response = await patchPage({ summary: "Updated summary." }, { nodeKind });
      expect(response.status).toBe(400);
      expect(store.updatePage).not.toHaveBeenCalled();
    },
  );

  it.each(["group", "link"] as const)(
    "allows moving or reordering a %s node via parentPath/sortOrder",
    async (nodeKind) => {
      const store = await import("@/lib/kb-store");
      const response = await patchPage({ parentPath: ["visualizations"], sortOrder: 5 }, { nodeKind });
      expect(response.status).toBe(200);
      expect(store.updatePage).toHaveBeenCalledWith(
        expect.objectContaining({ parentPath: ["visualizations"], sortOrder: 5 }),
        "kaas-write-api",
      );
    },
  );

  it("allows setting sortOrder on a page node", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({ sortOrder: 15 });
    expect(response.status).toBe(200);
    expect(store.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 15 }),
      "kaas-write-api",
    );
  });

  it("rejects a non-numeric sortOrder", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({ sortOrder: "first" });
    expect(response.status).toBe(400);
    expect(store.updatePage).not.toHaveBeenCalled();
  });

  it("runs the publish gate before keeping KaaS edits published", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({
      blocks: [{ blockId: "img-1", type: "image", url: "https://example.edu/image.png" }],
    });
    expect(response.status).toBe(422);
    expect((await response.json()).issues).toContain(
      "An image is missing alt text. Add a description or mark it decorative.",
    );
    expect(store.updatePage).not.toHaveBeenCalled();
  });

  it("sanitizes supported rich text blocks before saving", async () => {
    const store = await import("@/lib/kb-store");
    const audit = await import("@/lib/audit-log");
    const recordAuditEvent = vi.spyOn(audit, "recordAuditEvent").mockResolvedValue();
    const response = await patchPage({
      blocks: [
        {
          blockId: "p1",
          type: "paragraph",
          text: "Clean text.",
          html: "Clean <strong>text</strong><script>alert(1)</script>.",
        },
      ],
    });
    expect(response.status).toBe(200);
    expect(store.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [
          expect.objectContaining({
            html: expect.not.stringContaining("<script"),
          }),
        ],
      }),
      "kaas-write-api",
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { email: "kaas-write-api", role: "admin" },
        action: "page.updated",
        entityType: "page",
        entityId: page.id,
        details: expect.objectContaining({ source: "kaas-write-api" }),
      }),
    );
  });
});

describe("DELETE /api/v1/kb/[kbSlug]/pages/[...pagePath]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function deletePage(otherPages: KbPage[] = [], excerptRefs: unknown[] = []) {
    vi.stubEnv("KAAS_API_KEYS", "test-key");
    const store = await import("@/lib/kb-store");
    vi.spyOn(store, "getKbBySlug").mockResolvedValue(kb);
    vi.spyOn(store, "getPageByPath").mockResolvedValue(page);
    vi.spyOn(store, "getAllPagesForAdmin").mockResolvedValue(otherPages);
    vi.spyOn(store, "getExcerptReferencesToPage").mockResolvedValue(
      excerptRefs as Awaited<ReturnType<typeof store.getExcerptReferencesToPage>>,
    );
    vi.spyOn(store, "permanentlyDeletePage").mockResolvedValue();

    const { DELETE } = await import("@/app/api/v1/kb/[kbSlug]/pages/[...pagePath]/route");
    return DELETE(
      new Request("http://localhost/api/v1/kb/graduate-school/pages/ready", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-key" },
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school", pagePath: ["ready"] }) },
    );
  }

  it("deletes a page with no children, references, or excerpt refs", async () => {
    const store = await import("@/lib/kb-store");
    const audit = await import("@/lib/audit-log");
    const recordAuditEvent = vi.spyOn(audit, "recordAuditEvent").mockResolvedValue();
    const response = await deletePage();
    expect(response.status).toBe(200);
    expect(store.permanentlyDeletePage).toHaveBeenCalledWith(page.id);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { email: "kaas-write-api", role: "admin" },
        action: "page.deleted",
        entityType: "page",
        entityId: page.id,
        details: expect.objectContaining({ source: "kaas-write-api" }),
      }),
    );
  });

  it("rejects deleting a page that has child pages", async () => {
    const store = await import("@/lib/kb-store");
    const child: KbPage = { ...page, id: "page-child", path: [...page.path, "child"] };
    const response = await deletePage([child]);
    expect(response.status).toBe(409);
    expect(store.permanentlyDeletePage).not.toHaveBeenCalled();
  });

  it("rejects deleting a page another page's Related Pages references", async () => {
    const store = await import("@/lib/kb-store");
    const referrer: KbPage = { ...page, id: "page-referrer", title: "Referrer", relatedPageIds: [page.id] };
    const response = await deletePage([referrer]);
    expect(response.status).toBe(409);
    expect(store.permanentlyDeletePage).not.toHaveBeenCalled();
  });

  it("rejects deleting a page an excerpt references", async () => {
    const store = await import("@/lib/kb-store");
    const response = await deletePage([], [{ pageTitle: "Some Page" }]);
    expect(response.status).toBe(409);
    expect(store.permanentlyDeletePage).not.toHaveBeenCalled();
  });

  it.each(["group", "link"] as const)("does not delete %s nodes through the article API", async (nodeKind) => {
    vi.stubEnv("KAAS_API_KEYS", "test-key");
    const store = await import("@/lib/kb-store");
    vi.spyOn(store, "getKbBySlug").mockResolvedValue(kb);
    vi.spyOn(store, "getPageByPath").mockResolvedValue({ ...page, nodeKind });
    vi.spyOn(store, "permanentlyDeletePage").mockResolvedValue();

    const { DELETE } = await import("@/app/api/v1/kb/[kbSlug]/pages/[...pagePath]/route");
    const response = await DELETE(
      new Request("http://localhost/api/v1/kb/graduate-school/pages/ready", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-key" },
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school", pagePath: ["ready"] }) },
    );
    expect(response.status).toBe(404);
    expect(store.permanentlyDeletePage).not.toHaveBeenCalled();
  });
});
