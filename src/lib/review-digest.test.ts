import { describe, expect, it } from "vitest";
import { selectPagesDueForReview } from "@/lib/review-digest";
import type { KbPage, KnowledgeBase } from "@/lib/types";

const kb: KnowledgeBase = {
  id: "kb-review-test",
  slug: "review-test",
  title: "Review Test",
  description: "Review test KB",
  status: "published",
  updatedOn: "2026-01-01",
};

function page(id: string, nextReviewDate: string | null, overrides: Partial<KbPage> = {}): KbPage {
  return {
    id,
    kbId: kb.id,
    title: id,
    slug: id,
    path: [id],
    sortOrder: 0,
    summary: "",
    status: "published",
    visibility: "public",
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@example.edu",
    lastReviewedDate: "2026-01-01",
    updatedDisplayDate: "2026-01-01",
    blocks: [],
    relatedPageIds: [],
    relatedAssetIds: [],
    showToc: true,
    tocDepth: 3,
    nextReviewDate,
    ...overrides,
  };
}

describe("review digest selection", () => {
  it("selects non-archived pages due now or within 14 days", () => {
    const selected = selectPagesDueForReview(
      [kb],
      [
        page("past", "2026-07-01"),
        page("soon", "2026-07-24"),
        page("future", "2026-07-25"),
        page("missing", null),
        page("archived", "2026-07-10", { status: "archived" }),
        page("invalid", "not-a-date"),
      ],
      new Date("2026-07-10T12:00:00.000Z"),
    );

    expect(selected.map((item) => item.pageId)).toEqual(["past", "soon"]);
  });
});
