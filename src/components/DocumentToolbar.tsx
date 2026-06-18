"use client";

import { CreditCard, ImagePlus, Rows3, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { RichTextToolbar } from "@/components/RichTextToolbar";
import type { EditorPalette } from "@/lib/kb-theme";
import {
  applyBlockTag,
  applyIndent,
  applyList,
  applyOrderedListStart,
  applyOutdent,
  queryEditorFormatting,
  saveEditorSelection,
  toolbarPrepare,
  type EditorFormatting,
} from "@/lib/page-editor-format";

export function DocumentToolbar({
  editorPalette,
  onInsertInfoBox,
  onInsertMedia,
  onAddNote,
  onAddTable,
  onAddCard,
  onAddProcedureSection,
  onInsertSectionBreak,
}: {
  editorPalette?: EditorPalette;
  onInsertMedia: () => void;
  onInsertInfoBox: () => void;
  onAddNote: () => void;
  onAddTable: () => void;
  onAddCard: () => void;
  onAddProcedureSection: () => void;
  onInsertSectionBreak: () => void;
}) {
  const [formatting, setFormatting] = useState<EditorFormatting>({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    orderedList: false,
    unorderedList: false,
    h2: false,
    h3: false,
    p: false,
    alignLeft: false,
    alignCenter: false,
    alignRight: false,
    orderedListStart: null,
  });

  useEffect(() => {
    const onSelectionChange = () => {
      setFormatting(queryEditorFormatting());
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const buttonClass = "rich-text-toolbar__button";

  return (
    <div className="document-toolbar">
      <div className="document-toolbar__structure" role="group" aria-label="Block style">
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
        <button
          aria-label="Indent list item"
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyIndent()}
          title="Indent list item (Tab)"
          type="button"
        >
          →
        </button>
        <button
          aria-label="Outdent list item"
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyOutdent()}
          title="Outdent list item (Shift+Tab)"
          type="button"
        >
          ←
        </button>
      </div>
      <span className="rich-text-toolbar__divider" aria-hidden="true" />
      <RichTextToolbar editorPalette={editorPalette} />
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
      </div>
    </div>
  );
}
