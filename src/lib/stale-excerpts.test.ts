import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentBlock, KbPage, KnowledgeBase } from "@/lib/types";

const kbs: KnowledgeBase[] = [
  {
    id: "kb-open",
    title: "Graduate School",
    slug: "graduate-school",
    description: "",
    status: "published",
    visibility: "public",
    updatedOn: "2026-07-26",
  },
  {
    id: "kb-private",
    title: "Internal Ops",
    slug: "internal-ops",
    description: "",
    status: "published",
    visibility: "private",
    updatedOn: "2026-07-26",
  },
];

function page(overrides: Partial<KbPage> & { id: string; kbId: string }): KbPage {
  return {
    title: "Page",
    slug: "page",
    path: ["page"],
    sortOrder: 1,
    summary: "Summary.",
    tags: [],
    status: "published",
    visibility: "public",
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-01-01",
    updatedDisplayDate: "2026-01-02",
    blocks: [],
    relatedPageIds: [],
    relatedAssetIds: [],
    showToc: true,
    tocDepth: 3,
    ...overrides,
  } as KbPage;
}

function excerptOf(sourcePageId: string): ContentBlock[] {
  return [{ blockId: "ex-1", type: "excerpt", sourcePageId } as ContentBlock];
}

// A host page in each KB, each including a stale excerpt from a source in the
// *other* KB (source updated after the host, so both qualify as stale).
const pages: KbPage[] = [
  page({ id: "open-host", kbId: "kb-open", title: "Open host", blocks: excerptOf("private-source") }),
  page({ id: "private-source", kbId: "kb-private", title: "Secret source", updatedDisplayDate: "2026-06-01" }),
  page({ id: "private-host", kbId: "kb-private", title: "Private host", blocks: excerptOf("open-source") }),
  page({ id: "open-source", kbId: "kb-open", title: "Open source", updatedDisplayDate: "2026-06-01" }),
];

vi.mock("@/lib/kb-store", () => ({
  getAllKbsForAdmin: async () => kbs,
  getAllPagesForAdmin: async (kbId: string) => pages.filter((p) => p.kbId === kbId),
}));

describe("listStaleExcerpts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reports every KB when scope is null", async () => {
    const { listStaleExcerpts } = await import("@/lib/stale-excerpts");
    const items = await listStaleExcerpts(null);
    expect(items.map((item) => item.pageId).sort()).toEqual(["open-host", "private-host"]);
  });

  it("omits host pages outside the caller's assigned KBs", async () => {
    const { listStaleExcerpts } = await import("@/lib/stale-excerpts");
    const items = await listStaleExcerpts(["kb-open"]);
    expect(items.map((item) => item.pageId)).toEqual(["open-host"]);
    expect(items.every((item) => item.kbId === "kb-open")).toBe(true);
  });

  it("still detects staleness from an unreadable source without naming it", async () => {
    const { listStaleExcerpts } = await import("@/lib/stale-excerpts");
    const [item] = await listStaleExcerpts(["kb-open"]);
    // The excerpt is genuinely stale, so it must still surface...
    expect(item.sourcePageId).toBe("private-source");
    // ...but the private KB's page title must not leak into the report.
    expect(item.sourceTitle).not.toContain("Secret");
    expect(JSON.stringify(item)).not.toContain("Secret source");
  });
});
