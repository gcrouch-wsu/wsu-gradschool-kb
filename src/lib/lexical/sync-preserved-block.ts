"use client";

import { $getNearestNodeFromDOMNode } from "lexical";
import { $isPreservedBlockNode } from "@/lib/lexical/preserved-block-node";
import {
  getActiveLexicalEditor,
  getActiveLexicalRoot,
  notifyLexicalMutation,
} from "@/lib/lexical/toolbar-bridge";

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
  const wrapper = (figure ?? target).closest(".lexical-preserved-block");
  if (!wrapper || !figure) {
    return false;
  }
  let synced = false;
  editor.update(() => {
    const nearest = $getNearestNodeFromDOMNode(wrapper);
    let node = nearest;
    while (node && !$isPreservedBlockNode(node)) {
      node = node.getParent();
    }
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
