import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth";
import type { ContentBlock, KbPage } from "@/lib/types";

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

async function patch(status: string, role: AdminSession["role"] = "editor") {
  const security = await import("@/lib/security");
  const store = await import("@/lib/kb-store");
  vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
    ok: true,
    email: `${role}@example.edu`,
    session: session(role),
  });
  vi.spyOn(security, "requireKbAccess").mockResolvedValue(null);
  vi.spyOn(store, "getPageByIdForAdmin").mockResolvedValue(page);
  vi.spyOn(store, "updatePageStatus").mockResolvedValue({ ...page, status: status as KbPage["status"] });
  vi.spyOn(store, "getKbById").mockResolvedValue({
    id: page.kbId,
    title: "Graduate School",
    slug: "graduate-school",
    description: "",
    status: "published",
    visibility: "public",
    updatedOn: "2026-07-25",
  });
  const audit = await import("@/lib/audit-log");
  vi.spyOn(audit, "recordAuditEvent").mockResolvedValue(undefined);
  const { PATCH } = await import("@/app/api/admin/pages/[pageId]/status/route");
  return PATCH(
    new Request("http://localhost/api/admin/pages/page-1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ pageId: "page-1" }) },
  );
}

describe("PATCH /api/admin/pages/[pageId]/status", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("blocks editors from publishing through status changes", async () => {
    const store = await import("@/lib/kb-store");
    const updateSpy = vi.spyOn(store, "updatePageStatus");
    const response = await patch("published", "editor");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Only an owner or admin can publish pages. Submit the page for review instead.",
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns the admin mutation guard response", async () => {
    const security = await import("@/lib/security");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }),
    });
    const { PATCH } = await import("@/app/api/admin/pages/[pageId]/status/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/pages/page-1/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      }),
      { params: Promise.resolve({ pageId: "page-1" }) },
    );
    expect(response.status).toBe(401);
  });
});
