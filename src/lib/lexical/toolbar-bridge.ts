"use client";

import type { LexicalEditor } from "lexical";
import { getBoundEditorSurface } from "@/lib/rich-text-selection";

let activeLexicalEditor: LexicalEditor | null = null;
let activeLexicalRoot: HTMLElement | null = null;
let onLexicalMutate: (() => void) | null = null;

export function registerLexicalFlowEditor(
  editor: LexicalEditor,
  root: HTMLElement,
  onMutate: () => void,
) {
  activeLexicalEditor = editor;
  activeLexicalRoot = root;
  onLexicalMutate = onMutate;
}

export function unregisterLexicalFlowEditor(editor: LexicalEditor) {
  if (activeLexicalEditor === editor) {
    activeLexicalEditor = null;
    activeLexicalRoot = null;
    onLexicalMutate = null;
  }
}

export function getActiveLexicalEditor(): LexicalEditor | null {
  return activeLexicalEditor;
}

export function getActiveLexicalRoot(): HTMLElement | null {
  return activeLexicalRoot;
}

export function isLexicalFlowActive(): boolean {
  if (!activeLexicalEditor || !activeLexicalRoot) {
    return false;
  }
  // Only treat Lexical as the command target when the bound surface is this
  // editor (or nested inside it). Table cells re-bind to contentEditable and
  // must keep using execCommand / native selection.
  const surface = getBoundEditorSurface();
  if (surface && (surface === activeLexicalRoot || activeLexicalRoot.contains(surface))) {
    return true;
  }
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  if (selection?.rangeCount) {
    const node = selection.getRangeAt(0).commonAncestorContainer;
    if (activeLexicalRoot.contains(node)) {
      return true;
    }
  }
  const active = typeof document !== "undefined" ? document.activeElement : null;
  if (active instanceof Node && activeLexicalRoot.contains(active)) {
    return true;
  }
  return false;
}

export function notifyLexicalMutation() {
  onLexicalMutate?.();
}
