import { describe, expect, it } from "vitest";
import {
  resolveDropProjection,
  resolveReorderAnchor,
  TREE_INDENT_PX,
} from "@/lib/page-tree-drop";

describe("resolveDropProjection", () => {
  const treeLeft = 100;
  const rowTop = 200;
  const rowHeight = 100;

  it("uses top band for before and bottom band for after", () => {
    expect(
      resolveDropProjection(100 + TREE_INDENT_PX * 2, 210, rowTop, rowHeight, treeLeft, 2),
    ).toEqual({ zone: "before", insertDepth: 2 });
    expect(
      resolveDropProjection(100 + TREE_INDENT_PX * 2, 280, rowTop, rowHeight, treeLeft, 2),
    ).toEqual({ zone: "after", insertDepth: 2 });
  });

  it("nests in the middle when pointer is at the target depth", () => {
    expect(
      resolveDropProjection(100 + TREE_INDENT_PX * 2, 250, rowTop, rowHeight, treeLeft, 2),
    ).toEqual({ zone: "into", insertDepth: 3 });
  });

  it("outdents via middle band when pointer is left of the row indent", () => {
    expect(
      resolveDropProjection(100 + TREE_INDENT_PX * 0, 250, rowTop, rowHeight, treeLeft, 2),
    ).toEqual({ zone: "after", insertDepth: 0 });
    expect(
      resolveDropProjection(100 + TREE_INDENT_PX * 1, 250, rowTop, rowHeight, treeLeft, 2),
    ).toEqual({ zone: "after", insertDepth: 1 });
  });

  it("clamps insert depth to the hovered row depth", () => {
    expect(
      resolveDropProjection(100 + TREE_INDENT_PX * 9, 210, rowTop, rowHeight, treeLeft, 1),
    ).toEqual({ zone: "before", insertDepth: 1 });
  });
});

describe("resolveReorderAnchor", () => {
  it("reorders beside the hovered row when depths match", () => {
    expect(resolveReorderAnchor(["a", "b", "c"], "after", 2)).toEqual({
      parentPath: ["a", "b"],
      anchorPath: ["a", "b", "c"],
      position: "after",
    });
  });

  it("outdents to an ancestor when insert depth is shallower", () => {
    expect(resolveReorderAnchor(["a", "b", "c"], "after", 0)).toEqual({
      parentPath: [],
      anchorPath: ["a"],
      position: "after",
    });
    expect(resolveReorderAnchor(["a", "b", "c"], "before", 1)).toEqual({
      parentPath: ["a"],
      anchorPath: ["a", "b"],
      position: "before",
    });
  });
});
