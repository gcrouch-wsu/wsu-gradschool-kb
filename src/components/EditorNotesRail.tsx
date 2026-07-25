"use client";

import { useCallback, useEffect, useState } from "react";
import { openNoteEditor } from "@/lib/page-editor-format";

export type EditorNoteItem = {
  id: string;
  body: string;
  preview: string;
  isPoint: boolean;
  element: HTMLElement;
};

function collectNotes(root: HTMLElement | null): EditorNoteItem[] {
  if (!root) return [];
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".doc-note"));
  return nodes.map((element, index) => {
    const id = element.getAttribute("data-note-id") || `note-fallback-${index}`;
    const body = element.getAttribute("data-note-body") || "";
    const preview = (element.textContent || "").trim().slice(0, 48) || (element.classList.contains("doc-note--point") ? "Pinned note" : "Note");
    return {
      id,
      body,
      preview,
      isPoint: element.classList.contains("doc-note--point"),
      element,
    };
  });
}

/** Positioned margin rail listing editor-only notes for the current document. */
export function EditorNotesRail({
  rootSelector = ".block-list",
}: {
  rootSelector?: string;
}) {
  const [notes, setNotes] = useState<EditorNoteItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const root = document.querySelector(rootSelector) as HTMLElement | null;
    setNotes(collectNotes(root));
  }, [rootSelector]);

  useEffect(() => {
    refresh();
    const root = document.querySelector(rootSelector);
    if (!root) return;
    const observer = new MutationObserver(() => refresh());
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-note-body", "data-note-id", "class"],
    });
    return () => observer.disconnect();
  }, [refresh, rootSelector]);

  if (notes.length === 0) {
    return null;
  }

  return (
    <aside aria-label="Editor notes" className="editor-notes-rail">
      <h2 className="editor-notes-rail__title">Notes ({notes.length})</h2>
      <p className="meta editor-notes-rail__hint">Editor-only — never published.</p>
      <ol className="editor-notes-rail__list">
        {notes.map((note, index) => (
          <li key={note.id}>
            <button
              className={`editor-notes-rail__item${activeId === note.id ? " is-active" : ""}`}
              onClick={() => {
                setActiveId(note.id);
                note.element.scrollIntoView({ behavior: "smooth", block: "center" });
                note.element.classList.add("doc-note--flash");
                window.setTimeout(() => note.element.classList.remove("doc-note--flash"), 1200);
                openNoteEditor(note.element);
              }}
              type="button"
            >
              <span className="editor-notes-rail__index">{index + 1}</span>
              <span className="editor-notes-rail__body">
                <strong className="editor-notes-rail__preview">{note.preview}</strong>
                <span className="meta">{note.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
