"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { blocksToSourceHtml } from "@/lib/page-document";
import { useModalA11y } from "@/lib/use-modal-a11y";
import type { ContentBlock } from "@/lib/types";

// Renders the current (possibly unsaved) editor content with the public
// article styles, so authors can check how a draft will look without saving.
// Videos and file links render as placeholders — they resolve against server
// data that a client-side preview cannot fetch.
export function DraftPreviewModal({
  blocks,
  kbSlug,
  onClose,
  showSummary,
  summary,
  title,
}: {
  blocks: ContentBlock[];
  kbSlug: string;
  onClose: () => void;
  showSummary: boolean;
  summary: string;
  title: string;
}) {
  const html = useMemo(() => blocksToSourceHtml(blocks, kbSlug), [blocks, kbSlug]);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="media-picker__overlay" onClick={onClose} role="presentation">
      <div
        aria-label="Draft preview"
        aria-modal="true"
        className="media-picker draft-preview"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong>Draft preview</strong>
          <span className="meta draft-preview__note">
            Current editor content in public styling — including unsaved changes. Videos and file
            links appear as placeholders.
          </span>
          <button aria-label="Close preview" className="icon-button" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="draft-preview__body">
          <article className="article flow">
            <h1>{title || "Untitled page"}</h1>
            {showSummary && summary.trim() && <p className="draft-preview__summary">{summary}</p>}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
