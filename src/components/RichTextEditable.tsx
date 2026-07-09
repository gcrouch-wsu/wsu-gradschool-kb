"use client";

import { useLayoutEffect, useRef } from "react";
import { bindPageEditor, handleEditorKeyDown, refreshEditorFormatting } from "@/lib/page-editor-format";
import { richTextToPlainText, sanitizeRichText, textToRichText } from "@/lib/rich-text";
import { saveRichTextSelection } from "@/lib/rich-text-selection";

type RichTextElement = "div" | "h2" | "h3" | "li";

export function RichTextEditable({
  className,
  element = "div",
  text,
  html,
  onChange,
}: {
  className?: string;
  element?: RichTextElement;
  text: string;
  html?: string;
  onChange: (html: string, text: string) => void;
}) {
  const Tag = element;
  const value = sanitizeRichText(html ?? textToRichText(text));
  const surfaceRef = useRef<HTMLElement | null>(null);
  const lastSyncedHtml = useRef(value);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    if (document.activeElement === surface) {
      return;
    }
    // A link is being edited in this cell (the dialog took focus, leaving a
    // draft marker behind). Rewriting innerHTML now would destroy that marker
    // and lose the pending link, so leave the DOM alone until the edit resolves.
    if (surface.querySelector(".doc-link-draft")) {
      return;
    }
    if (!surface.innerHTML || value !== lastSyncedHtml.current) {
      surface.innerHTML = value;
      lastSyncedHtml.current = value;
    }
  }, [value]);

  function syncFromSurface(surface: HTMLElement, isBlur: boolean) {
    // A link is being edited: the dialog blurred this cell, leaving a draft
    // marker in the DOM. Reformatting/re-serializing now would strip the marker
    // (sanitize drops the placeholder span) and lose the pending link. Leave the
    // DOM and model untouched — commitLink or cancel resolves it and re-syncs.
    if (surface.querySelector(".doc-link-draft")) {
      return;
    }
    const cleanHtml = sanitizeRichText(surface.innerHTML);
    if (isBlur && surface.innerHTML !== cleanHtml) {
      surface.innerHTML = cleanHtml;
    }
    lastSyncedHtml.current = cleanHtml;
    onChange(cleanHtml, richTextToPlainText(cleanHtml));
  }

  function bindSurface(surface: HTMLElement) {
    bindPageEditor(surface, () => syncFromSurface(surface, false));
    saveRichTextSelection();
  }

  return (
    <Tag
      className={className}
      contentEditable
      onBlur={(event) => syncFromSurface(event.currentTarget, true)}
      onFocus={(event) => bindSurface(event.currentTarget)}
      onInput={(event) => {
        syncFromSurface(event.currentTarget, false);
        refreshEditorFormatting();
      }}
      onKeyDown={handleEditorKeyDown}
      onKeyUp={() => refreshEditorFormatting()}
      onMouseUp={() => refreshEditorFormatting()}
      ref={(node: HTMLElement | null) => {
        surfaceRef.current = node;
      }}
      suppressContentEditableWarning
    />
  );
}
