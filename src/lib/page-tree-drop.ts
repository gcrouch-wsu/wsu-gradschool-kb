/**
 * Drop-target projection for the admin page tree.
 *
 * Vertical band picks before / into / after. Horizontal position picks insert
 * depth for before/after so dragging left can outdent (Finder / outline pattern).
 */

export type DropZone = "before" | "after" | "into";

/** Matches `.tree-editor__item` marginLeft step (`1.25rem` at 16px root). */
export const TREE_INDENT_PX = 20;

export type DropProjection = {
  zone: DropZone;
  /** Depth of the insert line for before/after (0 = root). Unused for into. */
  insertDepth: number;
};

/**
 * Resolve drop zone from pointer position relative to a row and the tree origin.
 * `targetDepth` is `path.length - 1` (0 for top-level pages).
 */
export function resolveDropProjection(
  clientX: number,
  clientY: number,
  rowTop: number,
  rowHeight: number,
  treeLeft: number,
  targetDepth: number,
): DropProjection {
  const ratio = (clientY - rowTop) / Math.max(1, rowHeight);
  const rawDepth = Math.floor((clientX - treeLeft) / TREE_INDENT_PX);
  const insertDepth = Math.max(0, Math.min(Math.max(0, targetDepth), rawDepth));

  if (ratio < 0.28) {
    return { zone: "before", insertDepth };
  }
  if (ratio > 0.72) {
    return { zone: "after", insertDepth };
  }
  // Middle: nest by default, but left of this row's indent means outdent-as-after.
  if (insertDepth < targetDepth) {
    return { zone: "after", insertDepth };
  }
  return { zone: "into", insertDepth: targetDepth + 1 };
}

/**
 * Parent path and the path of the node we insert before/after when reordering
 * (possibly at a shallower depth than the hovered row).
 */
export function resolveReorderAnchor(
  targetPath: string[],
  zone: "before" | "after",
  insertDepth: number,
): { parentPath: string[]; anchorPath: string[]; position: "before" | "after" } {
  const targetDepth = Math.max(0, targetPath.length - 1);
  const depth = Math.max(0, Math.min(insertDepth, targetDepth));
  const anchorPath = targetPath.slice(0, depth + 1);
  return {
    parentPath: anchorPath.slice(0, -1),
    anchorPath,
    position: zone,
  };
}
