"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AltTextDialog } from "@/components/AltTextDialog";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import { LinkDialog } from "@/components/LinkDialog";
import { MediaPicker } from "@/components/MediaPicker";
import { PageEditorDebugPanel } from "@/components/PageEditorDebugPanel";
import { TableBlockEditor } from "@/components/TableBlockEditor";
import { blocksToSections, sectionsToBlocks, type EditorSection } from "@/lib/page-editor-list";
import {
  blocksToDocumentHtml,
  documentHtmlToBlocks,
  sanitizePageDocument,
} from "@/lib/page-document";
import {
  applyAltText,
  bindPageEditor,
  commitLink,
  handleEditorTabKey,
  handleImageControlClick,
  insertEditorHtml,
  registerAltEditor,
  registerFormatIssueReporter,
  registerLinkEditor,
  removeLink,
  saveEditorSelection,
  watchEditorSelectionForDebug,
  type AltEditRequest,
  type LinkEditRequest,
} from "@/lib/page-editor-format";
import { textToRichText } from "@/lib/rich-text";
import type { EditorPalette } from "@/lib/kb-theme";
import type { ContentBlock } from "@/lib/types";

function newBlockId() {
  return `block-${crypto.randomUUID()}`;
}

export function PageDocumentEditor({
  blocks,
  editorPalette,
  kbId,
  kbSlug,
  onChange,
}: {
  blocks: ContentBlock[];
  editorPalette?: EditorPalette;
  kbId: string;
  kbSlug: string;
  onChange: (blocks: ContentBlock[]) => void;
}) {
  const initialSections = blocksToSections(blocks);
  const [sections, setSections] = useState<EditorSection[]>(initialSections);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [linkRequest, setLinkRequest] = useState<LinkEditRequest | null>(null);
  const [altRequest, setAltRequest] = useState<AltEditRequest | null>(null);
  const [formatHint, setFormatHint] = useState<string | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emitChange = useCallback((nextSections: EditorSection[]) => {
    setSections(nextSections);
    onChangeRef.current(sectionsToBlocks(nextSections));
  }, []);

  useEffect(() => {
    registerFormatIssueReporter(setFormatHint);
    registerLinkEditor(setLinkRequest);
    registerAltEditor(setAltRequest);
    const unwatchSelection = watchEditorSelectionForDebug();
    return () => {
      registerFormatIssueReporter(() => {});
      registerLinkEditor(null);
      registerAltEditor(null);
      unwatchSelection();
    };
  }, []);

  function insertBlockFromPicker(block: ContentBlock) {
    if (block.type === "image") {
      // Images flow inline with the text; insert at the cursor when possible.
      const html = blocksToDocumentHtml([block], kbSlug);
      if (!insertEditorHtml(html)) {
        addBlockToFirstFlow(block);
      }
    } else if (block.type === "video") {
      emitChange([...sections, { type: "video", block }]);
    } else if (block.type === "asset_link") {
      emitChange([...sections, { type: "asset_link", block }]);
    } else {
      addBlockToFirstFlow(block);
    }
    setMediaPickerOpen(false);
  }

  function addBlockToFirstFlow(block: ContentBlock) {
    const next = [...sections];
    const flowIndex = next.findIndex((s) => s.type === "flow");
    if (flowIndex >= 0) {
      (next[flowIndex] as any).blocks.push(block);
    } else {
      next.unshift({ type: "flow", blocks: [block] });
    }
    emitChange(next);
  }

  function handleInsertAlert(variant: "info" | "warning") {
    const placeholder =
      variant === "warning"
        ? "Warning: replace with the caution readers need."
        : "Info: replace with the note readers should see.";
    const html = `<aside class="doc-alert doc-alert--${variant}" data-block-id="${newBlockId()}" data-variant="${variant}">${textToRichText(placeholder)}</aside>`;
    if (!insertEditorHtml(html)) {
      addBlockToFirstFlow({ type: "alert", blockId: newBlockId(), variant, text: placeholder });
    }
  }

  function handleInsertEditorNote() {
    const id = newBlockId();
    const placeholder = "Note to editors — not shown on the published page.";
    const html =
      `<aside class="doc-editor-note" data-block-id="${id}" data-editor-note="true">` +
      `<span class="doc-editor-note__tag" contenteditable="false">Editor note — not published</span>` +
      `<span class="doc-editor-note__body">${textToRichText(placeholder)}</span></aside>`;
    if (!insertEditorHtml(html)) {
      addBlockToFirstFlow({ type: "editor_note", blockId: id, text: placeholder });
    }
  }

  function handleInsertSectionBreak() {
    const html = `<div class="doc-section-break" contenteditable="false" data-block-id="${newBlockId()}" role="separator" aria-label="Section break"></div>`;
    if (!insertEditorHtml(html)) {
      addBlockToFirstFlow({ type: "section_divider", blockId: newBlockId() });
    }
  }

  function moveSection(index: number, direction: -1 | 1) {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    emitChange(next);
  }

  function removeSection(index: number) {
    const next = sections.filter((_, i) => i !== index);
    emitChange(next);
  }

  function updateFlowSection(index: number, html: string, isBlur: boolean) {
    const clean = sanitizePageDocument(html);
    const flowBlocks = documentHtmlToBlocks(clean);
    const next = [...sections];
    next[index] = { type: "flow", blocks: flowBlocks };
    emitChange(next);
  }

  function updateTableSection(index: number, block: ContentBlock) {
    if (block.type !== "table") return;
    const next = [...sections];
    next[index] = { type: "table", block };
    emitChange(next);
  }

  function updateVideoSection(index: number, block: ContentBlock) {
    if (block.type !== "video") return;
    const next = [...sections];
    next[index] = { type: "video", block };
    emitChange(next);
  }

  function addTable() {
    const next = [
      ...sections,
      {
        type: "table" as const,
        block: {
          blockId: newBlockId(),
          type: "table" as const,
          caption: "",
          hasHeaderRow: true,
          hasHeaderColumn: false,
          rows: [["Header 1", "Header 2"], ["", ""]],
        },
      },
    ];
    emitChange(next);
  }

  function addCard() {
    const next = [
      ...sections,
      {
        type: "card" as const,
        block: {
          blockId: newBlockId(),
          type: "card" as const,
          background: "wash" as const,
          blocks: [{ blockId: newBlockId(), type: "paragraph" as const, text: "Card content..." }],
        },
      },
    ];
    emitChange(next);
  }

  function updateCardSection(index: number, block: ContentBlock) {
    if (block.type !== "card") return;
    const next = [...sections];
    next[index] = { type: "card", block };
    emitChange(next);
  }

  return (
    <div className="page-document-editor">
      <div className="editor-toolbar-sticky">
        <DocumentToolbar
          editorPalette={editorPalette}
          onInsertAlert={handleInsertAlert}
          onInsertMedia={() => setMediaPickerOpen(true)}
          onInsertEditorNote={handleInsertEditorNote}
          onInsertSectionBreak={handleInsertSectionBreak}
        />
        {formatHint && <p className="alert editor-format-hint">{formatHint}</p>}
        <PageEditorDebugPanel />
      </div>

      {mediaPickerOpen && (
        <MediaPicker kbId={kbId} onClose={() => setMediaPickerOpen(false)} onInsert={insertBlockFromPicker} />
      )}

      {linkRequest && (
        <LinkDialog
          onClose={() => setLinkRequest(null)}
          onRemove={() => {
            if (linkRequest.anchor) removeLink(linkRequest.anchor);
            setLinkRequest(null);
          }}
          onSubmit={(result) => {
            commitLink({ ...result, anchor: linkRequest.anchor });
            setLinkRequest(null);
          }}
          request={linkRequest}
        />
      )}

      {altRequest && (
        <AltTextDialog
          onClose={() => setAltRequest(null)}
          onSubmit={({ alt, decorative, saveToAsset }) => {
            applyAltText(altRequest.figure, alt, decorative);
            if (saveToAsset && altRequest.assetId) {
              fetch(`/api/admin/assets/${altRequest.assetId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                // Save to the dedicated alt-text field, not the human description (KI-2).
                body: JSON.stringify({ altText: alt }),
              }).catch(() => {});
            }
            setAltRequest(null);
          }}
          request={altRequest}
        />
      )}

      <div className="block-list">
        {sections.map((section, index) => (
          <SectionEditor
            index={index}
            isFirst={index === 0}
            isLast={index === sections.length - 1}
            key={section.type === "flow" ? `flow-${index}` : (section as any).block.blockId}
            kbSlug={kbSlug}
            onMove={moveSection}
            onRemove={() => removeSection(index)}
            onUpdateFlow={(html, isBlur) => updateFlowSection(index, html, isBlur)}
            onUpdateTable={(next) => updateTableSection(index, next)}
            onUpdateCard={(next) => updateCardSection(index, next)}
            onUpdateVideo={(next) => updateVideoSection(index, next)}
            section={section}
          />
        ))}
      </div>

      <div className="page-document-editor__footer">
        <div className="admin-actions">
          <button className="button button--ghost button--small" onClick={addTable} type="button">
            Add table
          </button>
          <button className="button button--ghost button--small" onClick={addCard} type="button">
            Add card section
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionEditor({
  section,
  index,
  isFirst,
  isLast,
  kbSlug,
  onMove,
  onRemove,
  onUpdateFlow,
  onUpdateTable,
  onUpdateCard,
  onUpdateVideo,
}: {
  section: EditorSection;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  kbSlug: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: () => void;
  onUpdateFlow: (html: string, isBlur: boolean) => void;
  onUpdateTable: (block: ContentBlock) => void;
  onUpdateCard: (block: ContentBlock) => void;
  onUpdateVideo: (block: ContentBlock) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const lastSyncedHtml = useRef("");

  useEffect(() => {
    if (section.type === "flow") {
      const html = blocksToDocumentHtml(section.blocks, kbSlug);
      lastSyncedHtml.current = html;
      if (surfaceRef.current && !surfaceRef.current.innerHTML.trim()) {
        surfaceRef.current.innerHTML = html;
      }
    }
  }, [section, kbSlug]);

  const attachSurface = useCallback((node: HTMLDivElement | null) => {
    surfaceRef.current = node;
    if (node) {
      bindPageEditor(node, () => onUpdateFlow(node.innerHTML, false));
      if (!node.innerHTML.trim()) node.innerHTML = lastSyncedHtml.current;
    }
  }, [onUpdateFlow]);

  return (
    <article className="block-editor">
      <div className="block-bar">
        <span className="block-bar__label">{section.type.replace("_", " ")}</span>
        <span className="block-bar__spacer" />
        <div className="block-bar__actions">
          <button
            className="icon-button"
            disabled={isFirst}
            onClick={() => onMove(index, -1)}
            title="Move up"
            type="button"
          >
            ↑
          </button>
          <button
            className="icon-button"
            disabled={isLast}
            onClick={() => onMove(index, 1)}
            title="Move down"
            type="button"
          >
            ↓
          </button>
          <button
            className="icon-button icon-button--danger"
            onClick={onRemove}
            title="Remove section"
            type="button"
          >
            ✕
          </button>
        </div>
      </div>

      {section.type === "flow" && (
        <div
          className="wysiwyg-surface"
          contentEditable
          onBlur={(e) => onUpdateFlow(e.currentTarget.innerHTML, true)}
          onClick={handleImageControlClick}
          onInput={(e) => onUpdateFlow(e.currentTarget.innerHTML, false)}
          onKeyDown={handleEditorTabKey}
          onKeyUp={() => saveEditorSelection()}
          onMouseUp={() => saveEditorSelection()}
          ref={attachSurface}
          suppressContentEditableWarning
        />
      )}

      {section.type === "table" && (
        <TableBlockEditor block={section.block} onChange={onUpdateTable} />
      )}

      {section.type === "asset_link" && (
        <p className="meta">
          File link (<code>{section.block.assetId}</code>). Manage via asset library.
        </p>
      )}

      {section.type === "video" && (
        <div className="video-editor form">
          <div className="field-row">
            <label>
              <span className="meta">Provider</span>
              <select
                className="input"
                onChange={(e) => onUpdateVideo({ ...section.block, provider: e.target.value as any })}
                value={section.block.provider}
              >
                <option value="youtube">YouTube</option>
                <option value="vimeo">Vimeo</option>
                <option value="direct">Direct URL</option>
              </select>
            </label>
            <label>
              <span className="meta">Title</span>
              <input
                className="input"
                onChange={(e) => onUpdateVideo({ ...section.block, title: e.target.value })}
                value={section.block.title || ""}
              />
            </label>
          </div>
          <label>
            <span className="meta">Embed ID or URL</span>
            <input
              className="input"
              onChange={(e) => {
                const val = e.target.value;
                if (section.block.provider === "direct") {
                  onUpdateVideo({ ...section.block, url: val });
                } else {
                  onUpdateVideo({ ...section.block, embedId: val });
                }
              }}
              placeholder={section.block.provider === "direct" ? "https://..." : "e.g. dQw4w9WgXcQ"}
              value={section.block.provider === "direct" ? section.block.url : section.block.embedId}
            />
          </label>
        </div>
      )}

      {section.type === "card" && (
        <div className="card-editor">
          <div className="field-row" style={{ marginBottom: "1rem" }}>
            <label>
              <span className="meta">Card Title</span>
              <input
                className="input"
                onChange={(e) => onUpdateCard({ ...section.block, title: e.target.value })}
                value={section.block.title || ""}
              />
            </label>
            <label>
              <span className="meta">Background</span>
              <select
                className="input"
                onChange={(e) => onUpdateCard({ ...section.block, background: e.target.value as any })}
                value={section.block.background}
              >
                <option value="paper">Paper (White)</option>
                <option value="wash">Wash (Light gray)</option>
                <option value="crimson">Crimson Tint</option>
              </select>
            </label>
          </div>
          <p className="meta">Card content uses continuous rich text.</p>
          <div
            className={`wysiwyg-surface card--bg-${section.block.background}`}
            contentEditable
            onBlur={(e) => {
              const clean = sanitizePageDocument(e.currentTarget.innerHTML);
              onUpdateCard({ ...section.block, blocks: documentHtmlToBlocks(clean) });
            }}
            onClick={handleImageControlClick}
            onInput={(e) => {
              const clean = sanitizePageDocument(e.currentTarget.innerHTML);
              onUpdateCard({ ...section.block, blocks: documentHtmlToBlocks(clean) });
            }}
            onKeyDown={handleEditorTabKey}
            onKeyUp={() => saveEditorSelection()}
            onMouseUp={() => saveEditorSelection()}
            ref={(node) => {
              if (node && !node.innerHTML.trim()) {
                node.innerHTML = blocksToDocumentHtml(section.block.blocks, kbSlug);
              }
            }}
            suppressContentEditableWarning
          />
        </div>
      )}

      {section.type === "section_divider" && <hr className="content-section-break" />}
    </article>
  );
}
