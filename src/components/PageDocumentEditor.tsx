"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { AltTextDialog } from "@/components/AltTextDialog";
import { ExcerptPickerDialog } from "@/components/ExcerptPickerDialog";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import { ExcerptSectionEditor } from "@/components/ExcerptSectionEditor";
import { SourcedSectionEditor } from "@/components/SourcedSectionEditor";
import { LinkDialog } from "@/components/LinkDialog";
import { NoteDialog } from "@/components/NoteDialog";
import { EditorNotesRail } from "@/components/EditorNotesRail";
import { MediaPicker } from "@/components/MediaPicker";
import type { MediaPickerInsert } from "@/components/MediaPicker";
import { PageEditorDebugPanel } from "@/components/PageEditorDebugPanel";
import { TableBlockEditor } from "@/components/TableBlockEditor";
import { LexicalFlowSurface } from "@/components/LexicalFlowSurface";
import {
  blocksToSections,
  normalizeEditorSections,
  sectionsToBlocks,
  type EditorSection,
} from "@/lib/page-editor-list";
import {
  blocksToDocumentHtml,
  blocksToSourceHtml,
  dedupeContentBlockIds,
  documentHtmlToBlocks,
  sanitizePageDocument,
} from "@/lib/page-document";
import {
  analyzeDocumentQuality,
  cleanDocumentLayout,
  type DocumentQualityIssue,
} from "@/lib/page-document-quality";
import {
  applyAltText,
  applyEditorCommand,
  commitLink,
  commitNote,
  getEditorInsertionContext,
  insertEditorBlockHtml,
  openImageAltEditor,
  openNoteEditor,
  registerAltEditor,
  registerFormatIssueReporter,
  registerLinkEditor,
  registerNoteEditor,
  releaseLinkDraft,
  removeLink,
  removeNote,
  watchEditorSelectionForDebug,
  type AltEditRequest,
  type LinkEditRequest,
  type NoteEditRequest,
} from "@/lib/page-editor-format";
import { textToRichText } from "@/lib/rich-text";
import type { EditorPalette } from "@/lib/kb-theme";
import type { ContentBlock } from "@/lib/types";

function newBlockId() {
  return `block-${crypto.randomUUID()}`;
}

type ImageBlock = Extract<ContentBlock, { type: "image" }>;

function isBlankParagraphBlock(block: ContentBlock): boolean {
  if (block.type !== "paragraph" || block.text.trim()) {
    return false;
  }
  const html = block.html ?? "";
  return !html || html.replace(/<br\s*\/?>/gi, "").replace(/&nbsp;|\u00a0/g, "").trim() === "";
}

function flowBlocksFromEditorHtml(html: string): ContentBlock[] {
  const blocks = documentHtmlToBlocks(html);
  return blocks.length === 1 && isBlankParagraphBlock(blocks[0]) ? [] : blocks;
}

function imageBlockFromFigure(figure: HTMLElement, fallback: ImageBlock): ImageBlock {
  const block = documentHtmlToBlocks(figure.outerHTML).find((candidate): candidate is ImageBlock => {
    return candidate.type === "image";
  });
  return block ?? fallback;
}

function isEmptyFlowSection(section: EditorSection): boolean {
  return section.type === "flow" && section.blocks.length === 0;
}

