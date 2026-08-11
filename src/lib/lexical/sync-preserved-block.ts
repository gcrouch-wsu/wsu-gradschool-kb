"use client";

import { $getNearestNodeFromDOMNode, $getRoot, type LexicalNode } from "lexical";
import { $isPreservedBlockNode } from "@/lib/lexical/preserved-block-node";
import {
  $createEditorBoundaryParagraphNode,
  $isEditorBoundaryParagraphNode,
} from "@/lib/lexical/editor-boundary-paragraph-node";
import {
  getActiveLexicalEditor,
  getActiveLexicalRoot,
  notifyLexicalMutation,
} from "@/lib/lexical/toolbar-bridge";

function preservedWrapperForTarget(target: HTMLElement): Element | null {
  const figure =
    target.closest("figure.doc-image") ??
    (target.matches("figure.doc-image") ? target : null);
  return (figure ?? target).closest(".lexical-preserved-block");
}

function nearestPreservedNodeFromWrapper(wrapper: Element): LexicalNode | null {
  const nearest = $getNearestNodeFromDOMNode(wrapper);
  let node: LexicalNode | null = nearest;
  while (node && !$isPreservedBlockNode(node)) {
    node = node.getParent();
  }
  return node;
}

/** After mutating a preserved figure in the DOM, push outerHTML back into the
 * Lexical node so export/save keep the change (DecoratorNode __html is source of truth). */
export function syncPreservedBlockFromDom(target: HTMLElement): boolean {
  const editor = getActiveLexicalEditor();
  const root = getActiveLexicalRoot();
  if (!editor || !root || !root.contains(target)) {
    return false;
  }
  const figure =
    target.closest("figure.doc-image") ??
    (target.matches("figure.doc-image") ? target : null);
  const wrapper = preservedWrapperForTarget(target);
  if (!wrapper || !figure) {
    return false;
  }
  let synced = false;
  editor.update(() => {
    const node = nearestPreservedNodeFromWrapper(wrapper);
    if ($isPreservedBlockNode(node)) {
      node.setHtml(figure.outerHTML);
      synced = true;
    }
  });
  if (synced) {
    notifyLexicalMutation();
  }
  return synced;
}

function isEmptyBoundaryNode(node: LexicalNode | null | undefined): boolean {
  return $isEditorBoundaryParagraphNode(node) && node.isEmpty();
}

function nearestNonEmptyBoundarySibling(
  node: LexicalNode,
  direction: "previous" | "next",
): LexicalNode | null {
  let sibling = direction === "previous" ? node.getPreviousSibling() : node.getNextSibling();
  while (sibling && isEmptyBoundaryNode(sibling)) {
    sibling = direction === "previous" ? sibling.getPreviousSibling() : sibling.getNextSibling();
  }
  return sibling;
}

function normalizePreservedBlockBoundaries() {
  for (const child of $getRoot().getChildren()) {
    if (!isEmptyBoundaryNode(child)) {
      continue;
    }
    const previous = nearestNonEmptyBoundarySibling(child, "previous");
    const next = nearestNonEmptyBoundarySibling(child, "next");
    const needed =
      (!previous && $isPreservedBlockNode(next)) ||
      ($isPreservedBlockNode(previous) && !next) ||
      ($isPreservedBlockNode(previous) && $isPreservedBlockNode(next));
    if (!needed) {
      child.remove();
    }
  }

  for (const child of $getRoot().getChildren()) {
    if (!$isPreservedBlockNode(child)) {
      continue;
    }
    const previous = child.getPreviousSibling();
    if (!previous || $isPreservedBlockNode(previous)) {
      child.insertBefore($createEditorBoundaryParagraphNode());
    }
    const next = child.getNextSibling();
    if (!next || $isPreservedBlockNode(next)) {
      child.insertAfter($createEditorBoundaryParagraphNode());
    }
  }
}

export function movePreservedBlockFromDom(target: HTMLElement, direction: "up" | "down"): boolean {
  const editor = getActiveLexicalEditor();
  const root = getActiveLexicalRoot();
  if (!editor || !root || !root.contains(target)) {
    return false;
  }
  const wrapper = preservedWrapperForTarget(target);
  if (!wrapper) {
    return false;
  }
  let moved = false;
  editor.update(() => {
    const node = nearestPreservedNodeFromWrapper(wrapper);
    if (!$isPreservedBlockNode(node)) {
      return;
    }
    const sibling = nearestNonEmptyBoundarySibling(node, direction === "up" ? "previous" : "next");
    if (!sibling) {
      return;
    }
    if (direction === "up") {
      sibling.insertBefore(node);
    } else {
      sibling.insertAfter(node);
    }
    normalizePreservedBlockBoundaries();
    moved = true;
  });
  if (moved) {
    notifyLexicalMutation();
  }
  return moved;
}
