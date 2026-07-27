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

  it("hides private KBs, draft KBs, staff pages, groups, and links", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "test-key");

    expect((await getPage("graduate-school-staff", ["private-staff-orientation"])).status).toBe(404);
    expect((await getPage("draft-preview", ["procedures"])).status).toBe(404);
    expect((await getPage("graduate-school", ["templates", "graduate-program-handbooks"])).status).toBe(404);
    expect((await getPage("graduate-school", ["reference"])).status).toBe(404);
    expect((await getPage("graduate-school", ["reference", "policies-and-procedures"])).status).toBe(404);
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

  it("rejects unsupported block types before saving", async () => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({
      blocks: [{ blockId: "x", type: "unsupported", text: "Bad block." }],
    });
    expect(response.status).toBe(400);
    expect(store.updatePage).not.toHaveBeenCalled();
  });

  it.each(["group", "link"] as const)("does not write %s nodes through the article API", async (nodeKind) => {
    const store = await import("@/lib/kb-store");
    const response = await patchPage({ summary: "Updated summary." }, { nodeKind });
    expect(response.status).toBe(404);
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
