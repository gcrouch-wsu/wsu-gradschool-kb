"use client";

import { useSyncExternalStore } from "react";
import {
  getPageEditorDebugSnapshot,
  isPageEditorDebugEnabled,
  subscribePageEditorDebug,
} from "@/lib/page-editor-debug";

function row(label: string, value: string | boolean) {
  const display = typeof value === "boolean" ? (value ? "yes" : "no") : value || "—";
  return (
    <tr key={label}>
      <th scope="row">{label}</th>
      <td>
        <code>{display}</code>
      </td>
    </tr>
  );
}

const getServerSnapshot = () => false;

export function PageEditorDebugPanel() {
  const enabled = useSyncExternalStore(subscribePageEditorDebug, isPageEditorDebugEnabled, getServerSnapshot);
  const snap = useSyncExternalStore(subscribePageEditorDebug, getPageEditorDebugSnapshot, getPageEditorDebugSnapshot);

  if (!enabled) {
    return null;
  }

  return (
    <details className="page-editor-debug">
      <summary>Editor toolbar debug</summary>
      <p className="meta">
        Last action at <strong>{snap.at || "—"}</strong>. Persist logs with{" "}
        <code>localStorage.setItem(&quot;kb-editor-debug&quot;, &quot;1&quot;)</code> or add{" "}
        <code>?editorDebug=1</code> to the URL. Check the browser console for{" "}
        <code>[page-editor]</code> lines.
      </p>
      <table className="page-editor-debug__table">
        <tbody>
          {row("Editor bound", snap.editorBound)}
          {row("Editor focused", snap.editorFocused)}
          {row("Active element", snap.activeElement)}
          {row("Selection in editor", snap.selectionInEditor)}
          {row("Selection collapsed", snap.selectionCollapsed)}
          {row("Selection text", snap.selectionText.slice(0, 80))}
          {row("Saved range valid", snap.savedRangeValid)}
          {row("Saved range collapsed", snap.savedRangeCollapsed)}
          {row("Last action", snap.lastAction)}
          {row("Last result", snap.lastResult)}
          {row("Last detail", snap.lastDetail)}
        </tbody>
      </table>
    </details>
  );
}
