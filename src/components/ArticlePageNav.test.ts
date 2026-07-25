import { describe, expect, it } from "vitest";
import { flattenPages } from "@/components/ArticlePageNav";
import type { PageTreeNode } from "@/lib/types";

function pageNode(
  id: string,
  title: string,
  path: string[],
  children: PageTreeNode[] = [],
  nodeKind: "page" | "group" | "link" = "page",
): PageTreeNode {
  return {
    page: {
      id,
      kbId: "kb-1",
      title,
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
      nodeKind,
    },
    children,
  };
}

describe("flattenPages", () => {
  it("orders depth-first, skips groups/links, and substitutes homepage href", () => {
    const nodes: PageTreeNode[] = [
      pageNode("home", "Home", ["home"]),
      pageNode("group-1", "Group", ["group"], [pageNode("child", "Child", ["group", "child"])], "group"),
      pageNode("link-1", "External", ["link"], [], "link"),
      pageNode("end", "End", ["end"]),
    ];

    expect(flattenPages(nodes, "handbook", "home")).toEqual([
      { id: "home", title: "Home", href: "/kb/handbook" },
      { id: "child", title: "Child", href: "/kb/handbook/group/child" },
      { id: "end", title: "End", href: "/kb/handbook/end" },
    ]);
  });
});
