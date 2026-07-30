import { describe, expect, it } from "vitest";
import { filterPagesWithVisibleAncestors } from "@/lib/kb-store";
import type { KbPage } from "@/lib/types";

function page(overrides: Partial<KbPage> & { id: string; path: string[] }): KbPage {
  return {
    title: overrides.title ?? overrides.id,
    slug: overrides.path[overrides.path.length - 1] ?? "page",
    sortOrder: 1,
    summary: "",
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
    kbId: "kb-1",
    nodeKind: "page",
    ...overrides,
  } as KbPage;
}

describe("filterPagesWithVisibleAncestors", () => {
  it("keeps nested pages when the parent group is visible", () => {
    const group = page({
      id: "group",
      title: "Section",
      path: ["section"],
      nodeKind: "group",
    });
    const child = page({ id: "child", title: "Child", path: ["section", "child"] });
    expect(filterPagesWithVisibleAncestors([group, child]).map((p) => p.id)).toEqual(["group", "child"]);
  });

  it("hides nested pages when the parent group is missing (drafted away)", () => {
    const child = page({ id: "child", title: "Child", path: ["section", "child"] });
    const sibling = page({ id: "sibling", title: "Sibling", path: ["other"] });
    expect(filterPagesWithVisibleAncestors([child, sibling]).map((p) => p.id)).toEqual(["sibling"]);
  });
});
