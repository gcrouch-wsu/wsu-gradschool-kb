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

/**
 * True when a live surface already owns the shared toolbar.
 *
 * Surfaces use this to claim the toolbar on mount only when it is free. Every flow, card,
 * procedure, and table-cell surface registers through this one module, so a nested surface
 * mounting later (a table the user just inserted, a card rendering below the caret) would
 * otherwise take the target away from the surface the caret is actually in, and toolbar
 * bold/link/list would silently act on the wrong editor (FB-39).
 *
 * A root that is no longer in the document does not count as live: React can mount the
 * replacement before the old surface's cleanup runs, and a detached root must never keep
 * ownership.
 */
export function hasActiveLexicalEditor(): boolean {
  if (!activeLexicalEditor || !activeLexicalRoot) {
    return false;
  }
  return activeLexicalRoot.isConnected;
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
  // Treat Lexical as the command target when the bound surface is this editor
  // (main flow or a table-cell Lexical root) or nested inside it.
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
