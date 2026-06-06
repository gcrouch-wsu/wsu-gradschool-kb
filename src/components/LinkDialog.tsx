"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { LinkEditRequest } from "@/lib/page-editor-format";
import { useModalA11y } from "@/lib/use-modal-a11y";

export function LinkDialog({
  request,
  onClose,
  onSubmit,
  onRemove,
}: {
  request: LinkEditRequest;
  onClose: () => void;
  onSubmit: (result: { url: string; text: string; newTab: boolean }) => void;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState(request.url);
  const [text, setText] = useState(request.text);
  const [newTab, setNewTab] = useState(request.newTab);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  function submit() {
    if (!url.trim()) return;
    onSubmit({ url: url.trim(), text: text.trim(), newTab });
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="media-picker__overlay" onClick={onClose} role="presentation">
      <div
        aria-label={request.isEdit ? "Edit link" : "Insert link"}
        aria-modal="true"
        className="media-picker link-dialog"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong>{request.isEdit ? "Edit link" : "Insert link"}</strong>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="media-picker__body form">
          <label>
            <span className="meta">Display text</span>
            <input
              className="input"
              onChange={(e) => setText(e.target.value)}
              placeholder="Text shown to readers"
              value={text}
            />
          </label>
          <label>
            <span className="meta">URL</span>
            <input
              className="input"
              data-autofocus
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="https://… , /kb/… , mailto:… , or #anchor"
              value={url}
            />
          </label>
          <label className="checkbox-inline">
            <input checked={newTab} onChange={(e) => setNewTab(e.target.checked)} type="checkbox" />
            <span>Open in a new tab</span>
          </label>
          <p className="meta">
            New-tab links automatically get <code>rel=&quot;noopener noreferrer&quot;</code> for security.
          </p>
          <div className="link-dialog__actions">
            <button className="button" disabled={!url.trim()} onClick={submit} type="button">
              {request.isEdit ? "Update link" : "Insert link"}
            </button>
            {request.isEdit && request.anchor && (
              <button className="button button--ghost" onClick={onRemove} type="button">
                Remove link
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
