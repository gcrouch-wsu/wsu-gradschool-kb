import { describe, expect, it } from "vitest";
import { buildContentHealthReport } from "@/lib/content-health";
import type { AuditLogEntry, ContentBlock, KbPage, KnowledgeBase } from "@/lib/types";

const blocks: ContentBlock[] = [{ blockId: "p1", type: "paragraph", text: "Body text." }];

const kb: KnowledgeBase = {
  id: "kb-1",
  title: "Graduate School",
  slug: "graduate-school",
  description: "",
  status: "published",
  visibility: "public",
  updatedOn: "2026-07-26",
};

function page(overrides: Partial<KbPage>): KbPage {
  return {
    id: overrides.id ?? "page-1",
    kbId: "kb-1",
    title: overrides.title ?? "Page",
    slug: overrides.slug ?? "page",
    path: overrides.path ?? ["page"],
    sortOrder: 1,
    summary: "Summary.",
    tags: ["graduate"],
    status: "published",
    visibility: "public",
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-01-01",
    updatedDisplayDate: "2026-01-02",
    blocks,
    relatedPageIds: [],
    relatedAssetIds: [],
    showToc: true,
    tocDepth: 3,
    nextReviewDate: "2026-12-01",
    ...overrides,
  };
}

function searchEvent(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: overrides.id ?? `search-${crypto.randomUUID()}`,
    actorEmail: "public-user",
    actorRole: "editor",
    action: "search",
    entityType: "search",
    entityId: "search-query",
    entityLabel: "funding forms",
    kbId: "kb-1",
    details: { resultCount: 0 },
    createdAt: "2026-07-25T12:00:00.000Z",
    ...overrides,
  };
}

describe("content health report", () => {
  it("aggregates stale pages, missing tags, metadata issues, proposed pages, and search gaps", () => {
    const report = buildContentHealthReport({
      kbs: [kb],
      now: new Date("2026-07-26T12:00:00.000Z"),
      pages: [
        page({ id: "healthy", title: "Healthy", path: ["healthy"] }),
        page({
          id: "stale",
          title: "Stale",
          path: ["stale"],
          tags: [],
          summary: "",
          ownerLabel: "",
          contactEmail: "",
          nextReviewDate: "2026-01-01",
        }),
        page({
          id: "proposed",
          title: "Proposed",
          path: ["proposed"],
          status: "proposed",
          updatedDisplayDate: "2026-07-20",
        }),
      ],
      searchEvents: [
        searchEvent({ id: "search-1", entityLabel: "Funding Forms", createdAt: "2026-07-25T12:00:00.000Z" }),
        searchEvent({ id: "search-2", entityLabel: "funding forms", createdAt: "2026-07-26T12:00:00.000Z" }),
      ],
    });

    expect(report.counts.activePages).toBe(3);
    expect(report.stalePages.map((item) => item.pageId)).toEqual(["stale"]);
    expect(report.missingTags.map((item) => item.pageId)).toEqual(["stale"]);
    expect(report.missingMetadata[0].issues).toEqual([
      "Missing summary",
      "Missing responsible office",
      "Missing contact email",
    ]);
    expect(report.proposedPages.map((item) => item.pageId)).toEqual(["proposed"]);
    expect(report.zeroResultSearches).toEqual([
      expect.objectContaining({ query: "Funding Forms", count: 2, lastSearchedAt: "2026-07-26T12:00:00.000Z" }),
    ]);
  });
});
