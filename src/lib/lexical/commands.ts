"use client";

import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import { $createHeadingNode } from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list";
import { $generateNodesFromDOM } from "@lexical/html";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  getActiveLexicalEditor,
  getActiveLexicalRoot,
  isLexicalFlowActive,
  notifyLexicalMutation,
} from "@/lib/lexical/toolbar-bridge";
import { escapeHtml } from "@/lib/rich-text";

export function lexicalRunFormatCommand(command: string, value?: string): boolean {
  const editor = getActiveLexicalEditor();
  if (!editor) {
    return false;
  }

  if (command === "bold" || command === "italic" || command === "underline") {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, command);
    notifyLexicalMutation();
    return true;
  }
  if (command === "insertUnorderedList") {
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    notifyLexicalMutation();
    return true;
  }
  if (command === "insertOrderedList") {
    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    notifyLexicalMutation();
    return true;
  }
  if (command === "insertHTML" && typeof value === "string") {
    let inserted = false;
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }
      const parser = new DOMParser();
      const dom = parser.parseFromString(value, "text/html");
      const nodes = $generateNodesFromDOM(editor, dom);
      if (nodes.length === 0) {
        return;
      }
      selection.insertNodes(nodes);
      inserted = true;
    });
    if (!inserted) {
      return false;
    }
    notifyLexicalMutation();
    return true;
  }
  if (command === "undo") {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    notifyLexicalMutation();
    return true;
  }
  if (command === "redo") {
    editor.dispatchCommand(REDO_COMMAND, undefined);
    notifyLexicalMutation();
    return true;
  }
  // Fallback: ignore unsupported execCommand names for Lexical surfaces.
  void value;
  void INSERT_CHECK_LIST_COMMAND;
  void REMOVE_LIST_COMMAND;
  return false;
}

export function lexicalApplyBlockTag(tag: "p" | "h2" | "h3"): boolean {
  const editor = getActiveLexicalEditor();
  if (!editor) {
    return false;
  }
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    if (tag === "p") {
      $setBlocksType(selection, () => $createParagraphNode());
    } else {
      $setBlocksType(selection, () => $createHeadingNode(tag));
    }
  });
  notifyLexicalMutation();
  return true;
}

export function lexicalApplyList(command: "insertUnorderedList" | "insertOrderedList"): boolean {
  return lexicalRunFormatCommand(command);
}

export function lexicalIndent(): boolean {
  const editor = getActiveLexicalEditor();
  if (!editor) {
    return false;
  }
  const surface = getActiveLexicalRoot();
  if (surface) {
    const selection = window.getSelection();
    const li =
      selection?.rangeCount
        ? (selection.getRangeAt(0).startContainer as Node).parentElement?.closest("li")
        : null;
    if (li instanceof HTMLLIElement && surface.contains(li) && !li.previousElementSibling) {
      return false;
    }
  }
  editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
  notifyLexicalMutation();
  return true;
}

export function lexicalOutdent(): boolean {
  const editor = getActiveLexicalEditor();
  if (!editor) {
    return false;
  }
  const surface = getActiveLexicalRoot();
  if (surface) {
    const selection = window.getSelection();
    const li =
      selection?.rangeCount
        ? (selection.getRangeAt(0).startContainer as Node).parentElement?.closest("li")
        : null;
    if (li instanceof HTMLLIElement && surface.contains(li)) {
      const parentList = li.parentElement;
      if (parentList && !(parentList.parentElement instanceof HTMLLIElement)) {
        return false;
      }
    }
  }
  editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
  notifyLexicalMutation();
  return true;
}

export function lexicalUndo(): boolean {
  return lexicalRunFormatCommand("undo");
}

export function lexicalRedo(): boolean {
  return lexicalRunFormatCommand("redo");
}

export function lexicalInsertHtml(html: string): boolean {
  const editor = getActiveLexicalEditor();
  if (!editor) {
    return false;
  }
  let inserted = false;
  editor.focus();
  editor.update(() => {
    let selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      const root = $getRoot();
      root.selectEnd();
      selection = $getSelection();
    }
    if (!$isRangeSelection(selection)) {
      return;
    }
    const parser = new DOMParser();
    const dom = parser.parseFromString(html, "text/html");
    const nodes = $generateNodesFromDOM(editor, dom);
    if (nodes.length === 0) {
      return;
    }
    selection.insertNodes(nodes);
    inserted = true;
  });
  if (!inserted) {
    return false;
  }
  notifyLexicalMutation();
  return true;
}

/** Apply or update a link on the active Lexical selection (flow + table cells). */
export function lexicalApplyLink(
  url: string,
  options?: { newTab?: boolean; text?: string },
): boolean {
  const editor = getActiveLexicalEditor();
  if (!editor) {
    return false;
  }

  let selectionText = "";
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selectionText = selection.getTextContent();
    }
  });

  const label = (options?.text ?? "").trim();
  if (label && label !== selectionText.trim()) {
    const targetAttr = options?.newTab ? ' target="_blank"' : "";
    const relAttr = options?.newTab ? ' rel="noopener noreferrer"' : "";
    return lexicalInsertHtml(
      `<a href="${escapeHtml(url)}"${targetAttr}${relAttr}>${escapeHtml(label)}</a>`,
    );
  }

  const payload = options?.newTab
    ? { url, target: "_blank", rel: "noopener noreferrer" }
    : { url, target: null, rel: null };
  editor.focus();
  editor.dispatchCommand(TOGGLE_LINK_COMMAND, payload);
  notifyLexicalMutation();
  return true;
}

export function lexicalRemoveLink(): boolean {
  const editor = getActiveLexicalEditor();
  if (!editor) {
    return false;
  }
  editor.focus();
  editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
  notifyLexicalMutation();
  return true;
}

export { isLexicalFlowActive };
