"use client";

import { Eraser, Link2, Link2Off } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RICH_TEXT_COLORS } from "@/lib/rich-text";
import type { EditorPalette } from "@/lib/kb-theme";
import {
  applyAlign,
  applyEditorCommand,
  applyFontFamily,
  applyFontSize,
  applyInlineFormat,
  EMPTY_EDITOR_FORMATTING,
  insertEditorText,
  openLinkEditor,
  queryEditorFormatting,
  RICH_TEXT_FONT_FAMILIES,
  RICH_TEXT_FONT_SIZES,
  saveEditorSelection,
  subscribeEditorFormatting,
  toolbarPrepare,
  type EditorFormatting,
} from "@/lib/page-editor-format";

const SYMBOLS = [
  "—", "–", "…", "©", "®", "™", "§", "¶", "°", "±",
  "×", "÷", "≤", "≥", "≠", "≈", "½", "⅓", "¼", "¾",
  "→", "←", "↑", "↓", "•", "·", "✓", "✗", "€", "£",
  "¢", "¥", "“", "”", "‘", "’", "«", "»", "†", "‡",
];

export function RichTextToolbar({ editorPalette }: { editorPalette?: EditorPalette }) {

  const fonts = editorPalette?.fonts ?? RICH_TEXT_FONT_FAMILIES;
  const sizes = editorPalette?.sizes ?? RICH_TEXT_FONT_SIZES;
  const colors = editorPalette?.colors ?? RICH_TEXT_COLORS;
  const [formatting, setFormatting] = useState<EditorFormatting>(EMPTY_EDITOR_FORMATTING);

  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const symbolsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const updateFormatting = () => {
      saveEditorSelection();
      setFormatting(queryEditorFormatting());
    };
    document.addEventListener("selectionchange", updateFormatting);
    const unsubscribeFormatting = subscribeEditorFormatting(updateFormatting);
    return () => {
      document.removeEventListener("selectionchange", updateFormatting);
      unsubscribeFormatting();
    };
  }, []);

  useEffect(() => {
    if (!symbolsOpen) return;
    const close = (event: MouseEvent) => {
      if (!symbolsRef.current?.contains(event.target as Node)) {
        setSymbolsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [symbolsOpen]);

  const buttonClass = "rich-text-toolbar__button";
  const selectClass = "rich-text-toolbar__select";

  return (
    <div className="rich-text-toolbar" aria-label="Text formatting toolbar">
      <label className="rich-text-toolbar__field">
        <span className="sr-only">Font</span>
        <select
          className={selectClass}
          defaultValue=""
          onMouseDown={() => saveEditorSelection()}
          onFocus={() => saveEditorSelection()}
          onChange={(event) => {
            const option = fonts[event.target.selectedIndex];
            if (option?.value) {
              applyFontFamily(option.value);
            }
            event.target.value = "";
          }}
        >
          {fonts.map((option, index) => (
            <option key={`${option.label}-${index}`} value={option.label}>
              {option.label === "Default" ? "Font" : option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="rich-text-toolbar__field">
        <span className="sr-only">Size</span>
        <select
          className={selectClass}
          defaultValue=""
          onMouseDown={() => saveEditorSelection()}
          onFocus={() => saveEditorSelection()}
          onChange={(event) => {
            const option = sizes[event.target.selectedIndex];
            if (option?.value) {
              applyFontSize(option.value);
            }
            event.target.value = "";
          }}
        >
          {sizes.map((option, index) => (
            <option key={`${option.label}-${index}`} value={option.label}>
              {option.label === "Default" ? "Size" : option.label}
            </option>
          ))}
        </select>
      </label>
      <span className="rich-text-toolbar__color-group" role="group" aria-label="Text color">
          {colors.filter((option) => option.value).map((option, index) => (
          <button
            aria-label={`Text color: ${option.label}`}
            className="rich-text-toolbar__color-swatch"
            key={`${option.value}-${index}`}
            onMouseDown={(event) => toolbarPrepare(event)}
            onClick={() => applyInlineFormat({ color: option.value })}
            style={{ backgroundColor: option.value }}
            title={option.label}
            type="button"
          />
        ))}
      </span>
      <span className="rich-text-toolbar__divider" aria-hidden="true" />
      <button
        aria-label="Bold"
        aria-pressed={formatting.bold}
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyEditorCommand("bold")}
        type="button"
      >
        B
      </button>
      <button
        aria-label="Italic"
        aria-pressed={formatting.italic}
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyEditorCommand("italic")}
        type="button"
      >
        I
      </button>
      <button
        aria-label="Underline"
        aria-pressed={formatting.underline}
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyEditorCommand("underline")}
        type="button"
      >
        U
      </button>
      <button
        aria-label="Strikethrough"
        aria-pressed={formatting.strikeThrough}
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyEditorCommand("strikeThrough")}
        type="button"
      >
        S
      </button>
      <button
        aria-label="Superscript"
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyEditorCommand("superscript")}
        title="Superscript"
        type="button"
      >
        Sup
      </button>
      <button
        aria-label="Subscript"
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyEditorCommand("subscript")}
        title="Subscript"
        type="button"
      >
        Sub
      </button>
      <span className="rich-text-toolbar__divider" aria-hidden="true" />
      <button
        aria-label="Align left"
        aria-pressed={formatting.alignLeft}
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyAlign("left")}
        title="Align left"
        type="button"
      >
        ⤆
      </button>
      <button
        aria-label="Align center"
        aria-pressed={formatting.alignCenter}
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyAlign("center")}
        title="Align center"
        type="button"
      >
        ↔
      </button>
      <button
        aria-label="Align right"
        aria-pressed={formatting.alignRight}
        className={buttonClass}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyAlign("right")}
        title="Align right"
        type="button"
      >
        ⤇
      </button>
      <span className="rich-text-toolbar__divider" aria-hidden="true" />
      <button
        aria-label="Insert or edit link"
        className={`${buttonClass} rich-text-toolbar__button--icon`}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => openLinkEditor()}
        title="Insert or edit a link"
        type="button"
      >
        <Link2 aria-hidden size={16} strokeWidth={1.75} />
      </button>
      <button
        aria-label="Remove link"
        className={`${buttonClass} rich-text-toolbar__button--icon`}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyEditorCommand("unlink")}
        title="Remove link"
        type="button"
      >
        <Link2Off aria-hidden size={16} strokeWidth={1.75} />
      </button>
      <button
        aria-label="Clear formatting"
        className={`${buttonClass} rich-text-toolbar__button--icon`}
        onMouseDown={(event) => toolbarPrepare(event)}
        onClick={() => applyEditorCommand("removeFormat")}
        title="Clear formatting"
        type="button"
      >
        <Eraser aria-hidden size={16} strokeWidth={1.75} />
      </button>
      <span className="toolbar-popover-wrap" ref={symbolsRef}>
        <button
          aria-expanded={symbolsOpen}
          aria-label="Insert a symbol"
          className={buttonClass}
          onMouseDown={(event) => toolbarPrepare(event)}
          onClick={() => setSymbolsOpen((open) => !open)}
          title="Insert a special character"
          type="button"
        >
          Ω
        </button>
        {symbolsOpen && (
          <div
            className="toolbar-popover toolbar-popover--anchored-right symbol-palette"
            role="menu"
            aria-label="Special characters"
          >
            {SYMBOLS.map((symbol) => (
              <button
                className="symbol-palette__item"
                key={symbol}
                onMouseDown={(event) => toolbarPrepare(event)}
                onClick={() => {
                  insertEditorText(symbol);
                  setSymbolsOpen(false);
                }}
                type="button"
              >
                {symbol}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}
