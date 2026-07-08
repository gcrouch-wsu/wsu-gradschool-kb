"use client";

import { useLayoutEffect, useRef } from "react";
import { bindPageEditor, handleEditorKeyDown } from "@/lib/page-editor-format";
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
    if (!surface.innerHTML || value !== lastSyncedHtml.current) {
      surface.innerHTML = value;
      lastSyncedHtml.current = value;
    }
  }, [value]);

  function syncFromSurface(surface: HTMLElement, isBlur: boolean) {
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
      onInput={(event) => syncFromSurface(event.currentTarget, false)}
      onKeyDown={handleEditorKeyDown}
      onKeyUp={() => saveRichTextSelection()}
      onMouseUp={() => saveRichTextSelection()}
      ref={(node: HTMLElement | null) => {
        surfaceRef.current = node;
      }}
      suppressContentEditableWarning
    />
  );
}
