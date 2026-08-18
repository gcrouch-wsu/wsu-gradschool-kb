"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Type } from "lucide-react";
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
  stampFlowClientKeys,
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
  uploadImageBlockFromFile,
  imageFilesFromTransfer,
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
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null);
  const [mediaInsertIndex, setMediaInsertIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef(sections);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const setEditorSections = useCallback((nextSections: EditorSection[]) => {
    sectionsRef.current = nextSections;
    setSections(nextSections);
  }, []);

  const emitChange = useCallback((nextSections: EditorSection[]) => {
    const normalizedBlocks = cleanDocumentLayout(
      dedupeContentBlockIds(sectionsToBlocks(normalizeEditorSections(nextSections))),
    );
    const normalizedSections = blocksToSections(normalizedBlocks);
    setEditorSections(normalizedSections.length > 0 ? normalizedSections : [{ type: "flow", blocks: [] }]);
    onChangeRef.current(normalizedBlocks);
  }, [setEditorSections]);

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

  function clampInsertIndex(index: number) {
    return Math.max(0, Math.min(index, sectionsRef.current.length));
  }

  function scrollableAncestors(start: HTMLElement | null): HTMLElement[] {
    const found: HTMLElement[] = [];
    let current: HTMLElement | null = start;
    while (current) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const canScroll =
        /(auto|scroll|overlay)/.test(overflowY) ||
        /(auto|scroll|overlay)/.test(overflowX) ||
        current === document.documentElement ||
        current === document.body;
      if (canScroll) {
        found.push(current);
      }
      current = current.parentElement;
    }
    const scrolling = document.scrollingElement;
    if (scrolling instanceof HTMLElement && !found.includes(scrolling)) {
      found.push(scrolling);
    }
    return found;
  }

  function captureScrollSnapshot() {
    const elements = scrollableAncestors(rootRef.current).map((element) => ({
      element,
      x: element.scrollLeft,
      y: element.scrollTop,
    }));
    return { elements, x: window.scrollX, y: window.scrollY };
  }

  function restoreViewport(scroll: ReturnType<typeof captureScrollSnapshot>) {
    const apply = () => {
      window.scrollTo(scroll.x, scroll.y);
      for (const item of scroll.elements) {
        if (document.contains(item.element)) {
          item.element.scrollTo(item.x, item.y);
        }
      }
    };
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }

  function withViewportPreserved(run: () => void) {
    const scroll = captureScrollSnapshot();
    run();
    restoreViewport(scroll);
  }

  function focusSectionSurface(index: number) {
    requestAnimationFrame(() => {
      const surface = rootRef.current?.querySelector(
        `[data-section-index="${index}"] .wysiwyg-surface`,
      ) as HTMLElement | null;
      surface?.focus({ preventScroll: true });
      surface?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function insertBlocksAt(insertIndex: number, blocksToInsert: ContentBlock[]) {
    const index = clampInsertIndex(insertIndex);
    const next = [...sectionsRef.current];
    const imageSections = blocksToSections(blocksToInsert);
    if (next[index]?.type === "flow" && isEmptyFlowSection(next[index])) {
      next.splice(index, 1, ...imageSections);
    } else {
      next.splice(index, 0, ...imageSections);
    }
    markEditorAction();
    withViewportPreserved(() => {
      emitChange(next);
    });
  }

  function insertTextAt(insertIndex: number) {
    const index = clampInsertIndex(insertIndex);
    const at = sectionsRef.current[index];
    if (at?.type === "flow") {
      setActiveSectionIndex(index);
      focusSectionSurface(index);
      return;
    }
    const previous = sectionsRef.current[index - 1];
    if (previous?.type === "flow" && isEmptyFlowSection(previous)) {
      setActiveSectionIndex(index - 1);
      focusSectionSurface(index - 1);
      return;
    }

    const next = [...sectionsRef.current];
    next.splice(index, 0, {
      type: "flow",
      blocks: [],
      clientKey: `flow-${crypto.randomUUID()}`,
    });
    markEditorAction();
    withViewportPreserved(() => {
      setEditorSections(stampFlowClientKeys(next));
      setActiveSectionIndex(index);
    });
    focusSectionSurface(index);
  }

  type SectionInsertAnchor =
    | { mode: "after-block"; blockId: string }
    | { mode: "after-flow-block"; blockId: string }
    | { mode: "after-flow-key"; clientKey: string }
    | { mode: "before-block"; blockId: string }
    | { mode: "before-flow-block"; blockId: string }
    | { mode: "nested"; blockId: string; kind: "card" | "procedure_section" }
    | { mode: "end" };

  function captureAnchorAfterSection(index: number): SectionInsertAnchor {
    const section = sectionsRef.current[index];
    if (!section) {
      return { mode: "end" };
    }
    if (section.type !== "flow") {
      return { mode: "after-block", blockId: section.block.blockId };
    }
    const last = section.blocks[section.blocks.length - 1];
    if (last) {
      return { mode: "after-flow-block", blockId: last.blockId };
    }
    if (section.clientKey) {
      return { mode: "after-flow-key", clientKey: section.clientKey };
    }
    const next = sectionsRef.current[index + 1];
    if (next) {
      if (next.type !== "flow") {
        return { mode: "before-block", blockId: next.block.blockId };
      }
      const first = next.blocks[0];
      if (first) {
        return { mode: "before-flow-block", blockId: first.blockId };
      }
    }
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = sectionsRef.current[cursor];
      if (previous.type !== "flow") {
        return { mode: "after-block", blockId: previous.block.blockId };
      }
      const previousLast = previous.blocks[previous.blocks.length - 1];
      if (previousLast) {
        return { mode: "after-flow-block", blockId: previousLast.blockId };
      }
      if (previous.clientKey) {
        return { mode: "after-flow-key", clientKey: previous.clientKey };
      }
    }
    return { mode: "end" };
  }

  function captureNestedAnchor(
    index: number,
    kind: "card" | "procedure_section",
  ): SectionInsertAnchor {
    const section = sectionsRef.current[index];
    if (section?.type === kind) {
      return { mode: "nested", blockId: section.block.blockId, kind };
    }
    return { mode: "end" };
  }

  function resolveInsertIndex(anchor: SectionInsertAnchor): number {
    const sections = sectionsRef.current;
    if (anchor.mode === "end") {
      return sections.length;
    }
    if (anchor.mode === "after-block") {
      const index = sections.findIndex(
        (section) => section.type !== "flow" && section.block.blockId === anchor.blockId,
      );
      return index >= 0 ? index + 1 : sections.length;
    }
    if (anchor.mode === "after-flow-block") {
      const index = sections.findIndex(
        (section) =>
          section.type === "flow" && section.blocks.some((block) => block.blockId === anchor.blockId),
      );
      return index >= 0 ? index + 1 : sections.length;
    }
    if (anchor.mode === "after-flow-key") {
      const index = sections.findIndex(
        (section) => section.type === "flow" && section.clientKey === anchor.clientKey,
      );
      return index >= 0 ? index + 1 : sections.length;
    }
    if (anchor.mode === "before-block") {
      const index = sections.findIndex(
        (section) => section.type !== "flow" && section.block.blockId === anchor.blockId,
      );
      return index >= 0 ? index : sections.length;
    }
    if (anchor.mode === "before-flow-block") {
      const index = sections.findIndex(
        (section) =>
          section.type === "flow" && section.blocks.some((block) => block.blockId === anchor.blockId),
      );
      return index >= 0 ? index : sections.length;
    }
    return sections.length;
  }

  function resolveNestedSectionIndex(anchor: SectionInsertAnchor): number {
    if (anchor.mode !== "nested") {
      return -1;
    }
    return sectionsRef.current.findIndex(
      (section) => section.type === anchor.kind && section.block.blockId === anchor.blockId,
    );
  }

  async function insertImageFilesAt(insertIndex: number, files: File[], source: "paste" | "drop") {
    const scroll = captureScrollSnapshot();
    const anchor = captureAnchorAfterSection(Math.max(0, insertIndex - 1));
    const action = source === "drop" ? "dropped" : "pasted";
    setFormatHint(files.length === 1 ? `Uploading ${action} image...` : `Uploading ${files.length} ${action} images...`);
    try {
      const imageBlocks: ContentBlock[] = [];
      for (const file of files) {
        imageBlocks.push(await uploadImageBlockFromFile(file, kbId));
      }
      insertBlocksAt(resolveInsertIndex(anchor), imageBlocks);
      setFormatHint(null);
    } catch (caught) {
      setFormatHint(caught instanceof Error ? caught.message : "Image upload failed. Try the Insert media button instead.");
    } finally {
      restoreViewport(scroll);
    }
  }

  function appendImageBlocksToNestedSection(
    anchor: SectionInsertAnchor,
    imageBlocks: ImageBlock[],
  ) {
    if (imageBlocks.length === 0) {
      return;
    }
    const index = resolveNestedSectionIndex(anchor);
    if (index < 0 || anchor.mode !== "nested") {
      insertBlocksAt(sectionsRef.current.length, imageBlocks);
      return;
    }
    const next = [...sectionsRef.current];
    const section = next[index];
    if (!section || section.type !== anchor.kind) {
      insertBlocksAt(sectionsRef.current.length, imageBlocks);
      return;
    }
    markEditorAction();
    next[index] = {
      type: anchor.kind,
      block: {
        ...section.block,
        blocks: [...section.block.blocks, ...imageBlocks],
      },
    } as EditorSection;
    withViewportPreserved(() => {
      setVisualEpoch((value) => value + 1);
      emitChange(next);
    });
  }

  async function appendImageFilesToNestedSection(
    index: number,
    kind: "card" | "procedure_section",
    files: File[],
    source: "paste" | "drop",
  ) {
    const scroll = captureScrollSnapshot();
    const anchor = captureNestedAnchor(index, kind);
    const action = source === "drop" ? "dropped" : "pasted";
    setFormatHint(files.length === 1 ? `Uploading ${action} image...` : `Uploading ${files.length} ${action} images...`);
    try {
      const imageBlocks: ImageBlock[] = [];
      for (const file of files) {
        imageBlocks.push(await uploadImageBlockFromFile(file, kbId));
      }
      appendImageBlocksToNestedSection(anchor, imageBlocks);
      setFormatHint(null);
    } catch (caught) {
      setFormatHint(caught instanceof Error ? caught.message : "Image upload failed. Try the Insert media button instead.");
    } finally {
      restoreViewport(scroll);
    }
  }

  function openMediaPicker(insertIndex?: number) {
    const fallbackIndex = activeSectionIndex === null ? sectionsRef.current.length : activeSectionIndex + 1;
    setMediaPickerSelection(getEditorInsertionContext());
    setMediaInsertIndex(clampInsertIndex(typeof insertIndex === "number" ? insertIndex : fallbackIndex));
    setMediaPickerOpen(true);
  }

  function insertBlockFromPicker(payload: MediaPickerInsert) {
    const block = payload.block;
    if (block.type === "image" || block.type === "video") {
      insertBlocksAt(mediaInsertIndex ?? sectionsRef.current.length, [block]);
    } else {
      addBlockToFirstFlow(block);
    }
    setMediaInsertIndex(null);
    setMediaPickerOpen(false);
  }

  function insertAssetLinkBlock(assetId: string, label: string) {
    emitChange([
      ...sectionsRef.current,
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
      emitChange([...sectionsRef.current, { type: "image", block }]);
      return;
    }
    if (block.type === "section_divider") {
      emitChange([...sectionsRef.current, { type: "section_divider", block }]);
      return;
    }
    const next = [...sectionsRef.current];
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
      emitChange([...sectionsRef.current, { type: "section_divider", block }]);
    }
  }

  function moveSection(index: number, direction: -1 | 1) {
    const next = [...sectionsRef.current];
    const target = moveTargetIndex(next, index, direction);
    if (target < 0) return;
    markEditorAction();
    [next[index], next[target]] = [next[target], next[index]];
    withViewportPreserved(() => {
      setVisualEpoch((value) => value + 1);
      emitChange(next);
    });
  }

  function removeSection(index: number) {
    markEditorAction();
    const next = sectionsRef.current.filter((_, i) => i !== index);
    withViewportPreserved(() => {
      setVisualEpoch((value) => value + 1);
      emitChange(next);
    });
  }

  function updateFlowSection(index: number, html: string, _isBlur: boolean) {
    const clean = sanitizePageDocument(html);
    const flowBlocks = flowBlocksFromEditorHtml(clean);
    const next = [...sectionsRef.current];
    if (flowBlocks.length === 0) {
      const existing = next[index];
      next[index] = {
        type: "flow",
        blocks: [],
        clientKey: existing?.type === "flow" ? existing.clientKey : undefined,
      };
      setEditorSections(next);
      onChangeRef.current(cleanDocumentLayout(dedupeContentBlockIds(sectionsToBlocks(normalizeEditorSections(next)))));
      return;
    }
    const replacement = blocksToSections(flowBlocks);
    const nextReplacement = replacement.length > 0 ? replacement : [{ type: "flow" as const, blocks: [] }];
    if (nextReplacement.length !== 1 || nextReplacement[0]?.type !== "flow") {
      setVisualEpoch((value) => value + 1);
    }
    next.splice(index, 1, ...nextReplacement);
    emitChange(next);
  }

  function updateImageSection(index: number, block: ContentBlock) {
    if (block.type !== "image") return;
    markEditorAction();
    const next = [...sectionsRef.current];
    next[index] = { type: "image", block };
    emitChange(next);
  }

  function updateTableSection(index: number, block: ContentBlock) {
    if (block.type !== "table") return;
    const next = [...sectionsRef.current];
    next[index] = { type: "table", block };
    emitChange(next);
  }

  function updateVideoSection(index: number, block: ContentBlock) {
    if (block.type !== "video") return;
    const next = [...sectionsRef.current];
    next[index] = { type: "video", block };
    emitChange(next);
  }

  function addTable() {
    const next = [
      ...sectionsRef.current,
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
      ...sectionsRef.current,
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
    const next = [...sectionsRef.current];
    next[index] = { type: "card", block };
    emitChange(next);
  }

  function addProcedureSection() {
    const next = [
      ...sectionsRef.current,
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
    const next = [...sectionsRef.current];
    next[index] = { type: "procedure_section", block };
    emitChange(next);
  }

  function addExcerpt() {
    setExcerptPickerOpen(true);
  }

  function insertExcerptFromPicker(sourcePageId: string) {
    const next = [
      ...sectionsRef.current,
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
    const next = [...sectionsRef.current];
    next[index] = { type: "excerpt", block };
    emitChange(next);
  }

  function addSourced() {
    const next = [
      ...sectionsRef.current,
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
    const next = [...sectionsRef.current];
    next[index] = { type: "sourced", block };
    emitChange(next);
  }

  function handleSectionImageFiles(section: EditorSection, index: number, files: File[], source: "paste" | "drop") {
    if (section.type === "card") {
      void appendImageFilesToNestedSection(index, "card", files, source);
      return;
    }
    if (section.type === "procedure_section") {
      void appendImageFilesToNestedSection(index, "procedure_section", files, source);
      return;
    }
    void insertImageFilesAt(index + 1, files, source);
  }

  function handleSectionImageBlocks(section: EditorSection, index: number, blocks: ImageBlock[]) {
    if (section.type === "card") {
      appendImageBlocksToNestedSection(captureNestedAnchor(index, "card"), blocks);
      return;
    }
    if (section.type === "procedure_section") {
      appendImageBlocksToNestedSection(captureNestedAnchor(index, "procedure_section"), blocks);
      return;
    }
    insertBlocksAt(resolveInsertIndex(captureAnchorAfterSection(index)), blocks);
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
            onInsertMedia={() => openMediaPicker()}
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
          onClose={() => {
            setMediaInsertIndex(null);
            setMediaPickerOpen(false);
          }}
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
          <InsertControls insertIndex={0} onInsertMedia={openMediaPicker} onInsertText={insertTextAt} />
          {sections.map((section, index) => {
            const sectionKey =
              section.type === "flow"
                ? section.clientKey ?? `flow-fallback-${index}`
                : section.block.blockId;
            return (
              <Fragment key={sectionKey}>
                <SectionEditor
                  index={index}
                  isFirst={moveTargetIndex(sections, index, -1) < 0}
                  isLast={moveTargetIndex(sections, index, 1) < 0}
                  kbId={kbId}
                  kbSlug={kbSlug}
                  onActivate={() => setActiveSectionIndex(index)}
                  onImageBlocks={(blocks) => handleSectionImageBlocks(section, index, blocks)}
                  onImageFiles={(files, source) => handleSectionImageFiles(section, index, files, source)}
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
                <InsertControls
                  insertIndex={index + 1}
                  onInsertMedia={openMediaPicker}
                  onInsertText={insertTextAt}
                />
              </Fragment>
            );
          })}
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

function InsertControls({
  insertIndex,
  onInsertMedia,
  onInsertText,
}: {
  insertIndex: number;
  onInsertMedia: (insertIndex: number) => void;
  onInsertText: (insertIndex: number) => void;
}) {
  return (
    <div className="block-insert-row" data-insert-index={insertIndex}>
      <span aria-hidden="true" className="block-insert-row__line" />
      <div className="block-insert-row__actions">
        <button
          aria-label="Insert text here"
          className="button button--ghost button--small block-insert-row__button"
          onClick={() => onInsertText(insertIndex)}
          type="button"
        >
          <Type aria-hidden="true" size={16} strokeWidth={1.75} />
          Text
        </button>
        <button
          aria-label="Insert media here"
          className="button button--ghost button--small block-insert-row__button"
          onClick={() => onInsertMedia(insertIndex)}
          type="button"
        >
          <ImagePlus aria-hidden="true" size={16} strokeWidth={1.75} />
          Image
        </button>
      </div>
      <span aria-hidden="true" className="block-insert-row__line" />
    </div>
  );
}

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
  onImageFiles,
}: {
  block: ImageBlock;
  index: number;
  kbSlug: string;
  onChange: (block: ContentBlock) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onImageFiles?: (files: File[], source: "paste" | "drop") => void;
}) {
  const figureRootRef = useRef<HTMLDivElement>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);

  const selectFigure = useCallback((figure: HTMLElement) => {
    figureRootRef.current?.querySelectorAll("figure.doc-image.is-selected").forEach((element) => {
      if (element !== figure) element.classList.remove("is-selected");
    });
    figure.classList.add("is-selected");
    setSelected(true);
    editorRootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const figure = figureRootRef.current?.querySelector("figure.doc-image");
    figure?.removeAttribute("contenteditable");
    figure?.querySelector(".doc-image__controls")?.remove();
    figure?.querySelectorAll("[contenteditable]").forEach((node) => {
      node.removeAttribute("contenteditable");
    });
    figure?.classList.toggle("is-selected", selected);
  }, [block, selected]);

  const handleFigureClick = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const figure = target?.closest("figure.doc-image") as HTMLElement | null;
    if (!figure || !figureRootRef.current?.contains(figure)) {
      return;
    }

    selectFigure(figure);
  }, [selectFigure]);

  function handleImageAction(action: string) {
    const figure = figureRootRef.current?.querySelector("figure.doc-image") as HTMLElement | null;
    if (!figure) {
      return;
    }
    selectFigure(figure);
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

  useEffect(() => {
    const root = figureRootRef.current;
    if (!root) {
      return;
    }
    root.addEventListener("click", handleFigureClick);
    return () => {
      root.removeEventListener("click", handleFigureClick);
    };
  }, [handleFigureClick]);

  useEffect(() => {
    const root = editorRootRef.current;
    if (!root || !onImageFiles) {
      return;
    }
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFilesFromTransfer(event.clipboardData);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onImageFiles(files, "paste");
    };
    const onDrop = (event: DragEvent) => {
      const files = imageFilesFromTransfer(event.dataTransfer);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onImageFiles(files, "drop");
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
      }
    };
    root.addEventListener("paste", onPaste);
    root.addEventListener("drop", onDrop);
    root.addEventListener("dragover", onDragOver);
    return () => {
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("drop", onDrop);
      root.removeEventListener("dragover", onDragOver);
    };
  }, [onImageFiles]);

  return (
    <div className="image-section-editor" ref={editorRootRef} tabIndex={-1}>
      <div className="image-section-toolbar" role="group" aria-label="Image controls">
        <button
          aria-label="Edit image alt text"
          className="doc-image__control doc-image__control--text"
          onClick={() => handleImageAction("alt")}
          title="Edit alt text"
          type="button"
        >
          Alt
        </button>
        <span className="doc-image__control-sep" aria-hidden="true" />
        <button
          aria-label="Align image left"
          className="doc-image__control"
          onClick={() => handleImageAction("align-left")}
          title="Align left"
          type="button"
        >
          ⤆
        </button>
        <button
          aria-label="Center image"
          className="doc-image__control"
          onClick={() => handleImageAction("align-center")}
          title="Center"
          type="button"
        >
          ↔
        </button>
        <button
          aria-label="Align image right"
          className="doc-image__control"
          onClick={() => handleImageAction("align-right")}
          title="Align right"
          type="button"
        >
          ⤇
        </button>
        <span className="doc-image__control-sep" aria-hidden="true" />
        <button
          aria-label="Shrink image"
          className="doc-image__control"
          onClick={() => handleImageAction("width-down")}
          title="Smaller"
          type="button"
        >
          −
        </button>
        <button
          aria-label="Enlarge image"
          className="doc-image__control"
          onClick={() => handleImageAction("width-up")}
          title="Larger"
          type="button"
        >
          +
        </button>
        <span className="doc-image__control-sep" aria-hidden="true" />
        <button
          aria-label="Move image up"
          className="doc-image__control"
          onClick={() => handleImageAction("move-up")}
          title="Move up"
          type="button"
        >
          ↑
        </button>
        <button
          aria-label="Move image down"
          className="doc-image__control"
          onClick={() => handleImageAction("move-down")}
          title="Move down"
          type="button"
        >
          ↓
        </button>
      </div>
      <div
        className="image-section-editor__figure"
        dangerouslySetInnerHTML={{
          __html: blocksToDocumentHtml([block], kbSlug, {
            imageControls: false,
            captionEditable: false,
          }),
        }}
        ref={figureRootRef}
      />
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
  onActivate,
  onImageFiles,
  onImageBlocks,
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
  onActivate: () => void;
  onImageFiles: (files: File[], source: "paste" | "drop") => void;
  onImageBlocks: (blocks: ImageBlock[], source?: "paste" | "drop") => void;
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
    <article className="block-editor" data-section-index={index} onFocusCapture={onActivate}>
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
          onFocus={onActivate}
          onHtmlChange={onUpdateFlow}
          onImageBlocks={onImageBlocks}
          onImageFiles={onImageFiles}
        />
      )}

      {section.type === "image" && (
        <ImageSectionEditor
          block={section.block}
          index={index}
          kbSlug={kbSlug}
          onChange={onUpdateImage}
          onImageFiles={onImageFiles}
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
              onFocus={onActivate}
              onHtmlChange={(html) => {
                const clean = sanitizePageDocument(html);
                onUpdateProcedureSection({ ...section.block, blocks: documentHtmlToBlocks(clean) });
              }}
              onImageBlocks={onImageBlocks}
              onImageFiles={onImageFiles}
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
              onFocus={onActivate}
              onHtmlChange={(html) => {
                const clean = sanitizePageDocument(html);
                onUpdateCard({ ...section.block, blocks: documentHtmlToBlocks(clean) });
              }}
              onImageBlocks={onImageBlocks}
              onImageFiles={onImageFiles}
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