function moveTargetIndex(sections: EditorSection[], index: number, direction: -1 | 1): number {
  let target = index + direction;
  while (target >= 0 && target < sections.length && isEmptyFlowSection(sections[target])) {
    target += direction;
  }
  return target >= 0 && target < sections.length ? target : -1;
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
  const initialSections = blocksToSections(cleanDocumentLayout(dedupeContentBlockIds(blocks)));
  // Always present at least one editable flow surface — otherwise an empty
  // document (e.g. fresh Home Page Rich Content) renders just the toolbar with
  // nowhere to type.
  const [sections, setSections] = useState<EditorSection[]>(
    initialSections.length > 0 ? initialSections : [{ type: "flow", blocks: [] }],
  );
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerSelection, setMediaPickerSelection] = useState({
    hasInsertionPoint: false,
    hasTextSelection: false,
  });
  const [linkRequest, setLinkRequest] = useState<LinkEditRequest | null>(null);
  const [noteRequest, setNoteRequest] = useState<NoteEditRequest | null>(null);
  const [altRequest, setAltRequest] = useState<AltEditRequest | null>(null);
  const [formatHint, setFormatHint] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "html">("visual");
  const [htmlDraft, setHtmlDraft] = useState("");
  const [visualEpoch, setVisualEpoch] = useState(0);
  const [excerptPickerOpen, setExcerptPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emitChange = useCallback((nextSections: EditorSection[]) => {
    const normalizedBlocks = cleanDocumentLayout(
      dedupeContentBlockIds(sectionsToBlocks(normalizeEditorSections(nextSections))),
    );
    const normalizedSections = blocksToSections(normalizedBlocks);
    setSections(normalizedSections.length > 0 ? normalizedSections : [{ type: "flow", blocks: [] }]);
    onChangeRef.current(normalizedBlocks);
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
    setVisualEpoch((value) => value + 1);
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

  function openMediaPicker() {
    setMediaPickerSelection(getEditorInsertionContext());
    setMediaPickerOpen(true);
  }

  function insertBlockFromPicker(payload: MediaPickerInsert) {
    const block = payload.block;
    if (block.type === "image") {
      const html = blocksToDocumentHtml([block], kbSlug);
      if (!insertEditorBlockHtml(html)) {
        emitChange([...sections, { type: "image", block }]);
      }
    } else if (block.type === "video") {
      emitChange([...sections, { type: "video", block }]);
    } else {
      addBlockToFirstFlow(block);
    }
    setMediaPickerOpen(false);
  }

  function insertAssetLinkBlock(assetId: string, label: string) {
    emitChange([
      ...sections,
      {
        type: "asset_link",
        block: {
          blockId: newBlockId(),
          type: "asset_link",
          assetId,
          label,
        },
      },
    ]);
  }

  function addBlockToFirstFlow(block: ContentBlock) {
    if (block.type === "image") {
      emitChange([...sections, { type: "image", block }]);
      return;
    }
    if (block.type === "section_divider") {
      emitChange([...sections, { type: "section_divider", block }]);
      return;
    }
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
    const html = `<aside class="doc-alert doc-alert--info" data-block-id="${newBlockId()}" data-variant="info" role="note"><p>${textToRichText(placeholder)}</p></aside>`;
    if (!insertEditorBlockHtml(html)) {
      addBlockToFirstFlow({ type: "alert", blockId: newBlockId(), variant: "info", text: placeholder });
    }
  }

  function handleInsertSectionBreak() {
    const block: Extract<ContentBlock, { type: "section_divider" }> = {
      type: "section_divider",
      blockId: newBlockId(),
    };
    const html = blocksToDocumentHtml([block], kbSlug);
    if (!insertEditorBlockHtml(html)) {
      emitChange([...sections, { type: "section_divider", block }]);
    }
  }

  function moveSection(index: number, direction: -1 | 1) {
    const next = [...sections];
    const target = moveTargetIndex(next, index, direction);
    if (target < 0) return;
    markEditorAction();
    [next[index], next[target]] = [next[target], next[index]];
    setVisualEpoch((value) => value + 1);
    emitChange(next);
  }

  function removeSection(index: number) {
    markEditorAction();
    const next = sections.filter((_, i) => i !== index);
    setVisualEpoch((value) => value + 1);
    emitChange(next);
  }

  function updateFlowSection(index: number, html: string, _isBlur: boolean) {
    const clean = sanitizePageDocument(html);
    const flowBlocks = flowBlocksFromEditorHtml(clean);
    const next = [...sections];
    const replacement = blocksToSections(flowBlocks);
    next.splice(index, 1, ...(replacement.length > 0 ? replacement : [{ type: "flow" as const, blocks: [] }]));
    emitChange(next);
  }

  function updateImageSection(index: number, block: ContentBlock) {
    if (block.type !== "image") return;
    markEditorAction();
    const next = [...sections];
    next[index] = { type: "image", block };
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

  function addExcerpt() {
    setExcerptPickerOpen(true);
  }

  function insertExcerptFromPicker(sourcePageId: string) {
    const next = [
      ...sections,
      {
        type: "excerpt" as const,
        block: {
          blockId: newBlockId(),
          type: "excerpt" as const,
          sourcePageId,
        },
      },
    ];
    emitChange(next);
    setExcerptPickerOpen(false);
  }

  function updateExcerptSection(index: number, block: ContentBlock) {
    if (block.type !== "excerpt") return;
    const next = [...sections];
    next[index] = { type: "excerpt", block };
    emitChange(next);
  }

  function addSourced() {
    const next = [
      ...sections,
      {
        type: "sourced" as const,
        block: {
          blockId: newBlockId(),
          type: "sourced" as const,
          sourceUrl: "",
          blocks: [],
        },
      },
    ];
    emitChange(next);
  }

  function updateSourcedSection(index: number, block: ContentBlock) {
    if (block.type !== "sourced") return;
    const next = [...sections];
    next[index] = { type: "sourced", block };
    emitChange(next);
  }

  const currentBlocksForQuality = useMemo(
    () => (viewMode === "html" ? documentHtmlToBlocks(htmlDraft) : sectionsToBlocks(sections)),
    [htmlDraft, sections, viewMode],
  );
  const qualityIssues = useMemo(
    () => analyzeDocumentQuality(currentBlocksForQuality),
    [currentBlocksForQuality],
  );
  const safeCleanupCount = qualityIssues.filter((item) => item.fixable).length;

  function markEditorAction() {
    rootRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applySafeLayoutCleanup() {
    const cleaned = cleanDocumentLayout(currentBlocksForQuality);
    markEditorAction();
    if (viewMode === "html") {
      setHtmlDraft(blocksToSourceHtml(cleaned, kbSlug));
      onChangeRef.current(cleaned);
      return;
    }
    setVisualEpoch((value) => value + 1);
    emitChange(blocksToSections(cleaned));
  }

  return (
    <div className="page-document-editor" ref={rootRef}>
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
            onInsertMedia={openMediaPicker}
            onAddNote={() => openNoteEditor()}
            onAddTable={addTable}
            onAddCard={addCard}
            onAddProcedureSection={addProcedureSection}
            onAddExcerpt={addExcerpt}
            onAddSourced={addSourced}
            onInsertSectionBreak={handleInsertSectionBreak}
            pageUrl={pageUrl}
          />
        )}
        {formatHint && <p className="alert editor-format-hint">{formatHint}</p>}
        <EditorLayoutSuggestions
          issues={qualityIssues}
          onApplySafeCleanup={applySafeLayoutCleanup}
          safeCleanupCount={safeCleanupCount}
        />
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
        <MediaPicker
          hasTextSelection={mediaPickerSelection.hasTextSelection}
          kbId={kbId}
          kbSlug={kbSlug}
          onClose={() => setMediaPickerOpen(false)}
          onInsert={insertBlockFromPicker}
        />
      )}

      {excerptPickerOpen && (
        <ExcerptPickerDialog
          kbId={kbId}
          onClose={() => setExcerptPickerOpen(false)}
          onSelect={(sourcePageId) => insertExcerptFromPicker(sourcePageId)}
        />
      )}

      {linkRequest && (
        <LinkDialog
          hasTextSelection={Boolean(linkRequest.hasTextSelection || linkRequest.isEdit)}
          kbId={kbId}
          kbSlug={kbSlug}
          onClose={() => {
            releaseLinkDraft(linkRequest.marker);
            setLinkRequest(null);
          }}
          onRemove={() => {
            if (linkRequest.anchor) removeLink(linkRequest.anchor);
            else applyEditorCommand("unlink");
            releaseLinkDraft(linkRequest.marker);
            setLinkRequest(null);
          }}
          onSubmit={(result) => {
            if (result.mode === "file-block") {
              releaseLinkDraft(linkRequest.marker);
              insertAssetLinkBlock(result.assetId, result.label);
              setLinkRequest(null);
              return;
            }
            commitLink({
              url: result.url,
              text: result.text,
              newTab: result.newTab,
              assetId: result.assetId,
              anchor: linkRequest.anchor,
              marker: linkRequest.marker,
            });
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
            altRequest.onApply?.();
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

      <div className="editor-canvas">
        <div className="block-list">
          {sections.map((section, index) => (
            <SectionEditor
              index={index}
              isFirst={moveTargetIndex(sections, index, -1) < 0}
              isLast={moveTargetIndex(sections, index, 1) < 0}
              kbId={kbId}
              key={
                section.type === "flow"
                  ? `flow-${index}-${visualEpoch}`
                  : `${section.block.blockId}-${visualEpoch}`
              }
              kbSlug={kbSlug}
              onMove={moveSection}
              onRemove={() => removeSection(index)}
              onUpdateFlow={(html, isBlur) => updateFlowSection(index, html, isBlur)}
              onUpdateImage={(next) => updateImageSection(index, next)}
              onUpdateTable={(next) => updateTableSection(index, next)}
              onUpdateCard={(next) => updateCardSection(index, next)}
              onUpdateProcedureSection={(next) => updateProcedureSection(index, next)}
              onUpdateVideo={(next) => updateVideoSection(index, next)}
              onUpdateExcerpt={(next) => updateExcerptSection(index, next)}
              onUpdateSourced={(next) => updateSourcedSection(index, next)}
              section={section}
            />
          ))}
        </div>
        <EditorNotesRail />
      </div>
        </>
      )}
    </div>
  );
}

function EditorLayoutSuggestions({
  issues,
  onApplySafeCleanup,
  safeCleanupCount,
}: {
  issues: DocumentQualityIssue[];
  onApplySafeCleanup: () => void;
  safeCleanupCount: number;
}) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <div className="editor-layout-suggestions">
      <div className="editor-layout-suggestions__header">
        <strong>Layout suggestions</strong>
        {safeCleanupCount > 0 ? (
          <button className="button button--small button--ghost" onClick={onApplySafeCleanup} type="button">
            Clean spacing
          </button>
        ) : null}
      </div>
      <ul className="issue-list">
        {issues.map((item) => (
          <li key={item.id}>{item.message}</li>
        ))}
      </ul>
    </div>
  );
}

