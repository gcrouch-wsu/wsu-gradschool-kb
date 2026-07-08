"use client";

import { CreditCard, ImagePlus, Link as LinkIcon, Redo2, Rows3, Table2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RichTextToolbar } from "@/components/RichTextToolbar";
import type { EditorPalette } from "@/lib/kb-theme";
import {
  applyBlockTag,
  applyIndent,
  applyList,
  applyOrderedListStart,
  applyOutdent,
  copyHeadingAnchor,
  EMPTY_EDITOR_FORMATTING,
  performEditorRedo,
  performEditorUndo,
  queryEditorFormatting,
  saveEditorSelection,
  subscribeEditorFormatting,
  toolbarPrepare,
  type EditorFormatting,
} from "@/lib/page-editor-format";

const KEYBOARD_SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Ctrl+B / Ctrl+I / Ctrl+U", action: "Bold / italic / underline" },
  { keys: "Ctrl+K", action: "Insert or edit a link" },
  { keys: "Tab / Shift+Tab", action: "Indent / outdent a list item" },
  { keys: "Ctrl+Z / Ctrl+Y", action: "Undo / redo" },
  { keys: "Ctrl+C / Ctrl+V", action: "Copy / paste (Word and web content is cleaned automatically)" },
];

export function DocumentToolbar({
  editorPalette,
  onInsertInfoBox,
  onInsertMedia,
  onAddNote,
  onAddTable,
  onAddCard,
  onAddProcedureSection,
  onInsertSectionBreak,
  pageUrl,
}: {
  editorPalette?: EditorPalette;
  onInsertMedia: () => void;
  onInsertInfoBox: () => void;
  onAddNote: () => void;
  onAddTable: () => void;
  onAddCard: () => void;
  onAddProcedureSection: () => void;
  onInsertSectionBreak: () => void;
  pageUrl?: string;
}) {
  const [formatting, setFormatting] = useState<EditorFormatting>(EMPTY_EDITOR_FORMATTING);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const updateFormatting = () => {
      setFormatting(queryEditorFormatting());
    };
    document.addEventListener("selectionchange", updateFormatting);
    const unsubscribeFormatting = subscribeEditorFormatting(updateFormatting);
    return () => {
      document.removeEventListener("selectionchange", updateFormatting);
      unsubscribeFormatting();
    };
  }, []);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const close = (event: MouseEvent) => {
      if (!shortcutsRef.current?.contains(event.target as Node)) {
        setShortcutsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [shortcutsOpen]);

  const buttonClass = "rich-text-toolbar__button";
  const isTableCell = formatting.surfaceKind === "table-cell";
  const indentTitle = !formatting.inList
    ? "Place the cursor in a list item to indent"
    : formatting.canIndentListItem
      ? "Nest this item under the previous item (Tab)"
      : "Add a list item above this one before nesting it";
  const outdentTitle = !formatting.inList
    ? "Place the cursor in a nested list item to outdent"
    : formatting.canOutdentListItem
      ? "Move this item up one list level (Shift+Tab)"
      : "This list item is already at the top level";

  return (
    <div className="document-toolbar">
      <div className="document-toolbar__history" role="group" aria-label="Undo and redo">
        <button
          aria-label="Undo"
          className={`${buttonClass} rich-text-toolbar__button--icon`}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => performEditorUndo()}
          title="Undo (Ctrl+Z)"
          type="button"
        >
          <Undo2 aria-hidden size={16} strokeWidth={1.75} />
        </button>
        <button
          aria-label="Redo"
          className={`${buttonClass} rich-text-toolbar__button--icon`}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => performEditorRedo()}
          title="Redo (Ctrl+Y)"
          type="button"
        >
          <Redo2 aria-hidden size={16} strokeWidth={1.75} />
        </button>
      </div>
      <span className="rich-text-toolbar__divider" aria-hidden="true" />
      {isTableCell ? (
        <div className="document-toolbar__context" aria-label="Editing context">
          Table cell: text tools only
        </div>
      ) : (
      <div className="document-toolbar__structure" role="group" aria-label="Block style and lists">
        <button
          aria-label="Paragraph"
          aria-pressed={formatting.p}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyBlockTag("p")}
          title="Paragraph"
          type="button"
        >
          ¶
        </button>
        <button
          aria-label="Heading level 2"
          aria-pressed={formatting.h2}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyBlockTag("h2")}
          title="Heading level 2"
          type="button"
        >
          H2
        </button>
        <button
          aria-label="Heading level 3"
          aria-pressed={formatting.h3}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyBlockTag("h3")}
          title="Heading level 3"
          type="button"
        >
          H3
        </button>
        <button
          aria-label="Bulleted list"
          aria-pressed={formatting.unorderedList}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyList("insertUnorderedList")}
          type="button"
        >
          • List
        </button>
        <button
          aria-label="Numbered list"
          aria-pressed={formatting.orderedList}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyList("insertOrderedList")}
          type="button"
        >
          1. List
        </button>
        {formatting.orderedListStart !== null && (
          <label className="rich-text-toolbar__field rich-text-toolbar__field--inline">
            <span className="meta">Starts at</span>
            <input
              className="rich-text-toolbar__number"
              min={1}
              onChange={(event) => applyOrderedListStart(Number(event.target.value))}
              onMouseDown={() => saveEditorSelection()}
              type="number"
              value={formatting.orderedListStart}
            />
          </label>
        )}
        {formatting.inList && (
          <span className="rich-text-toolbar__status" title="Current list level">
            Level {formatting.listLevel}: {formatting.listMarkerLabel}
          </span>
        )}
        <button
          disabled={!formatting.canIndentListItem}
          aria-label="Indent list item"
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyIndent()}
          title={indentTitle}
          type="button"
        >
          →
        </button>
        <button
          disabled={!formatting.canOutdentListItem}
          aria-label="Outdent list item"
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyOutdent()}
          title={outdentTitle}
          type="button"
        >
          ←
        </button>
        {(formatting.h2 || formatting.h3) && (
          <button
            aria-label="Copy a link to this heading"
            className={buttonClass}
            onMouseDown={(event) => toolbarPrepare(event)}
            onClick={() => copyHeadingAnchor(pageUrl)}
            title="Copy a link that jumps straight to this heading"
            type="button"
          >
            <LinkIcon aria-hidden size={14} strokeWidth={1.75} /> Anchor
          </button>
        )}
      </div>
      )}
      <span className="rich-text-toolbar__divider" aria-hidden="true" />
      <RichTextToolbar editorPalette={editorPalette} />
      {!isTableCell && (
        <>
          <span className="rich-text-toolbar__divider" aria-hidden="true" />
          <div className="document-toolbar__insert" role="group" aria-label="Insert">
            <button
              aria-label="Insert divider"
              className={`${buttonClass} rich-text-toolbar__button--icon`}
              onMouseDown={(event) => toolbarPrepare(event)}
              onClick={onInsertSectionBreak}
              title="Insert a section divider"
              type="button"
            >
              <Rows3 aria-hidden size={16} strokeWidth={1.75} />
            </button>
            <button
              className={buttonClass}
              onMouseDown={(event) => toolbarPrepare(event)}
              onClick={onAddProcedureSection}
              title="Insert a structural procedure section"
              type="button"
            >
              Procedure section
            </button>
            <button
              aria-label="Insert table"
              className={`${buttonClass} rich-text-toolbar__button--icon`}
              onMouseDown={(event) => toolbarPrepare(event)}
              onClick={onAddTable}
              title="Insert an accessible table section"
              type="button"
            >
              <Table2 aria-hidden size={16} strokeWidth={1.75} />
            </button>
            <button
              aria-label="Insert card section"
              className={`${buttonClass} rich-text-toolbar__button--icon`}
              onMouseDown={(event) => toolbarPrepare(event)}
              onClick={onAddCard}
              title="Insert a highlighted card section"
              type="button"
            >
              <CreditCard aria-hidden size={16} strokeWidth={1.75} />
            </button>
            <button
              aria-label="Insert media"
              className={`${buttonClass} rich-text-toolbar__button--icon`}
              onMouseDown={(event) => toolbarPrepare(event)}
              onClick={onInsertMedia}
              title="Insert an image, video, or file from the asset library"
              type="button"
            >
              <ImagePlus aria-hidden size={16} strokeWidth={1.75} />
            </button>
            <button
              className={buttonClass}
              onMouseDown={(event) => toolbarPrepare(event)}
              onClick={onInsertInfoBox}
              title="Insert an info box that is visible to readers"
              type="button"
            >
              Info box
            </button>
          </div>
          <span className="rich-text-toolbar__divider" aria-hidden="true" />
          <div className="document-toolbar__review" role="group" aria-label="Review">
            <button
              className={buttonClass}
              onMouseDown={(event) => toolbarPrepare(event)}
              onClick={onAddNote}
              title="Add an editor-only note at the cursor or on selected text"
              type="button"
            >
              Editor note
            </button>
            <span className="toolbar-popover-wrap" ref={shortcutsRef}>
              <button
                aria-expanded={shortcutsOpen}
                aria-label="Keyboard shortcuts"
                className={buttonClass}
                onClick={() => setShortcutsOpen((open) => !open)}
                title="Keyboard shortcuts"
                type="button"
              >
                ?
              </button>
              {shortcutsOpen && (
                <div className="toolbar-popover shortcuts-popover" role="dialog" aria-label="Keyboard shortcuts">
                  <strong>Keyboard shortcuts</strong>
                  <dl className="shortcuts-popover__list">
                    {KEYBOARD_SHORTCUTS.map((item) => (
                      <div className="shortcuts-popover__row" key={item.keys}>
                        <dt>
                          <kbd>{item.keys}</kbd>
                        </dt>
                        <dd>{item.action}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
