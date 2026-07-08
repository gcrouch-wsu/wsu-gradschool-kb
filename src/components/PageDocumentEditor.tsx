"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AltTextDialog } from "@/components/AltTextDialog";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import { LinkDialog } from "@/components/LinkDialog";
import { NoteDialog } from "@/components/NoteDialog";
import { MediaPicker } from "@/components/MediaPicker";
import { PageEditorDebugPanel } from "@/components/PageEditorDebugPanel";
import { TableBlockEditor } from "@/components/TableBlockEditor";
import { blocksToSections, sectionsToBlocks, type EditorSection } from "@/lib/page-editor-list";
import {
  blocksToDocumentHtml,
  blocksToSourceHtml,
  documentHtmlToBlocks,
  sanitizePageDocument,
} from "@/lib/page-document";
import {
  applyAltText,
  bindPageEditor,
  commitLink,
  commitNote,
  handleEditorDrop,
  handleEditorKeyDown,
  handleEditorPaste,
  handleImageControlClick,
  insertEditorHtml,
  openNoteEditor,
  registerAltEditor,
  registerFormatIssueReporter,
  registerLinkEditor,
  registerNoteEditor,
  releaseLinkDraft,
  removeLink,
  removeNote,
  saveEditorSelection,
  watchEditorSelectionForDebug,
  type AltEditRequest,
  type LinkEditRequest,
  type NoteEditRequest,
} from "@/lib/page-editor-format";
import { noteEditorInput } from "@/lib/page-editor-undo";
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
  pageUrl,
}: {
  blocks: ContentBlock[];
  editorPalette?: EditorPalette;
  kbId: string;
  kbSlug: string;
  onChange: (blocks: ContentBlock[]) => void;
  pageUrl?: string;
}) {
  const initialSections = blocksToSections(blocks);
  // Always present at least one editable flow surface — otherwise an empty
  // document (e.g. fresh Home Page Rich Content) renders just the toolbar with
  // nowhere to type.
  const [sections, setSections] = useState<EditorSection[]>(
    initialSections.length > 0 ? initialSections : [{ type: "flow", blocks: [] }],
  );
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [linkRequest, setLinkRequest] = useState<LinkEditRequest | null>(null);
  const [noteRequest, setNoteRequest] = useState<NoteEditRequest | null>(null);
  const [altRequest, setAltRequest] = useState<AltEditRequest | null>(null);
  const [formatHint, setFormatHint] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "html">("visual");
  const [htmlDraft, setHtmlDraft] = useState("");

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emitChange = useCallback((nextSections: EditorSection[]) => {
    setSections(nextSections);
    onChangeRef.current(sectionsToBlocks(nextSections));
  }, []);

  function switchToHtml() {
    if (viewMode === "html") return;
    setHtmlDraft(blocksToSourceHtml(sectionsToBlocks(sections), kbSlug));
    setViewMode("html");
  }

  function switchToVisual() {
    if (viewMode === "visual") return;
    const nextBlocks = documentHtmlToBlocks(htmlDraft);
    emitChange(blocksToSections(nextBlocks));
    setViewMode("visual");
  }

  function updateHtmlDraft(value: string) {
    setHtmlDraft(value);
    onChangeRef.current(documentHtmlToBlocks(value));
  }

  useEffect(() => {
    registerFormatIssueReporter(setFormatHint);
    registerLinkEditor(setLinkRequest);
    registerNoteEditor(setNoteRequest);
    registerAltEditor(setAltRequest);
    const unwatchSelection = watchEditorSelectionForDebug();
    return () => {
      registerFormatIssueReporter(() => {});
      registerLinkEditor(null);
      registerNoteEditor(null);
      registerAltEditor(null);
      unwatchSelection();
    };
  }, []);

  function insertBlockFromPicker(block: ContentBlock) {
    if (block.type === "image") {

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
    const existing = flowIndex >= 0 ? next[flowIndex] : null;
    if (existing && existing.type === "flow") {
      existing.blocks.push(block);
    } else {
      next.unshift({ type: "flow", blocks: [block] });
    }
    emitChange(next);
  }

  function handleInsertInfoBox() {
    const placeholder = "Replace with the message readers should see.";
    const html = `<aside class="doc-alert doc-alert--info" data-block-id="${newBlockId()}" data-variant="info" role="note">${textToRichText(placeholder)}</aside>`;
    if (!insertEditorHtml(html)) {
      addBlockToFirstFlow({ type: "alert", blockId: newBlockId(), variant: "info", text: placeholder });
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

  function updateFlowSection(index: number, html: string, _isBlur: boolean) {
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

  function addProcedureSection() {
    const next = [
      ...sections,
      {
        type: "procedure_section" as const,
        block: {
          blockId: newBlockId(),
          type: "procedure_section" as const,
          title: "Step title",
          level: 2 as const,
          blocks: [{ blockId: newBlockId(), type: "paragraph" as const, text: "Procedure details..." }],
        },
      },
    ];
    emitChange(next);
  }

  function updateProcedureSection(index: number, block: ContentBlock) {
    if (block.type !== "procedure_section") return;
    const next = [...sections];
    next[index] = { type: "procedure_section", block };
    emitChange(next);
  }

  return (
    <div className="page-document-editor">
      <div className="editor-toolbar-sticky">
        <div className="seg editor-mode-toggle" role="group" aria-label="Editor mode">
          <button
            aria-pressed={viewMode === "visual"}
            className="seg__btn"
            onClick={switchToVisual}
            type="button"
          >
            Visual
          </button>
          <button
            aria-pressed={viewMode === "html"}
            className="seg__btn"
            onClick={switchToHtml}
            title="Edit the document HTML"
            type="button"
          >
            {"</> HTML"}
          </button>
        </div>
        {viewMode === "visual" && (
          <DocumentToolbar
            editorPalette={editorPalette}
            onInsertInfoBox={handleInsertInfoBox}
            onInsertMedia={() => setMediaPickerOpen(true)}
            onAddNote={() => openNoteEditor()}
            onAddTable={addTable}
            onAddCard={addCard}
            onAddProcedureSection={addProcedureSection}
            onInsertSectionBreak={handleInsertSectionBreak}
            pageUrl={pageUrl}
          />
        )}
        {formatHint && <p className="alert editor-format-hint">{formatHint}</p>}
        <PageEditorDebugPanel />
      </div>

      {viewMode === "html" ? (
        <div className="html-source">
          <textarea
            aria-label="Document HTML source"
            className="html-source__area"
            onChange={(e) => updateHtmlDraft(e.target.value)}
            spellCheck={false}
            value={htmlDraft}
          />
          <p className="meta">
            Edit the document HTML directly. Switching back to Visual re-parses and sanitizes it —
            unsupported tags and attributes (scripts, styles, iframes, event handlers) are removed.
          </p>
        </div>
      ) : (
        <>
      {mediaPickerOpen && (
        <MediaPicker kbId={kbId} onClose={() => setMediaPickerOpen(false)} onInsert={insertBlockFromPicker} />
      )}

      {linkRequest && (
        <LinkDialog
          onClose={() => {
            releaseLinkDraft(linkRequest.marker);
            setLinkRequest(null);
          }}
          onRemove={() => {
            if (linkRequest.anchor) removeLink(linkRequest.anchor);
            releaseLinkDraft(linkRequest.marker);
            setLinkRequest(null);
          }}
          onSubmit={(result) => {
            commitLink({ ...result, anchor: linkRequest.anchor, marker: linkRequest.marker });
            setLinkRequest(null);
          }}
          request={linkRequest}
        />
      )}

      {noteRequest && (
        <NoteDialog
          onClose={() => setNoteRequest(null)}
          onRemove={() => {
            if (noteRequest.span) removeNote(noteRequest.span);
            setNoteRequest(null);
          }}
          onSubmit={({ body }) => {
            commitNote({ body, span: noteRequest.span });
            setNoteRequest(null);
          }}
          request={noteRequest}
        />
      )}

      {altRequest && (
        <AltTextDialog
          onClose={() => setAltRequest(null)}
          onSubmit={({ alt, caption, decorative, saveToAsset }) => {
            applyAltText(altRequest.figure, alt, decorative, caption);
            if (saveToAsset && altRequest.assetId) {
              fetch(`/api/admin/assets/${altRequest.assetId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },

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
            kbId={kbId}
            key={section.type === "flow" ? `flow-${index}` : section.block.blockId}
            kbSlug={kbSlug}
            onMove={moveSection}
            onRemove={() => removeSection(index)}
            onUpdateFlow={(html, isBlur) => updateFlowSection(index, html, isBlur)}
            onUpdateTable={(next) => updateTableSection(index, next)}
            onUpdateCard={(next) => updateCardSection(index, next)}
            onUpdateProcedureSection={(next) => updateProcedureSection(index, next)}
            onUpdateVideo={(next) => updateVideoSection(index, next)}
            section={section}
          />
        ))}
      </div>
        </>
      )}
    </div>
  );
}

function SectionEditor({
  section,
  index,
  isFirst,
  isLast,
  kbId,
  kbSlug,
  onMove,
  onRemove,
  onUpdateFlow,
  onUpdateTable,
  onUpdateCard,
  onUpdateProcedureSection,
  onUpdateVideo,
}: {
  section: EditorSection;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  kbId: string;
  kbSlug: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: () => void;
  onUpdateFlow: (html: string, isBlur: boolean) => void;
  onUpdateTable: (block: ContentBlock) => void;
  onUpdateCard: (block: ContentBlock) => void;
  onUpdateProcedureSection: (block: ContentBlock) => void;
  onUpdateVideo: (block: ContentBlock) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const lastSyncedHtml = useRef("");

  const onUpdateFlowRef = useRef(onUpdateFlow);
  useEffect(() => {
    onUpdateFlowRef.current = onUpdateFlow;
  }, [onUpdateFlow]);

  useEffect(() => {
    if (section.type === "flow") {
      const html = blocksToDocumentHtml(section.blocks, kbSlug);
      lastSyncedHtml.current = html;
      if (surfaceRef.current && !surfaceRef.current.innerHTML.trim()) {
        surfaceRef.current.innerHTML = html;
      }
    }
  }, [section, kbSlug]);

  const bindThisSurface = useCallback(() => {
    const node = surfaceRef.current;
    if (node) {
      bindPageEditor(node, () => onUpdateFlowRef.current(node.innerHTML, false));
    }
  }, []);

  const attachSurface = useCallback((node: HTMLDivElement | null) => {
    surfaceRef.current = node;
    if (node) {
      bindPageEditor(node, () => onUpdateFlowRef.current(node.innerHTML, false));
      if (!node.innerHTML.trim()) node.innerHTML = lastSyncedHtml.current;
    }
  }, []);

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
          onDragOver={(e) => {
            if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => handleEditorDrop(e, kbId)}
          onFocus={bindThisSurface}
          onInput={(e) => {
            noteEditorInput(e.nativeEvent as InputEvent);
            onUpdateFlow(e.currentTarget.innerHTML, false);
          }}
          onKeyDown={handleEditorKeyDown}
          onKeyUp={() => saveEditorSelection()}
          onMouseUp={() => saveEditorSelection()}
          onPaste={(e) => handleEditorPaste(e, kbId)}
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
                onChange={(e) =>
                  onUpdateVideo({
                    ...section.block,
                    provider: e.target.value as Extract<ContentBlock, { type: "video" }>["provider"],
                  })
                }
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

      {section.type === "procedure_section" && (
        <div className="procedure-section-editor">
          <div className="field-row" style={{ marginBottom: "1rem" }}>
            <label>
              <span className="meta">Procedure section title</span>
              <input
                className="input"
                onChange={(e) => onUpdateProcedureSection({ ...section.block, title: e.target.value })}
                value={section.block.title}
              />
            </label>
            <label>
              <span className="meta">Heading level</span>
              <select
                className="input"
                onChange={(e) => onUpdateProcedureSection({ ...section.block, level: Number(e.target.value) === 3 ? 3 : 2 })}
                value={section.block.level}
              >
                <option value={2}>H2 major section</option>
                <option value={3}>H3 subsection</option>
              </select>
            </label>
          </div>
          <div
            className="wysiwyg-surface procedure-section-editor__surface"
            contentEditable
            onBlur={(e) => {
              const clean = sanitizePageDocument(e.currentTarget.innerHTML);
              onUpdateProcedureSection({ ...section.block, blocks: documentHtmlToBlocks(clean) });
            }}
            onClick={handleImageControlClick}
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => handleEditorDrop(e, kbId)}
            onFocus={(e) => {
              const target = e.currentTarget;
              bindPageEditor(target, () => {
                const clean = sanitizePageDocument(target.innerHTML);
                onUpdateProcedureSection({ ...section.block, blocks: documentHtmlToBlocks(clean) });
              });
            }}
            onInput={(e) => {
              noteEditorInput(e.nativeEvent as InputEvent);
              const clean = sanitizePageDocument(e.currentTarget.innerHTML);
              onUpdateProcedureSection({ ...section.block, blocks: documentHtmlToBlocks(clean) });
            }}
            onKeyDown={handleEditorKeyDown}
            onPaste={(e) => handleEditorPaste(e, kbId)}
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
                onChange={(e) =>
                  onUpdateCard({
                    ...section.block,
                    background: e.target.value as Extract<ContentBlock, { type: "card" }>["background"],
                  })
                }
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
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => handleEditorDrop(e, kbId)}
            onFocus={(e) => {
              const target = e.currentTarget;
              bindPageEditor(target, () => {
                const clean = sanitizePageDocument(target.innerHTML);
                onUpdateCard({ ...section.block, blocks: documentHtmlToBlocks(clean) });
              });
            }}
            onInput={(e) => {
              noteEditorInput(e.nativeEvent as InputEvent);
              const clean = sanitizePageDocument(e.currentTarget.innerHTML);
              onUpdateCard({ ...section.block, blocks: documentHtmlToBlocks(clean) });
            }}
            onKeyDown={handleEditorKeyDown}
            onPaste={(e) => handleEditorPaste(e, kbId)}
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
