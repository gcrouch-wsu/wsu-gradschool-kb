import { describe, expect, it } from "vitest";
import { initialExpandedIds } from "@/components/PageTree";
import type { PageTreeNode } from "@/lib/types";

function node(id: string, path: string[], children: PageTreeNode[] = []): PageTreeNode {
  return {
    page: {
      id,
      kbId: "kb-1",
      title: id,
      slug: path[path.length - 1] ?? id,
      path,
      sortOrder: 0,
      summary: "",
      status: "published",
      visibility: "public",
      ownerLabel: "Office",
      contactEmail: "a@b.edu",
      lastReviewedDate: "2026-01-01",
      nextReviewDate: "2027-01-01",
      showToc: true,
      tocDepth: 3,
      relatedPageIds: [],
      relatedAssetIds: [],
      blocks: [],
      updatedDisplayDate: "2026-01-01",
      nodeKind: "page",
    },
    children,
  };
}

// admissions > managing > apply, mirroring the reported case.
function tree(): PageTreeNode[] {
  return [
    node("policies", ["policies"], [node("bylaws", ["policies", "bylaws"])]),
    node("admissions", ["admissions"], [
      node("managing", ["admissions", "managing"], [
        node("apply", ["admissions", "managing", "apply"]),
      ]),
      node("ita", ["admissions", "ita"]),
    ]),
  ];
}

describe("initialExpandedIds", () => {
  // The reported bug: standing on a parent page left its own children collapsed, so a page
  // nested under a nested page looked absent from the tree.
  it("expands the current page's own branch, not just its ancestors", () => {
    const expanded = initialExpandedIds(tree(), "managing");
    expect(expanded.has("admissions")).toBe(true);
    expect(expanded.has("managing")).toBe(true);
  });

  it("still expands the ancestors of a deeper current page", () => {
    const expanded = initialExpandedIds(tree(), "apply");
    expect(expanded.has("admissions")).toBe(true);
    expect(expanded.has("managing")).toBe(true);
  });

  it("opens every branch by default so nested pages are visible while browsing", () => {
    // The KB landing page passes no current page. This used to open only the top level, so
    // anything two levels deep was invisible: "the first header but not the next nested".
    const expanded = initialExpandedIds(tree());
    expect(expanded.has("admissions")).toBe(true);
    expect(expanded.has("managing")).toBe(true);
    expect(expanded.has("policies")).toBe(true);
  });

  it("honours a shallower expand depth", () => {
    const expanded = initialExpandedIds(tree(), undefined, undefined, 1);
    expect(expanded.has("admissions")).toBe(true);
    expect(expanded.has("policies")).toBe(true);
    expect(expanded.has("managing")).toBe(false);
  });

  it("still opens the current page's chain below the expand depth", () => {
    const expanded = initialExpandedIds(tree(), "apply", undefined, 1);
    expect(expanded.has("admissions")).toBe(true);
    // Beyond expandDepth, but the reader is inside it, so it must be visible.
    expect(expanded.has("managing")).toBe(true);
  });

  it("never marks a childless node as expanded", () => {
    const expanded = initialExpandedIds(tree(), "ita");
    expect(expanded.has("admissions")).toBe(true);
    expect(expanded.has("ita")).toBe(false);
  });

  it("matches the current page by path when no id is given", () => {
    const expanded = initialExpandedIds(tree(), undefined, "admissions/managing");
    expect(expanded.has("admissions")).toBe(true);
    expect(expanded.has("managing")).toBe(true);
  });

  it("opens branches even when the current page id matches nothing", () => {
    const expanded = initialExpandedIds(tree(), "not-in-this-tree");
    expect(expanded.has("policies")).toBe(true);
    expect(expanded.has("admissions")).toBe(true);
    expect(expanded.has("managing")).toBe(true);
  });
});
