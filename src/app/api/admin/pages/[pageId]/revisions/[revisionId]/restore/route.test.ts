import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth";
import type { ContentBlock, KbPage, PageRevision } from "@/lib/types";

const blocks: ContentBlock[] = [{ blockId: "p1", type: "paragraph", text: "Published content." }];

const page: KbPage = {
  id: "page-1",
  kbId: "kb-grad-school",
  title: "Published",
  slug: "published",
  path: ["published"],
  sortOrder: 1,
  summary: "Published summary.",
  tags: ["published"],
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

const publishedRevision: PageRevision = {
  ...page,
  id: "revision-1",
  pageId: page.id,
  kbId: page.kbId,
  revisionNumber: 1,
  authorEmail: "owner@example.edu",
  action: "save",
  createdAt: "2026-07-25T12:00:00.000Z",
  status: "published",
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

async function post(role: AdminSession["role"] = "editor") {
  const security = await import("@/lib/security");
  const store = await import("@/lib/kb-store");
  vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
    ok: true,
    email: `${role}@example.edu`,
    session: session(role),
  });
  vi.spyOn(security, "requireKbAccess").mockResolvedValue(null);
  vi.spyOn(store, "getPageByIdForAdmin").mockResolvedValue(page);
  vi.spyOn(store, "getPageRevision").mockResolvedValue(publishedRevision);
  vi.spyOn(store, "restorePageRevision").mockResolvedValue({ ...page, status: "published" });
  const { POST } = await import("@/app/api/admin/pages/[pageId]/revisions/[revisionId]/restore/route");
  return POST(
    new Request("http://localhost/api/admin/pages/page-1/revisions/revision-1/restore", {
      method: "POST",
    }),
    { params: Promise.resolve({ pageId: "page-1", revisionId: "revision-1" }) },
  );
}

describe("POST /api/admin/pages/[pageId]/revisions/[revisionId]/restore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("blocks editors from restoring a published revision", async () => {
    const store = await import("@/lib/kb-store");
    const restoreSpy = vi.spyOn(store, "restorePageRevision");
    const response = await post("editor");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Only an owner or admin can restore a published revision.",
    });
    expect(restoreSpy).not.toHaveBeenCalled();
  });
});
