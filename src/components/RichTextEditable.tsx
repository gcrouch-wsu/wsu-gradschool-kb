"use client";

import { useLayoutEffect, useRef } from "react";
import { bindPageEditor, handleEditorKeyDown, refreshEditorFormatting } from "@/lib/page-editor-format";
import { richTextToPlainText, sanitizeRichText, textToRichText } from "@/lib/rich-text";
import { saveRichTextSelection } from "@/lib/rich-text-selection";

type RichTextElement = "div" | "h2" | "h3" | "li";

/** Nested rich text (table cells). Stays on contentEditable until Lexical cell
 * selection/link-draft parity matches FB-26 editor tests. */
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
    if (surface.querySelector(".doc-link-draft")) {
      return;
    }
    if (!surface.innerHTML || value !== lastSyncedHtml.current) {
      surface.innerHTML = value;
      lastSyncedHtml.current = value;
    }
  }, [value]);

  function syncFromSurface(surface: HTMLElement, isBlur: boolean) {
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
