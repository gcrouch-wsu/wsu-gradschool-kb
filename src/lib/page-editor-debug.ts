/** Live diagnostics for the page document editor toolbar (dev / opt-in). */

export type PageEditorDebugSnapshot = {
  at: string;
  editorBound: boolean;
  editorFocused: boolean;
  activeElement: string;
  selectionCollapsed: boolean;
  selectionInEditor: boolean;
  selectionText: string;
  savedRangeValid: boolean;
  savedRangeCollapsed: boolean;
  lastAction: string;
  lastResult: "ok" | "fail" | "idle";
  lastDetail: string;
};

const initial: PageEditorDebugSnapshot = {
  at: "",
  editorBound: false,
  editorFocused: false,
  activeElement: "",
  selectionCollapsed: true,
  selectionInEditor: false,
  selectionText: "",
  savedRangeValid: false,
  savedRangeCollapsed: true,
  lastAction: "",
  lastResult: "idle",
  lastDetail: "",
};

let snapshot: PageEditorDebugSnapshot = { ...initial };
const listeners = new Set<() => void>();

export function isPageEditorDebugEnabled(): boolean {
  // Opt-in only — this diagnostic panel does not show during normal editing
  // (including `npm run dev`). Turn it on with `?editorDebug=1` on the URL or
  // `localStorage.setItem("kb-editor-debug", "1")` when diagnosing the toolbar.
  if (typeof window === "undefined") {
    return false;
  }
  try {
    if (localStorage.getItem("kb-editor-debug") === "1") {
      return true;
    }
    if (new URLSearchParams(window.location.search).has("editorDebug")) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function getPageEditorDebugSnapshot(): PageEditorDebugSnapshot {
  return snapshot;
}

export function subscribePageEditorDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishPageEditorDebug(
  partial: Partial<PageEditorDebugSnapshot> & {
    lastAction?: string;
    lastResult?: PageEditorDebugSnapshot["lastResult"];
    lastDetail?: string;
  },
) {
  snapshot = {
    ...snapshot,
    ...partial,
    at: new Date().toLocaleTimeString(),
  };
  listeners.forEach((listener) => listener());
  if (isPageEditorDebugEnabled() && partial.lastAction) {
    console.debug("[page-editor]", partial.lastAction, partial.lastResult ?? snapshot.lastResult, partial.lastDetail ?? "");
  }
}

export function resetPageEditorDebugIdle() {
  snapshot = { ...snapshot, lastResult: "idle", lastDetail: "" };
  listeners.forEach((listener) => listener());
}
