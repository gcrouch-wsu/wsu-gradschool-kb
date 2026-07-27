"use client";

import { $getSelection, $isRangeSelection, $findMatchingParent } from "lexical";
import { $isAlertNode } from "@/lib/lexical/alert-node";
import { getActiveLexicalEditor, isLexicalFlowActive } from "@/lib/lexical/toolbar-bridge";

/** True when the Lexical selection is inside an AlertNode (info box). */
export function lexicalSelectionInAlert(): boolean {
  if (!isLexicalFlowActive()) {
    return false;
  }
  const editor = getActiveLexicalEditor();
  if (!editor) {
    return false;
  }
  let inAlert = false;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    const anchor = selection.anchor.getNode();
    inAlert = Boolean($findMatchingParent(anchor, $isAlertNode));
  });
  return inAlert;
}
