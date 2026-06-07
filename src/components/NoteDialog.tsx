"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { NoteEditRequest } from "@/lib/page-editor-format";
import { useModalA11y } from "@/lib/use-modal-a11y";

export function NoteDialog({
  request,
  onClose,
  onSubmit,
  onRemove,
}: {
  request: NoteEditRequest;
  onClose: () => void;
  onSubmit: (result: { body: string }) => void;
  onRemove: () => void;
}) {
  const [body, setBody] = useState(request.body);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const anchorLabel = request.isEdit
    ? request.isPoint
      ? "This note is pinned between characters."
      : "This note is attached to highlighted text."
    : request.hasSelection
      ? "This note will attach to the selected text."
      : "This note will be pinned at the cursor.";

  function submit() {
    if (!body.trim()) return;
    onSubmit({ body: body.trim() });
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="media-picker__overlay" onClick={onClose} role="presentation">
      <div
        aria-label={request.isEdit ? "Edit note" : "Add note"}
        aria-modal="true"
        className="media-picker link-dialog"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong>{request.isEdit ? "Edit note" : "Add note"}</strong>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="media-picker__body form">
          <label>
            <span className="meta">Note (visible to editors only — never published)</span>
            <textarea
              className="input"
              data-autofocus
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="Leave an editor-only comment..."
              rows={4}
              value={body}
            />
          </label>
          <p className="meta">
            {anchorLabel} Editor notes are removed before publishing and excluded from search.
          </p>
          <div className="link-dialog__actions">
            <button className="button" disabled={!body.trim()} onClick={submit} type="button">
              {request.isEdit ? "Update note" : "Add note"}
            </button>
            {request.isEdit && request.span && (
              <button className="button button--ghost" onClick={onRemove} type="button">
                Remove note
              </button>
            )}
            <button className="button button--ghost" onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
