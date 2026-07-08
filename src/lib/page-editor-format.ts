import { isPageEditorDebugEnabled, publishPageEditorDebug } from "@/lib/page-editor-debug";
import {
  canIndentListItem,
  canOutdentListItem,
  indentListItem,
  listLevelForItem,
  listItemFromSelection,
  listMarkerLabelForItem,
  orderedListFromSelection,
  orderedListStartFromSelection,
  outdentListItem,
  setOrderedListStart,
  suggestedOrderedListStart,
} from "@/lib/page-editor-list";
import { blocksToDocumentHtml, sanitizePageDocument } from "@/lib/page-document";
import { redoStructural, snapshotStructuralChange, undoStructural } from "@/lib/page-editor-undo";
import { escapeHtml, RICH_TEXT_FONT_FAMILIES, RICH_TEXT_FONT_SIZES, sanitizeRichText } from "@/lib/rich-text";
import {
  applyToRichTextSelection,
  bindEditorSurface,
  getBoundEditorSurface,
  restoreRichTextSelection,
  runEditorCommand,
  saveRichTextSelection,
} from "@/lib/rich-text-selection";
import type { ContentBlock } from "@/lib/types";

let onDocumentMutate: (() => void) | null = null;
let onFormatIssue: ((message: string | null) => void) | null = null;

const FORMAT_CONTEXT_EVENT = "kb-editor-formatting-change";

const FONT_FACE_FOR_EXEC: Record<string, string> = {
  "Arial, Helvetica, sans-serif": "Arial",
  "Georgia, serif": "Georgia",
  '"Times New Roman", Times, serif': "Times New Roman",
  "Verdana, Geneva, sans-serif": "Verdana",
};

const FONT_SIZE_FOR_EXEC: Record<string, string> = {
  "": "",
  "0.875rem": "2",
  "1rem": "3",
  "1.125rem": "4",
  "1.375rem": "5",
  "1.5rem": "6",
  "1.75rem": "7",
};

function reportFormatIssue(message: string) {
  onFormatIssue?.(message);
}

function recordFormat(action: string, ok: boolean, detail: string, userMessage?: string) {
  publishPageEditorDebug({ lastAction: action, lastResult: ok ? "ok" : "fail", lastDetail: detail });
  if (!ok && userMessage) {
    const suffix = isPageEditorDebugEnabled() ? ` [${detail}]` : "";
    reportFormatIssue(`${userMessage}${suffix}`);
  }
}

function notifyMutation() {
  onFormatIssue?.(null);
  onDocumentMutate?.();
  notifyFormattingContext();
}

function notifyFormattingContext() {
  if (typeof document === "undefined") {
    return;
  }
  document.dispatchEvent(new Event(FORMAT_CONTEXT_EVENT));
}

export function bindPageEditor(surface: HTMLElement | null, onMutate: () => void) {
  bindEditorSurface(surface);
  onDocumentMutate = onMutate;
  notifyFormattingContext();
  publishPageEditorDebug({
    lastAction: surface ? "bind" : "unbind",
    lastResult: "ok",
    lastDetail: surface ? "editor surface attached" : "detached",
  });
}

export function registerFormatIssueReporter(report: (message: string | null) => void) {
  onFormatIssue = report;
}

export function subscribeEditorFormatting(listener: () => void): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }
  document.addEventListener(FORMAT_CONTEXT_EVENT, listener);
  return () => document.removeEventListener(FORMAT_CONTEXT_EVENT, listener);
}

export const saveEditorSelection = saveRichTextSelection;

export function toolbarPrepare(event?: { preventDefault: () => void }) {
  saveRichTextSelection();
  event?.preventDefault();
}

export function applyInlineFormat(styles: { color?: string }): boolean {
  if (!styles.color) {
    return false;
  }
  const ok = applyToRichTextSelection(() => {
    document.execCommand("foreColor", false, styles.color);
  });
  if (!ok) {
    recordFormat(
      "foreColor",
      false,
      "no-selection",
      "Highlight text in the page body, then choose a color.",
    );
    return false;
  }
  notifyMutation();
  recordFormat("foreColor", true, styles.color);
  return true;
}

