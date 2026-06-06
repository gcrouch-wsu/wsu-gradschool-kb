"use client";

import { useEffect, useState } from "react";
import { RichTextToolbar } from "@/components/RichTextToolbar";
import type { EditorPalette } from "@/lib/kb-theme";
import {
  applyBlockTag,
  applyIndent,
  applyList,
  applyOutdent,
  queryEditorFormatting,
  toolbarPrepare,
  type EditorFormatting,
} from "@/lib/page-editor-format";

export function DocumentToolbar({
  editorPalette,
  onInsertAlert,
  onInsertMedia,
  onInsertEditorNote,
  onInsertSectionBreak,
}: {
  editorPalette?: EditorPalette;
  onInsertMedia: () => void;
  onInsertAlert: (variant: "info" | "warning") => void;
  onInsertEditorNote: () => void;
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
          aria-pressed={formatting.p}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyBlockTag("p")}
          type="button"
        >
          ¶
        </button>
        <button
          aria-pressed={formatting.h2}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyBlockTag("h2")}
          type="button"
        >
          H2
        </button>
        <button
          aria-pressed={formatting.h3}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyBlockTag("h3")}
          type="button"
        >
          H3
        </button>
        <button
          aria-pressed={formatting.unorderedList}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyList("insertUnorderedList")}
          type="button"
        >
          • List
        </button>
        <button
          aria-pressed={formatting.orderedList}
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyList("insertOrderedList")}
          type="button"
        >
          1. List
        </button>
        <button
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => applyIndent()}
          title="Indent list item (Tab)"
          type="button"
        >
          →
        </button>
        <button
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
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={onInsertSectionBreak}
          title="Insert a section divider"
          type="button"
        >
          Divider
        </button>
        <button
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={onInsertMedia}
          title="Insert an image, video, or file from the asset library"
          type="button"
        >
          Media
        </button>
        <button
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => onInsertAlert("info")}
          title="Insert an info callout (visible to readers)"
          type="button"
        >
          Info
        </button>
        <button
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => onInsertAlert("warning")}
          title="Insert a warning callout (visible to readers)"
          type="button"
        >
          Warning
        </button>
        <button
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={onInsertEditorNote}
          title="Insert an editor-only note (hidden from the published page)"
          type="button"
        >
          Editor note
        </button>
      </div>
    </div>
  );
}