const IMAGE_WIDTH_STEP = 25;
const IMAGE_MIN_WIDTH = 25;
const IMAGE_MAX_WIDTH = 100;

function clampImageWidth(value: number | undefined): number {
  const width = Number.isFinite(value as number) ? Math.round(value as number) : IMAGE_MAX_WIDTH;
  return Math.min(IMAGE_MAX_WIDTH, Math.max(IMAGE_MIN_WIDTH, width));
}

function ImageSectionEditor({
  block,
  index,
  kbSlug,
  onChange,
  onMove,
}: {
  block: ImageBlock;
  index: number;
  kbSlug: string;
  onChange: (block: ContentBlock) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  function selectFigure(figure: HTMLElement) {
    rootRef.current?.querySelectorAll("figure.doc-image.is-selected").forEach((element) => {
      if (element !== figure) element.classList.remove("is-selected");
    });
    figure.classList.add("is-selected");
  }

  function handleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    const figure = target?.closest("figure.doc-image") as HTMLElement | null;
    if (!figure || !rootRef.current?.contains(figure)) {
      return;
    }

    selectFigure(figure);

    const button = target?.closest("[data-img-action]") as HTMLElement | null;
    if (!button || !figure.contains(button)) {
      return;
    }

    event.preventDefault();
    const action = button.getAttribute("data-img-action");
    if (action === "alt") {
      openImageAltEditor(figure, () => onChange(imageBlockFromFigure(figure, block)));
      return;
    }
    if (action === "move-up" || action === "move-down") {
      onMove(index, action === "move-up" ? -1 : 1);
      return;
    }

    const next: ImageBlock = { ...block };
    const currentWidth = clampImageWidth(next.widthPercent ?? Number(figure.getAttribute("data-width")));
    switch (action) {
      case "align-left":
      case "align-center":
      case "align-right":
        next.align = action.replace("align-", "") as ImageBlock["align"];
        break;
      case "width-down":
        next.widthPercent = Math.max(IMAGE_MIN_WIDTH, currentWidth - IMAGE_WIDTH_STEP);
        break;
      case "width-up":
        next.widthPercent = Math.min(IMAGE_MAX_WIDTH, currentWidth + IMAGE_WIDTH_STEP);
        break;
      default:
        return;
    }
    onChange(next);
  }

  return (
    <div
      className="image-section-editor"
      dangerouslySetInnerHTML={{ __html: blocksToDocumentHtml([block], kbSlug) }}
      onClick={handleClick}
      ref={rootRef}
    />
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
  onUpdateImage,
  onUpdateTable,
  onUpdateCard,
  onUpdateProcedureSection,
  onUpdateVideo,
  onUpdateExcerpt,
  onUpdateSourced,
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
  onUpdateImage: (block: ContentBlock) => void;
  onUpdateTable: (block: ContentBlock) => void;
  onUpdateCard: (block: ContentBlock) => void;
  onUpdateProcedureSection: (block: ContentBlock) => void;
  onUpdateVideo: (block: ContentBlock) => void;
  onUpdateExcerpt: (block: ContentBlock) => void;
  onUpdateSourced: (block: ContentBlock) => void;
}) {
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
        <LexicalFlowSurface
          initialHtml={blocksToDocumentHtml(section.blocks, kbSlug)}
          kbId={kbId}
          onHtmlChange={onUpdateFlow}
        />
      )}

      {section.type === "image" && (
        <ImageSectionEditor
          block={section.block}
          index={index}
          kbSlug={kbSlug}
          onChange={onUpdateImage}
          onMove={onMove}
        />
      )}

      {section.type === "table" && (
        <TableBlockEditor block={section.block} kbId={kbId} onChange={onUpdateTable} />
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
          <div className="procedure-section-editor__surface-wrap">
            <LexicalFlowSurface
              initialHtml={blocksToDocumentHtml(section.block.blocks, kbSlug)}
              kbId={kbId}
              onHtmlChange={(html) => {
                const clean = sanitizePageDocument(html);
                onUpdateProcedureSection({ ...section.block, blocks: documentHtmlToBlocks(clean) });
              }}
            />
          </div>
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
              <span className="meta">Title level</span>
              <select
                className="input"
                onChange={(e) =>
                  onUpdateCard({
                    ...section.block,
                    titleLevel: e.target.value === "3" ? 3 : 2,
                  })
                }
                value={section.block.titleLevel === 3 ? "3" : "2"}
              >
                <option value="2">H2</option>
                <option value="3">H3</option>
              </select>
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
          <div className={`card--bg-${section.block.background}`}>
            <LexicalFlowSurface
              initialHtml={blocksToDocumentHtml(section.block.blocks, kbSlug)}
              kbId={kbId}
              onHtmlChange={(html) => {
                const clean = sanitizePageDocument(html);
                onUpdateCard({ ...section.block, blocks: documentHtmlToBlocks(clean) });
              }}
            />
          </div>
        </div>
      )}

      {section.type === "excerpt" && (
        <ExcerptSectionEditor block={section.block} onChange={onUpdateExcerpt} />
      )}

      {section.type === "sourced" && (
        <SourcedSectionEditor block={section.block} onChange={onUpdateSourced} />
      )}

      {section.type === "section_divider" && <hr className="content-section-break" />}
    </article>
  );
}
