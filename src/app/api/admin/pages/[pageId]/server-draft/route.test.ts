import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth";
import type { KbPage, PageRevisionSnapshot } from "@/lib/types";

const session: AdminSession = {
  userId: "editor-1",
  email: "editor@example.edu",
  role: "editor",
  source: "managed",
  expiresAt: Date.now() + 60_000,
  version: "v1",
};

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
  blocks: [{ blockId: "p1", type: "paragraph", text: "Ready page." }],
  relatedPageIds: [],
  relatedAssetIds: [],
  showToc: true,
  tocDepth: 2,
};

const snapshot: PageRevisionSnapshot = {
  title: page.title,
  slug: page.slug,
  path: page.path,
  summary: page.summary,
  tags: page.tags,
  status: page.status,
  visibility: page.visibility,
  ownerLabel: page.ownerLabel,
  contactEmail: page.contactEmail,
  lastReviewedDate: page.lastReviewedDate,
  blocks: page.blocks,
  relatedPageIds: page.relatedPageIds,
  relatedAssetIds: page.relatedAssetIds,
  showToc: page.showToc,
  tocDepth: page.tocDepth,
};

async function setup() {
  const security = await import("@/lib/security");
  vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
    ok: true,
    email: session.email,
    session,
  });
  vi.spyOn(security, "requireKbAccess").mockResolvedValue(null);

  const store = await import("@/lib/kb-store");
  vi.spyOn(store, "getPageByIdForAdmin").mockResolvedValue(page);

  const drafts = await import("@/lib/page-server-drafts");
  vi.spyOn(drafts, "getPageServerDraft").mockResolvedValue({
    pageId: page.id,
    authorUserId: session.userId,
    snapshot,
    updatedAt: "2026-07-25T12:00:00.000Z",
  });
  vi.spyOn(drafts, "savePageServerDraft").mockResolvedValue({
    pageId: page.id,
    authorUserId: session.userId,
    snapshot,
    updatedAt: "2026-07-25T12:00:00.000Z",
  });
  vi.spyOn(drafts, "deletePageServerDraft").mockResolvedValue(undefined);

  return drafts;
}

describe("/api/admin/pages/[pageId]/server-draft", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("loads only the authenticated user's server draft", async () => {
    const drafts = await setup();
    const { GET } = await import("@/app/api/admin/pages/[pageId]/server-draft/route");
    const response = await GET(new Request("http://localhost/api/admin/pages/page-1/server-draft"), {
      params: Promise.resolve({ pageId: page.id }),
    });
    expect(response.status).toBe(200);
    expect(drafts.getPageServerDraft).toHaveBeenCalledWith(page.id, session.userId);
  });

  it("saves server drafts under the authenticated user", async () => {
    const drafts = await setup();
    const { PUT } = await import("@/app/api/admin/pages/[pageId]/server-draft/route");
    const response = await PUT(
      new Request("http://localhost/api/admin/pages/page-1/server-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
      }),
      { params: Promise.resolve({ pageId: page.id }) },
    );
    expect(response.status).toBe(200);
    expect(drafts.savePageServerDraft).toHaveBeenCalledWith(page.id, session.userId, snapshot);
  });



  it("deletes only the authenticated user's server draft", async () => {
    const drafts = await setup();
    const { DELETE } = await import("@/app/api/admin/pages/[pageId]/server-draft/route");
    const response = await DELETE(new Request("http://localhost/api/admin/pages/page-1/server-draft"), {
      params: Promise.resolve({ pageId: page.id }),
    });
    expect(response.status).toBe(200);
    expect(drafts.deletePageServerDraft).toHaveBeenCalledWith(page.id, session.userId);
  });
});
