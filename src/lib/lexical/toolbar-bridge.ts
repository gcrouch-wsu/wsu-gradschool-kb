"use client";

import type { LexicalEditor } from "lexical";
import { getBoundEditorSurface } from "@/lib/rich-text-selection";

interface FlowSurface {
  root: HTMLElement;
  onMutate: () => void;
  /** Re-runs the surface's own claim path: register here + bind the shared toolbar. */
  claim: () => void;
}

// Every mounted Lexical surface (page flow, card, procedure section, table cell)
// is tracked here. Ownership of the shared toolbar is a *derived* value — see
// syncActiveFromFocus — not something a mount or a re-render gets to set.
const surfaces = new Map<LexicalEditor, FlowSurface>();
let activeLexicalEditor: LexicalEditor | null = null;

/**
 * Make a surface known without taking the toolbar from whoever holds it.
 *
 * Tracking is what lets ownership be re-derived from DOM focus later. Returns an
 * untrack function for the surface's effect cleanup.
 */
export function trackLexicalFlowSurface(editor: LexicalEditor, surface: FlowSurface): () => void {
  surfaces.set(editor, surface);
  return () => {
    if (surfaces.get(editor) === surface) {
      surfaces.delete(editor);
    }
  };
}

export function registerLexicalFlowEditor(
  editor: LexicalEditor,
  root: HTMLElement,
  onMutate: () => void,
) {
  const tracked = surfaces.get(editor);
  surfaces.set(editor, { root, onMutate, claim: tracked?.claim ?? (() => {}) });
  activeLexicalEditor = editor;
}

export function unregisterLexicalFlowEditor(editor: LexicalEditor) {
  surfaces.delete(editor);
  if (activeLexicalEditor === editor) {
    activeLexicalEditor = null;
  }
}

/** Innermost tracked surface containing `node`, so nested editors win over their host. */
function editorForNode(node: Node | null | undefined): LexicalEditor | null {
  if (!node) {
    return null;
  }
  let best: LexicalEditor | null = null;
  let bestRoot: HTMLElement | null = null;
  for (const [editor, surface] of surfaces) {
    if (!surface.root.isConnected || !surface.root.contains(node)) {
      continue;
    }
    if (!bestRoot || bestRoot.contains(surface.root)) {
      best = editor;
      bestRoot = surface.root;
    }
  }
  return best;
}

function takeOwnership(editor: LexicalEditor) {
  if (editor === activeLexicalEditor) {
    return;
  }
  const surface = surfaces.get(editor);
  activeLexicalEditor = editor;
  // Re-binds the shared selection target too; without it toolbar DOM helpers keep
  // operating on the previously bound surface.
  surface?.claim();
}

/**
 * Ownership follows DOM focus, re-derived on every read.
 *
 * `focusin` alone is not enough. React re-renders and DOM surgery run while focus
 * never leaves the surface, so no event fires to re-claim the toolbar — and a
 * surface effect that re-ran on a changed callback identity used to hand the
 * toolbar back to the *first* surface on the page. Bold/italic/underline then
 * dispatched into an editor the caret was not in, which read as "formatting
 * stopped working" plus a jump to the top of the document.
 */
function syncActiveFromFocus() {
  if (typeof document === "undefined") {
    return;
  }
  const focused = editorForNode(document.activeElement);
  if (focused) {
    takeOwnership(focused);
    return;
  }

  const current = activeLexicalEditor ? surfaces.get(activeLexicalEditor) : null;
  if (current?.root.isConnected) {
    // Focus is outside every surface (a toolbar select, a dialog field). The last
    // focused surface keeps the toolbar so its saved selection stays usable.
    return;
  }

  // The owner was unmounted. Fall back to whichever live surface still holds the
  // selection or the bound toolbar target before giving up.
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  const bySelection = selection?.rangeCount
    ? editorForNode(selection.getRangeAt(0).commonAncestorContainer)
    : null;
  const next = bySelection ?? editorForNode(getBoundEditorSurface());
  if (next) {
    takeOwnership(next);
    return;
  }
  if (activeLexicalEditor && !current) {
    activeLexicalEditor = null;
  }
}

/**
 * True when a live surface already owns the shared toolbar.
 *
 * Surfaces use this to claim the toolbar on mount only when it is free. Every flow,
 * card, procedure, and table-cell surface registers through this one module, so a nested
 * surface mounting later (a table the user just inserted, a card rendering below the
 * caret) must not take the target away from the surface the caret is actually in (FB-39).
 *
 * A root that is no longer in the document does not count as live: React can mount the
 * replacement before the old surface's cleanup runs, and a detached root must never keep
 * ownership.
 */
export function hasActiveLexicalEditor(): boolean {
  syncActiveFromFocus();
  const surface = activeLexicalEditor ? surfaces.get(activeLexicalEditor) : null;
  return Boolean(surface?.root.isConnected);
}

export function getActiveLexicalEditor(): LexicalEditor | null {
  syncActiveFromFocus();
  return activeLexicalEditor;
}

export function getActiveLexicalRoot(): HTMLElement | null {
  syncActiveFromFocus();
  return activeLexicalEditor ? surfaces.get(activeLexicalEditor)?.root ?? null : null;
}

export function isLexicalFlowActive(): boolean {
  syncActiveFromFocus();
  const activeLexicalRoot = activeLexicalEditor ? surfaces.get(activeLexicalEditor)?.root : null;
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
  // Deliberately not re-derived: this runs immediately after a command dispatched
  // into the editor resolved above, and must emit from that same surface.
  const surface = activeLexicalEditor ? surfaces.get(activeLexicalEditor) : null;
  surface?.onMutate();
}
