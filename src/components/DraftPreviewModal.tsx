"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { parse } from "node-html-parser";
import { blocksToSourceHtml } from "@/lib/page-document";
import { escapeHtml } from "@/lib/rich-text";
import { useModalA11y } from "@/lib/use-modal-a11y";
import type { ContentBlock } from "@/lib/types";

type ExcerptPreviewResult =
  | { state: "ok"; label: string; href: string; bodyHtml: string }
  | { state: "unavailable" };

// Renders the current (possibly unsaved) editor content with the public
// article styles, so authors can check how a draft will look without saving.
// Excerpts resolve through an authenticated preview endpoint so the modal
// matches the published render; videos and file links remain placeholders —
// they resolve against server data a client-side preview cannot fetch.
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
  const [excerptResults, setExcerptResults] = useState<Record<string, ExcerptPreviewResult> | null>(
    null,
  );
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  useEffect(() => {
    const refs = blocks
      .filter((block): block is Extract<ContentBlock, { type: "excerpt" }> => block.type === "excerpt")
      .map((block) => ({
        blockId: block.blockId,
        sourcePageId: block.sourcePageId,
        sourceHeadingBlockId: block.sourceHeadingBlockId,
        label: block.label,
      }));
    if (refs.length === 0) {
      return;
    }
    let cancelled = false;
    fetch("/api/admin/excerpt-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refs }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("preview failed"))))
      .then((data: { results?: Record<string, ExcerptPreviewResult> }) => {
        if (!cancelled && data.results) {
          setExcerptResults(data.results);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blocks]);

  const html = useMemo(() => {
    const base = blocksToSourceHtml(blocks, kbSlug);
    if (!excerptResults) {
      return base;
    }
    const root = parse(base);
    for (const node of root.querySelectorAll("div.doc-excerpt")) {
      const blockId = node.getAttribute("data-block-id") ?? "";
      const resolved = excerptResults[blockId];
      if (!resolved) {
        continue;
      }
      if (resolved.state !== "ok") {
        node.replaceWith(
          `<aside class="excerpt-box excerpt-box--unavailable" role="note"><p class="excerpt-box__source">This included content is currently unavailable.</p></aside>`,
        );
        continue;
      }
      node.replaceWith(
        `<aside class="excerpt-box" role="note"><p class="excerpt-box__source">Included from: <a href="${escapeHtml(resolved.href)}">${escapeHtml(resolved.label)}</a></p><div class="excerpt-box__blocks flow">${resolved.bodyHtml}</div></aside>`,
      );
    }
    return root.toString();
  }, [blocks, kbSlug, excerptResults]);

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
