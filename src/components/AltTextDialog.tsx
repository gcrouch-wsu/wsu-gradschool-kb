"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { AltEditRequest } from "@/lib/page-editor-format";
import { useModalA11y } from "@/lib/use-modal-a11y";

export function AltTextDialog({
  request,
  onClose,
  onSubmit,
}: {
  request: AltEditRequest;
  onClose: () => void;
  onSubmit: (result: { alt: string; caption: string; decorative: boolean; saveToAsset: boolean }) => void;
}) {
  const [alt, setAlt] = useState(request.alt);
  const [caption, setCaption] = useState(request.caption);
  const [decorative, setDecorative] = useState(request.decorative);
  const [saveToAsset, setSaveToAsset] = useState(false);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const canSave = decorative || alt.trim().length > 0;

  function submit() {
    if (!canSave) return;
    onSubmit({ alt: alt.trim(), caption: caption.trim(), decorative, saveToAsset });
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="media-picker__overlay" onClick={onClose} role="presentation">
      <div
        aria-label="Edit image alt text"
        aria-modal="true"
        className="media-picker link-dialog"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong>Image alt text</strong>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="media-picker__body">
          <label>
            <span className="meta">Describe the image for screen readers</span>
            <textarea
              className="input"
              data-autofocus
              disabled={decorative}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="e.g. Students walking past Bryan Hall on a sunny day"
              rows={3}
              value={decorative ? "" : alt}
            />
          </label>
          <label>
            <span className="meta">Visible caption (optional)</span>
            <textarea
              className="input"
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Optional caption shown below the image"
              rows={2}
              value={caption}
            />
          </label>
          {!decorative && !alt.trim() && caption.trim() && (
            <button
              className="button button--ghost button--small"
              onClick={() => setAlt(caption.trim())}
              type="button"
            >
              Use caption as starting alt text
            </button>
          )}
          <label className="checkbox-inline">
            <input
              checked={decorative}
              onChange={(e) => setDecorative(e.target.checked)}
              type="checkbox"
            />
            <span>This image is decorative (no description needed)</span>
          </label>
          {request.assetId && !decorative && (
            <label className="checkbox-inline">
              <input
                checked={saveToAsset}
                onChange={(e) => setSaveToAsset(e.target.checked)}
                type="checkbox"
              />
              <span>Also save this as the image&apos;s description in the asset library</span>
            </label>
          )}
          <p className="meta">
            Good alt text conveys the image&apos;s purpose, not just its appearance. Mark images decorative
            only when they add no information.
          </p>
          <div className="link-dialog__actions">
            <button className="button" disabled={!canSave} onClick={submit} type="button">
              Save alt text
            </button>
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