export function applyFontFamily(stack: string): boolean {
  const face = FONT_FACE_FOR_EXEC[stack] ?? stack.split(",")[0]?.replace(/["']/g, "").trim();
  if (!face) {
    return false;
  }
  const ok = applyToRichTextSelection(() => {
    document.execCommand("fontName", false, face);
  });
  if (!ok) {
    recordFormat(
      "fontName",
      false,
      "no-selection",
      "Highlight text in the page body, then choose a font.",
    );
    return false;
  }
  notifyMutation();
  recordFormat("fontName", true, face);
  return true;
}

export function applyFontSize(rem: string): boolean {
  const size = FONT_SIZE_FOR_EXEC[rem];
  if (typeof size !== "string") {
    return false;
  }
  const ok = applyToRichTextSelection(() => {
    document.execCommand("fontSize", false, size || "3");
  });
  if (!ok) {
    recordFormat(
      "fontSize",
      false,
      "no-selection",
      "Highlight text in the page body, then choose a size.",
    );
    return false;
  }
  notifyMutation();
  recordFormat("fontSize", true, `size=${size || "default"}`);
  return true;
}

export function applyEditorCommand(command: string, value?: string): boolean {
  const ok = runEditorCommand(command, value);
  if (!ok) {
    recordFormat(
      command,
      false,
      "no-selection",
      "Click in the page body before using this control.",
    );
    return false;
  }
  notifyMutation();
  recordFormat(command, true, value ?? "ok");
  return true;
}

export interface LinkEditRequest {
  url: string;
  text: string;
  newTab: boolean;
  isEdit: boolean;
  anchor: HTMLAnchorElement | null;
  // Placeholder span wrapped around the selection while the dialog is open.
  // Keeps the target visibly highlighted and survives editor re-renders, so
  // committing the link can never lose the insertion point.
  marker: HTMLElement | null;
}

let linkEditorOpener: ((request: LinkEditRequest) => void) | null = null;

export function registerLinkEditor(open: ((request: LinkEditRequest) => void) | null) {
  linkEditorOpener = open;
}

function anchorFromSelection(): HTMLAnchorElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
  while (node) {
    if (node instanceof HTMLAnchorElement) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

const BLOCK_TAGS = /^(P|H2|H3|LI|TD|TH|FIGCAPTION)$/;

function nearestBlock(node: Node | null, surface: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== surface) {
    if (current instanceof HTMLElement && BLOCK_TAGS.test(current.tagName)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

const LINK_DRAFT_CLASS = "doc-link-draft";

// Unwrap a draft marker, restoring the original content (used on cancel, and
// defensively before creating a new draft).
export function releaseLinkDraft(marker: HTMLElement | null) {
  if (!marker || !marker.isConnected) {
    return;
  }
  const parent = marker.parentNode;
  if (!parent) {
    return;
  }
  while (marker.firstChild) {
    parent.insertBefore(marker.firstChild, marker);
  }
  parent.removeChild(marker);
}

function clearStaleLinkDrafts() {
  document.querySelectorAll<HTMLElement>(`.wysiwyg-surface .${LINK_DRAFT_CLASS}`).forEach((el) => {
    releaseLinkDraft(el);
  });
}

export function openLinkEditor(anchor?: HTMLAnchorElement | null) {
  saveRichTextSelection();
  clearStaleLinkDrafts();
  const target = anchor ?? anchorFromSelection();
  if (target) {
    linkEditorOpener?.({
      url: target.getAttribute("href") ?? "",
      text: target.textContent ?? "",
      newTab: target.getAttribute("target") === "_blank",
      isEdit: true,
      anchor: target,
      marker: null,
    });
    return;
  }

  const surface = getBoundEditorSurface();
  const selection = window.getSelection();
  let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const inSurface = Boolean(range && surface && surface.contains(range.commonAncestorContainer));
  if (!inSurface) {
    if (restoreRichTextSelection()) {
      range = window.getSelection()?.getRangeAt(0) ?? null;
    } else {
      recordFormat(
        "createLink",
        false,
        "no-selection",
        "Select the text that should become a link (or click where it goes), then press the link button.",
      );
      return;
    }
  }
  if (!range) {
    recordFormat("createLink", false, "no-range", "Click in the page body, then add a link.");
    return;
  }

  if (!range.collapsed && surface) {
    const startBlock = nearestBlock(range.startContainer, surface);
    const endBlock = nearestBlock(range.endContainer, surface);
    if (startBlock && endBlock && startBlock !== endBlock) {
      recordFormat(
        "createLink",
        false,
        "cross-block",
        "Select text within a single paragraph, heading, or list item, then add a link.",
      );
      return;
    }
  }

  const selectionText = range.toString();
  // Snapshot before the marker goes in, so undoing a committed link restores
  // the original text with no marker and no anchor.
  snapshotStructuralChange();
  const marker = document.createElement("span");
  marker.className = LINK_DRAFT_CLASS;
  marker.setAttribute("data-link-draft", "true");
  if (range.collapsed) {
    range.insertNode(marker);
  } else {
    try {
      range.surroundContents(marker);
    } catch {
      marker.appendChild(range.extractContents());
      range.insertNode(marker);
    }
  }

  linkEditorOpener?.({
    url: "",
    text: selectionText,
    newTab: false,
    isEdit: false,
    anchor: null,
    marker,
  });
}

function persistFromAnchor(anchor: HTMLElement) {
  const surface = anchor.closest(".wysiwyg-surface") as HTMLElement | null;
  surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  notifyMutation();
}

// Forgiving URL entry: prepend https:// for bare domains ("www.wsu.edu") and
// mailto: for plain email addresses. Already-schemed, relative, and anchor
// URLs pass through untouched.
export function normalizeLinkUrl(raw: string): string {
  const url = raw.trim();
  if (!url || /^(https?:|mailto:|\/|#)/i.test(url)) {
    return url;
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url)) {
    return `mailto:${url}`;
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(url)) {
    return `https://${url}`;
  }
  return url;
}

export function commitLink(request: {
  url: string;
  text: string;
  newTab: boolean;
  anchor: HTMLAnchorElement | null;
  marker?: HTMLElement | null;
}): boolean {
  const url = normalizeLinkUrl(request.url);
  if (!url) {
    releaseLinkDraft(request.marker ?? null);
    return false;
  }
  const text = request.text.trim();

  if (request.anchor) {
    snapshotStructuralChange();
    request.anchor.setAttribute("href", url);
    if (request.newTab) {
      request.anchor.setAttribute("target", "_blank");
      request.anchor.setAttribute("rel", "noopener noreferrer");
    } else {
      request.anchor.removeAttribute("target");
    }
    if (text && text !== request.anchor.textContent) {
      request.anchor.textContent = text;
    }
    persistFromAnchor(request.anchor);
    recordFormat("editLink", true, url);
    return true;
  }

  const marker = request.marker ?? null;
  if (marker && marker.isConnected) {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", url);
    if (request.newTab) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
    const markerText = (marker.textContent ?? "").trim();
    if (marker.childNodes.length > 0 && (!text || text === markerText)) {
      // Keep the original nodes so inline formatting inside the selection survives.
      while (marker.firstChild) {
        anchor.appendChild(marker.firstChild);
      }
    } else {
      anchor.textContent = text || url;
    }
    marker.replaceWith(anchor);
    const selection = window.getSelection();
    if (selection) {
      const caret = document.createRange();
      caret.setStartAfter(anchor);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
    }
    persistFromAnchor(anchor);
    recordFormat("createLink", true, request.newTab ? `${url} (new tab)` : url);
    return true;
  }

  // Fallback when the marker was lost (e.g. the surface was rebuilt while the
  // dialog was open): try inserting at the last saved selection.
  const label = escapeHtml(text || url);
  const targetAttr = request.newTab ? ' target="_blank"' : "";
  const relAttr = request.newTab ? ' rel="noopener noreferrer"' : "";
  const html = `<a href="${escapeHtml(url)}"${targetAttr}${relAttr}>${label}</a>`;
  const ok = runEditorCommand("insertHTML", html);
  if (!ok) {
    recordFormat("createLink", false, "no-selection", "Click in the page body, then add a link.");
    return false;
  }
  notifyMutation();
  recordFormat("createLink", true, request.newTab ? `${url} (new tab)` : url);
  return true;
}

export function removeLink(anchor: HTMLAnchorElement): boolean {
  const parent = anchor.parentNode;
  if (!parent) {
    return false;
  }
  snapshotStructuralChange();
  while (anchor.firstChild) {
    parent.insertBefore(anchor.firstChild, anchor);
  }
  parent.removeChild(anchor);
  persistFromAnchor(parent as HTMLElement);
  recordFormat("unlink", true, "removed");
  return true;
}

export interface NoteEditRequest {
  body: string;
  isEdit: boolean;
  span: HTMLElement | null;
  hasSelection: boolean;
  isPoint: boolean;
}

let noteEditorOpener: ((request: NoteEditRequest) => void) | null = null;

export function registerNoteEditor(open: ((request: NoteEditRequest) => void) | null) {
  noteEditorOpener = open;
}

function noteFromSelection(): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
  while (node) {
    if (node instanceof HTMLElement && node.classList.contains("doc-note")) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

export function openNoteEditor(span?: HTMLElement | null) {
  saveRichTextSelection();
  const target = span ?? noteFromSelection();
  const selectionText = window.getSelection()?.toString() ?? "";
  const surface = getBoundEditorSurface();
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const hasCaretAnchor = Boolean(
    target ||
      (surface &&
        range &&
        range.collapsed &&
        surface.contains(range.commonAncestorContainer)),
  );
  const hasSelection = Boolean(target) || selectionText.trim().length > 0;
  if (!hasSelection && !hasCaretAnchor) {
    recordFormat("addNote", false, "no-selection", "Click in the page body, then add a note.");
    return;
  }
  noteEditorOpener?.({
    body: target?.getAttribute("data-note-body") ?? "",
    isEdit: Boolean(target),
    span: target ?? null,
    hasSelection,
    isPoint: Boolean(target?.classList.contains("doc-note--point") || (!target && !hasSelection)),
  });
}

function noteId(): string {
  return `note-${crypto.randomUUID()}`;
}

export function commitNote(request: { body: string; span: HTMLElement | null }): boolean {
  const body = request.body.trim();
  if (!body) {
    return false;
  }

  if (request.span) {
    request.span.setAttribute("data-note-body", body);
    persistFromAnchor(request.span);
    recordFormat("editNote", true, "updated");
    return true;
  }

  let created = false;
  snapshotStructuralChange();
  const ok = applyToRichTextSelection(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.className = "doc-note";
    span.setAttribute("data-note-id", noteId());
    span.setAttribute("data-note-body", body);
    if (range.collapsed) {
      span.classList.add("doc-note--point");
      span.setAttribute("contenteditable", "false");
      span.setAttribute("aria-label", "Editor note");
      range.insertNode(span);
      range.setStartAfter(span);
      range.setEndAfter(span);
      selection.removeAllRanges();
      selection.addRange(range);
      created = true;
      return;
    }
    try {
      range.surroundContents(span);
    } catch {

      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
    created = true;
  });

  if (!ok || !created) {
    recordFormat("addNote", false, "no-selection", "Click in the page body, then add a note.");
    return false;
  }
  notifyMutation();
  recordFormat("addNote", true, "created");
  return true;
}

export function removeNote(span: HTMLElement): boolean {
  const parent = span.parentNode;
  if (!parent) {
    return false;
  }
  snapshotStructuralChange();
  while (span.firstChild) {
    parent.insertBefore(span.firstChild, span);
  }
  parent.removeChild(span);
  persistFromAnchor(parent as HTMLElement);
  recordFormat("removeNote", true, "removed");
  return true;
}

export function applyBlockTag(tag: "p" | "h2" | "h3"): boolean {
  return applyEditorCommand("formatBlock", tag) || applyEditorCommand("formatBlock", `<${tag}>`);
}

export function applyAlign(align: "left" | "center" | "right"): boolean {
  const command = align === "center" ? "justifyCenter" : align === "right" ? "justifyRight" : "justifyLeft";
  return applyEditorCommand(command);
}

const IMAGE_WIDTH_STEP = 25;
const IMAGE_MIN_WIDTH = 25;
const IMAGE_MAX_WIDTH = 100;

function imageMargin(align: string): string {
  if (align === "center") return "0 auto";
  if (align === "right") return "0 0 0 auto";
  return "0 auto 0 0";
}

function styleImageFigure(figure: HTMLElement) {
  const width = Math.min(
    IMAGE_MAX_WIDTH,
    Math.max(IMAGE_MIN_WIDTH, Number(figure.getAttribute("data-width")) || IMAGE_MAX_WIDTH),
  );
  const align = figure.getAttribute("data-align") || "left";
  figure.setAttribute("data-width", String(width));
  figure.setAttribute("data-align", align);
  figure.style.maxWidth = `${width}%`;
  figure.style.margin = imageMargin(align);
}

export interface AltEditRequest {
  alt: string;
  caption: string;
  decorative: boolean;
  assetId: string | null;
  figure: HTMLElement;
}

let altEditorOpener: ((request: AltEditRequest) => void) | null = null;

export function registerAltEditor(open: ((request: AltEditRequest) => void) | null) {
  altEditorOpener = open;
}

function openAltEditor(figure: HTMLElement) {
  const img = figure.querySelector("img");
  altEditorOpener?.({
    alt: img?.getAttribute("alt") ?? "",
    caption: figure.querySelector<HTMLElement>("[data-img-caption]")?.textContent?.trim() ?? "",
    decorative: figure.getAttribute("data-decorative") === "true",
    assetId: figure.getAttribute("data-asset-id"),
    figure,
  });
}

export function applyAltText(figure: HTMLElement, alt: string, decorative: boolean, captionText = ""): boolean {
  snapshotStructuralChange();
  const value = alt.trim();
  const img = figure.querySelector("img");
  img?.setAttribute("alt", decorative ? "" : value);
  if (decorative) {
    figure.setAttribute("data-decorative", "true");
  } else {
    figure.removeAttribute("data-decorative");
  }

  const missing = !decorative && !value;
  const caption = figure.querySelector(".doc-image__caption");
  if (caption) {
    const visibleCaption = captionText.trim();
    caption.setAttribute("data-img-caption", "true");
    caption.setAttribute("contenteditable", "true");
    caption.className =
      "doc-image__caption" +
      (visibleCaption ? "" : decorative ? " doc-image__caption--decorative" : missing ? " doc-image__caption--missing" : " doc-image__caption--placeholder");
    caption.textContent = visibleCaption || (decorative ? "Decorative image (no alt text needed)" : missing ? "No alt text - use the Alt button to add a description" : "");
  }
  figure.classList.toggle("doc-image--needs-alt", missing);
  if (missing) {
    figure.setAttribute("data-needs-alt", "true");
  } else {
    figure.removeAttribute("data-needs-alt");
  }

  const surface = figure.closest(".wysiwyg-surface") as HTMLElement | null;
  surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  recordFormat("altText", true, decorative ? "decorative" : value);
  return true;
}

export function markMissingAltImages(): number {
  let count = 0;
  document.querySelectorAll<HTMLElement>(".wysiwyg-surface figure.doc-image").forEach((figure) => {
    const alt = (figure.querySelector("img")?.getAttribute("alt") ?? "").trim();
    const decorative = figure.getAttribute("data-decorative") === "true";
    const missing = !decorative && !alt;
    figure.classList.toggle("doc-image--needs-alt", missing);
    if (missing) {
      count += 1;
    }
  });
  return count;
}

export function handleImageControlClick(event: {
  target: EventTarget | null;
  preventDefault: () => void;
}): boolean {
  const target = event.target as HTMLElement | null;
  const surface = target?.closest?.(".wysiwyg-surface") as HTMLElement | null;

  const link = target?.closest?.("a") as HTMLAnchorElement | null;
  if (link && surface) {
    event.preventDefault();
    openLinkEditor(link);
    return true;
  }

  const note = target?.closest?.(".doc-note") as HTMLElement | null;
  if (note && surface) {
    event.preventDefault();
    openNoteEditor(note);
    return true;
  }

  const figure = target?.closest?.("figure.doc-image") as HTMLElement | null;

  if (surface) {
    surface.querySelectorAll("figure.doc-image.is-selected").forEach((el) => {
      if (el !== figure) el.classList.remove("is-selected");
    });
  }
  if (figure) {
    figure.classList.add("is-selected");
  }

  const button = target?.closest?.("[data-img-action]") as HTMLElement | null;
  if (!button || !figure) {
    return false;
  }
  event.preventDefault();
  const action = button.getAttribute("data-img-action");
  if (action === "alt") {
    openAltEditor(figure);
    return true;
  }
  const currentWidth = Number(figure.getAttribute("data-width")) || IMAGE_MAX_WIDTH;
  snapshotStructuralChange();
  switch (action) {
    case "align-left":
    case "align-center":
    case "align-right":
      figure.setAttribute("data-align", action.replace("align-", ""));
      break;
    case "width-down":
      figure.setAttribute("data-width", String(Math.max(IMAGE_MIN_WIDTH, currentWidth - IMAGE_WIDTH_STEP)));
      break;
    case "width-up":
      figure.setAttribute("data-width", String(Math.min(IMAGE_MAX_WIDTH, currentWidth + IMAGE_WIDTH_STEP)));
      break;
    default:
      return false;
  }
  styleImageFigure(figure);
  surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  recordFormat("imageControl", true, action ?? "");
  return true;
}

export function applyList(command: "insertUnorderedList" | "insertOrderedList"): boolean {
  const ok = applyEditorCommand(command);
  if (ok && command === "insertOrderedList") {
    const surface = getBoundEditorSurface();
    const list = surface ? orderedListFromSelection(surface) : null;
    const suggested = list ? suggestedOrderedListStart(list) : null;
    if (list && suggested && suggested > 1) {
      setOrderedListStart(list, suggested);
      surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }
  return ok;
}

const VAGUE_LINK_TEXT = new Set(["click here", "here", "more", "read more", "link", "this"]);

export function markProblemLinks(): number {
  let count = 0;
  document.querySelectorAll<HTMLAnchorElement>(".wysiwyg-surface a").forEach((anchor) => {
    const text = (anchor.textContent ?? "").trim().toLowerCase();
    const href = (anchor.getAttribute("href") ?? "").trim();
    const problem = !href || href === "#" || !text || VAGUE_LINK_TEXT.has(text);
    anchor.classList.toggle("doc-link--problem", problem);
    if (problem) count += 1;
  });
  return count;
}

export function applyOrderedListStart(start: number): boolean {
  const surface = getBoundEditorSurface();
  if (!surface) {
    return false;
  }
  restoreRichTextSelection();
  const list = orderedListFromSelection(surface);
  if (!list) {
    recordFormat("listStart", false, "not-in-ordered-list", "Place the cursor in a numbered list first.");
    return false;
  }
  snapshotStructuralChange();
  if (!setOrderedListStart(list, start)) {
    recordFormat("listStart", false, "not-in-ordered-list", "Place the cursor in a numbered list first.");
    return false;
  }
  surface.dispatchEvent(new InputEvent("input", { bubbles: true }));
  notifyMutation();
  recordFormat("listStart", true, String(start));
  return true;
}

function mutateListItem(li: HTMLLIElement, action: "indent" | "outdent"): boolean {
  const surface = getBoundEditorSurface();
  const allowed = action === "indent" ? canIndentListItem(li) : canOutdentListItem(li);
  if (!allowed) {
    const message =
      action === "indent"
        ? "Add a list item above this one before nesting it."
        : "This list item is already at the top level.";
    recordFormat(action, false, action === "indent" ? "first-item" : "top-level", message);
    return false;
  }
  const preHtml = surface?.innerHTML;
  const changed = action === "indent" ? indentListItem(li) : outdentListItem(li);
  if (!changed) {
    recordFormat(action, false, "cannot-nest", "Cannot indent/outdent this line further.");
    return false;
  }
  snapshotStructuralChange(preHtml);
  surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  notifyMutation();
  recordFormat(action, true, "dom");
  return true;
}

export function applyIndent(): boolean {
  const surface = getBoundEditorSurface();
  if (!surface) {
    recordFormat("indent", false, "no-surface", "Click in the editor, then indent a list item.");
    return false;
  }
  const li = listItemFromSelection(surface);
  if (!li) {
    recordFormat("indent", false, "not-in-list", "Place the cursor in a list item, then indent.");
    return false;
  }
  return mutateListItem(li, "indent");
}

export function applyOutdent(): boolean {
  const surface = getBoundEditorSurface();
  if (!surface) {
    recordFormat("outdent", false, "no-surface", "Click in the editor, then outdent a nested list item.");
    return false;
  }
  const li = listItemFromSelection(surface);
  if (!li) {
    recordFormat("outdent", false, "not-in-list", "Place the cursor in a nested list item, then outdent.");
    return false;
  }
  return mutateListItem(li, "outdent");
}

export function handleEditorTabKey(event: {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
}): boolean {
  if (event.key !== "Tab") {
    return false;
  }
  const surface = getBoundEditorSurface();
  if (!surface) {
    return false;
  }
  const li = listItemFromSelection(surface);
  if (!li) {
    return false;
  }
  event.preventDefault();
  saveRichTextSelection();
  return event.shiftKey ? applyOutdent() : applyIndent();
}

function isHeadingElement(el: Element | null): boolean {
  return el instanceof HTMLElement && /^H[23]$/.test(el.tagName);
}

function isEmptyBlock(el: HTMLElement): boolean {
  return (el.textContent ?? "").trim() === "" && !el.querySelector("img, figure, table");
}

function rangeIsAtBlockEdge(block: HTMLElement, container: Node, offset: number, edge: "start" | "end"): boolean {
  const probe = document.createRange();
  if (edge === "start") {
    probe.setStart(block, 0);
    probe.setEnd(container, offset);
  } else {
    probe.setStart(container, offset);
    probe.setEnd(block, block.childNodes.length);
  }
  if (probe.toString().trim() !== "") {
    return false;
  }
  return !probe.cloneContents().querySelector("img, figure, table");
}

function siblingElement(block: HTMLElement, direction: "prev" | "next"): HTMLElement | null {
  let node: Node | null = direction === "prev" ? block.previousSibling : block.nextSibling;
  while (node) {
    if (node instanceof HTMLElement) {
      return node;
    }
    if ((node.textContent ?? "").trim()) {
      return null;
    }
    node = direction === "prev" ? node.previousSibling : node.nextSibling;
  }
  return null;
}

function placeCaretAtStart(el: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const caret = document.createRange();
  caret.setStart(el, 0);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
}

// Browsers merge blocks on Backspace/Delete using the FIRST block's tag, so
// deleting up to (or the blank line above) a heading silently demotes it to a
// paragraph. Intercept the cases where a heading would lose its tag and keep it.
export function guardHeadingMerge(event: { key: string; preventDefault: () => void }): boolean {
  if (event.key !== "Backspace" && event.key !== "Delete") {
    return false;
  }
  const surface = getBoundEditorSurface();
  const selection = window.getSelection();
  if (!surface || !selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.commonAncestorContainer)) {
    return false;
  }

  if (!range.collapsed) {
    // Selection spanning from a paragraph into a heading: the browser would
    // merge the heading's remainder into the paragraph. When the paragraph is
    // consumed entirely, delete manually and let the heading survive.
    const startBlock = nearestBlock(range.startContainer, surface);
    const endBlock = nearestBlock(range.endContainer, surface);
    if (!startBlock || !endBlock || startBlock === endBlock) {
      return false;
    }
    if (isHeadingElement(startBlock) || !isHeadingElement(endBlock)) {
      return false;
    }
    if (!rangeIsAtBlockEdge(startBlock, range.startContainer, range.startOffset, "start")) {
      return false;
    }
    event.preventDefault();
    snapshotStructuralChange();
    range.deleteContents();
    if (startBlock.isConnected && isEmptyBlock(startBlock)) {
      startBlock.remove();
    }
    if (endBlock.isConnected) {
      placeCaretAtStart(endBlock);
    }
    saveRichTextSelection();
    surface.dispatchEvent(new InputEvent("input", { bubbles: true }));
    recordFormat("headingMergeGuard", true, "kept heading through range delete");
    return true;
  }

  const block = nearestBlock(range.startContainer, surface);
  if (!block) {
    return false;
  }

  if (event.key === "Backspace") {
    // Backspace at the start of a heading with an empty paragraph above it:
    // remove the paragraph instead of merging the heading into it.
    if (!isHeadingElement(block)) {
      return false;
    }
    if (!rangeIsAtBlockEdge(block, range.startContainer, range.startOffset, "start")) {
      return false;
    }
    const prev = siblingElement(block, "prev");
    if (!prev || isHeadingElement(prev) || prev.tagName !== "P" || !isEmptyBlock(prev)) {
      return false;
    }
    event.preventDefault();
    snapshotStructuralChange();
    prev.remove();
    placeCaretAtStart(block);
    saveRichTextSelection();
    surface.dispatchEvent(new InputEvent("input", { bubbles: true }));
    recordFormat("headingMergeGuard", true, "removed empty paragraph above heading");
    return true;
  }

  // Forward Delete at the end of an empty paragraph right before a heading:
  // remove the paragraph instead of pulling the heading's text into it.
  if (block.tagName !== "P" || !isEmptyBlock(block)) {
    return false;
  }
  if (!rangeIsAtBlockEdge(block, range.endContainer, range.endOffset, "end")) {
    return false;
  }
  const next = siblingElement(block, "next");
  if (!next || !isHeadingElement(next)) {
    return false;
  }
  event.preventDefault();
  snapshotStructuralChange();
  placeCaretAtStart(next);
  block.remove();
  saveRichTextSelection();
  surface.dispatchEvent(new InputEvent("input", { bubbles: true }));
  recordFormat("headingMergeGuard", true, "removed empty paragraph before heading");
  return true;
}

// Single keydown entry point for editor surfaces: list Tab handling, Ctrl/Cmd+K
// for links, structural undo/redo, and the heading-merge guard.
export function handleEditorKeyDown(event: {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
}): boolean {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === "k") {
    event.preventDefault();
    openLinkEditor();
    return true;
  }
  if (mod && key === "z" && !event.shiftKey) {
    if (undoStructural()) {
      event.preventDefault();
      return true;
    }
    return false;
  }
  if (mod && (key === "y" || (key === "z" && event.shiftKey))) {
    if (redoStructural()) {
      event.preventDefault();
      return true;
    }
    return false;
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    return guardHeadingMerge(event);
  }
  return handleEditorTabKey(event);
}

export function performEditorUndo(): boolean {
  if (undoStructural()) {
    return true;
  }
  return applyEditorCommand("undo");
}

export function performEditorRedo(): boolean {
  if (redoStructural()) {
    return true;
  }
  return applyEditorCommand("redo");
}

// Outline H3s that appear before the document's first H2, mirroring how images
// missing alt text are outlined, so the heading-order issue points at the
// offending headings instead of leaving authors to hunt for them.
export function markHeadingOrderProblems(): number {
  let count = 0;
  let seenH2 = false;
  document.querySelectorAll<HTMLElement>(".wysiwyg-surface h2, .wysiwyg-surface h3").forEach((heading) => {
    if (heading.tagName === "H2") {
      seenH2 = true;
      heading.classList.remove("doc-heading--order-problem");
      return;
    }
    const problem = !seenH2;
    heading.classList.toggle("doc-heading--order-problem", problem);
    if (problem) {
      count += 1;
    }
  });
  return count;
}

export function insertEditorHtml(html: string): boolean {
  const ok = runEditorCommand("insertHTML", html);
  if (ok) {
    notifyMutation();
  }
  return ok;
}

export function insertEditorText(text: string): boolean {
  const ok = runEditorCommand("insertText", text);
  if (!ok) {
    recordFormat("insertText", false, "no-selection", "Click in the page body, then insert a symbol.");
    return false;
  }
  notifyMutation();
  recordFormat("insertText", true, text);
  return true;
}

// ---------------------------------------------------------------------------
// Paste & drop: keep the surface truthful. Clipboard HTML is run through the
// same sanitizer that runs on save, so what appears after pasting is exactly
// what will publish. Image data is uploaded to the asset library and inserted
// as a proper doc-image figure (with alt/align/size controls) instead of the
// browser's default bare <img>, which the sanitizer would silently drop.
// ---------------------------------------------------------------------------

const BLOCK_LEVEL_HTML = /<\/?(p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|blockquote|section|article|figure|pre)[\s>]/i;

function cleanClipboardHtml(html: string): string {
  if (BLOCK_LEVEL_HTML.test(html)) {
    return sanitizePageDocument(html);
  }
  return sanitizeRichText(html, { keepNotes: true });
}

async function uploadImageFigureHtml(file: File, kbId: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kbId", kbId);
  const res = await fetch("/api/admin/assets/images", { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? "Image upload failed.");
  }
  const payload = data as { asset?: { id?: string; title?: string }; url?: string };
  const block: ContentBlock = {
    blockId: `block-${crypto.randomUUID()}`,
    type: "image",
    assetId: payload.asset?.id,
    url: payload.url ?? undefined,
    alt: "",
    widthPercent: 100,
  };
  return blocksToDocumentHtml([block]);
}

async function insertImagesFromFiles(files: File[], kbId: string) {
  reportFormatIssue(files.length === 1 ? "Uploading pasted image…" : `Uploading ${files.length} pasted images…`);
  try {
    for (const file of files) {
      const html = await uploadImageFigureHtml(file, kbId);
      if (!insertEditorHtml(html)) {
        // Selection was lost while uploading — append at the end of the
        // surface rather than dropping an already-uploaded image.
        const surface = getBoundEditorSurface();
        if (surface) {
          surface.insertAdjacentHTML("beforeend", html);
          surface.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }
      }
    }
    onFormatIssue?.(null);
    recordFormat("pasteImage", true, `${files.length} uploaded`);
  } catch (caught) {
    recordFormat(
      "pasteImage",
      false,
      "upload-failed",
      caught instanceof Error ? caught.message : "Image upload failed. Try the Insert media button instead.",
    );
  }
}

export function handleEditorPaste(
  event: { clipboardData: DataTransfer | null; preventDefault: () => void },
  kbId: string,
): boolean {
  const clipboard = event.clipboardData;
  if (!clipboard) {
    return false;
  }
  const imageFiles = Array.from(clipboard.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length > 0) {
    event.preventDefault();
    saveRichTextSelection();
    void insertImagesFromFiles(imageFiles, kbId);
    return true;
  }
  const html = clipboard.getData("text/html");
  if (html && html.trim()) {
    event.preventDefault();
    saveRichTextSelection();
    const clean = cleanClipboardHtml(html);
    if (clean.trim()) {
      snapshotStructuralChange();
      runEditorCommand("insertHTML", clean);
      notifyMutation();
      recordFormat("pasteHtml", true, `${clean.length} chars sanitized`);
    }
    return true;
  }
  // Plain text: the browser's default insertion is already safe.
  return false;
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === "function") {
    return doc.caretRangeFromPoint(x, y);
  }
  const position = doc.caretPositionFromPoint?.(x, y);
  if (!position) {
    return null;
  }
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

export function handleEditorDrop(
  event: { dataTransfer: DataTransfer | null; clientX: number; clientY: number; preventDefault: () => void },
  kbId: string,
): boolean {
  const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (files.length === 0) {
    return false;
  }
  event.preventDefault();
  const range = caretRangeFromPoint(event.clientX, event.clientY);
  const selection = window.getSelection();
  if (range && selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  saveRichTextSelection();
  void insertImagesFromFiles(files, kbId);
  return true;
}

// Copy a shareable link to the heading the caret is in. Headings carry stable
// ids that double as public URL anchors.
export function copyHeadingAnchor(pageUrl?: string): boolean {
  const surface = getBoundEditorSurface();
  const selection = window.getSelection();
  if (!surface || !selection || selection.rangeCount === 0) {
    recordFormat("copyAnchor", false, "no-selection", "Click inside a heading, then copy its anchor link.");
    return false;
  }
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const heading = element?.closest("h2, h3") as HTMLElement | null;
  if (!heading || !surface.contains(heading)) {
    recordFormat("copyAnchor", false, "not-in-heading", "Click inside a heading, then copy its anchor link.");
    return false;
  }
  const id = heading.getAttribute("id") ?? heading.getAttribute("data-block-id");
  if (!id) {
    recordFormat("copyAnchor", false, "no-id", "This heading has no anchor yet — save the page first.");
    return false;
  }
  const link = `${pageUrl ?? ""}#${id}`;
  navigator.clipboard
    ?.writeText(link)
    .then(() => reportFormatIssue(`Anchor link copied: ${link}`))
    .catch(() => reportFormatIssue(`Anchor link (copy manually): ${link}`));
  recordFormat("copyAnchor", true, link);
  return true;
}

export function watchEditorSelectionForDebug(): () => void {
  if (!isPageEditorDebugEnabled()) {
    return () => {};
  }
  const onSelectionChange = () => saveRichTextSelection();
  document.addEventListener("selectionchange", onSelectionChange);
  return () => document.removeEventListener("selectionchange", onSelectionChange);
}

export interface EditorFormatting {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  orderedList: boolean;
  unorderedList: boolean;
  h2: boolean;
  h3: boolean;
  p: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  canIndentListItem: boolean;
  canOutdentListItem: boolean;
  inList: boolean;
  listLevel: number | null;
  listMarkerLabel: string | null;
  orderedListStart: number | null;
  surfaceKind: "document" | "none" | "table-cell";
}

export const EMPTY_EDITOR_FORMATTING: EditorFormatting = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  orderedList: false,
  unorderedList: false,
  h2: false,
  h3: false,
  p: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  canIndentListItem: false,
  canOutdentListItem: false,
  inList: false,
  listLevel: null,
  listMarkerLabel: null,
  orderedListStart: null,
  surfaceKind: "none",
};

export function queryEditorFormatting(): EditorFormatting {
  const surface = getBoundEditorSurface();
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const node = range?.commonAncestorContainer ?? null;
  const element = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
  const selectionInSurface = Boolean(surface && node && surface.contains(node));
  const li = surface && selectionInSurface ? listItemFromSelection(surface) : null;
  const surfaceKind = surface?.classList.contains("wysiwyg-table-cell")
    ? "table-cell"
    : surface
      ? "document"
      : "none";
  const commandState = (command: string) => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };
  const isBlock = (tag: string) => {
    return Boolean(selectionInSurface && element?.closest(tag));
  };

  return {
    bold: commandState("bold"),
    italic: commandState("italic"),
    underline: commandState("underline"),
    strikeThrough: commandState("strikeThrough"),
    orderedList: commandState("insertOrderedList"),
    unorderedList: commandState("insertUnorderedList"),
    h2: isBlock("h2"),
    h3: isBlock("h3"),
    p: isBlock("p") && !isBlock("h2") && !isBlock("h3") && !isBlock("li"),
    alignLeft: commandState("justifyLeft"),
    alignCenter: commandState("justifyCenter"),
    alignRight: commandState("justifyRight"),
    canIndentListItem: li ? canIndentListItem(li) : false,
    canOutdentListItem: li ? canOutdentListItem(li) : false,
    inList: Boolean(li),
    listLevel: li && surface ? listLevelForItem(li, surface) : null,
    listMarkerLabel: li && surface ? listMarkerLabelForItem(li, surface) : null,
    orderedListStart: surface ? orderedListStartFromSelection(surface) : null,
    surfaceKind,
  };
}

export { RICH_TEXT_FONT_FAMILIES, RICH_TEXT_FONT_SIZES };
