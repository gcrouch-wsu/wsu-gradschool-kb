import { isPageEditorDebugEnabled, publishPageEditorDebug } from "@/lib/page-editor-debug";
import {
  indentListItem,
  listItemFromSelection,
  orderedListFromSelection,
  orderedListStartFromSelection,
  outdentListItem,
  setOrderedListStart,
  suggestedOrderedListStart,
} from "@/lib/page-editor-list";
import { escapeHtml, RICH_TEXT_FONT_FAMILIES, RICH_TEXT_FONT_SIZES } from "@/lib/rich-text";
import {
  applyToRichTextSelection,
  bindEditorSurface,
  getBoundEditorSurface,
  restoreRichTextSelection,
  runEditorCommand,
  saveRichTextSelection,
} from "@/lib/rich-text-selection";

let onDocumentMutate: (() => void) | null = null;
let onFormatIssue: ((message: string | null) => void) | null = null;

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
}

export function bindPageEditor(surface: HTMLElement | null, onMutate: () => void) {
  bindEditorSurface(surface);
  onDocumentMutate = onMutate;
  publishPageEditorDebug({
    lastAction: surface ? "bind" : "unbind",
    lastResult: "ok",
    lastDetail: surface ? "editor surface attached" : "detached",
  });
}

export function registerFormatIssueReporter(report: (message: string | null) => void) {
  onFormatIssue = report;
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

export function openLinkEditor(anchor?: HTMLAnchorElement | null) {
  saveRichTextSelection();
  const target = anchor ?? anchorFromSelection();
  const selectionText = window.getSelection()?.toString() ?? "";
  linkEditorOpener?.({
    url: target?.getAttribute("href") ?? "",
    text: target ? target.textContent ?? "" : selectionText,
    newTab: target?.getAttribute("target") === "_blank",
    isEdit: Boolean(target),
    anchor: target ?? null,
  });
}

function persistFromAnchor(anchor: HTMLElement) {
  const surface = anchor.closest(".wysiwyg-surface") as HTMLElement | null;
  surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  notifyMutation();
}

export function commitLink(request: {
  url: string;
  text: string;
  newTab: boolean;
  anchor: HTMLAnchorElement | null;
}): boolean {
  const url = request.url.trim();
  if (!url) {
    return false;
  }
  const text = request.text.trim();

  if (request.anchor) {
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
  if (!list || !setOrderedListStart(list, start)) {
    recordFormat("listStart", false, "not-in-ordered-list", "Place the cursor in a numbered list first.");
    return false;
  }
  surface.dispatchEvent(new InputEvent("input", { bubbles: true }));
  notifyMutation();
  recordFormat("listStart", true, String(start));
  return true;
}

function mutateListItem(li: HTMLLIElement, action: "indent" | "outdent"): boolean {
  const changed = action === "indent" ? indentListItem(li) : outdentListItem(li);
  if (!changed) {
    recordFormat(action, false, "cannot-nest", "Cannot indent/outdent this line further.");
    return false;
  }
  const surface = li.closest(".wysiwyg-surface");
  surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  notifyMutation();
  recordFormat(action, true, "dom");
  return true;
}

export function applyIndent(): boolean {
  const surface = getBoundEditorSurface();
  if (!surface) {
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

export function insertEditorHtml(html: string): boolean {
  const ok = runEditorCommand("insertHTML", html);
  if (ok) {
    notifyMutation();
  }
  return ok;
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
  orderedListStart: number | null;
}

export function queryEditorFormatting(): EditorFormatting {
  const isBlock = (tag: string) => {
    const surface = getBoundEditorSurface();
    if (!surface) return false;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const node = selection.getRangeAt(0).commonAncestorContainer;
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    return !!element?.closest(tag);
  };

  return {
    bold: document.queryCommandState("bold"),
    italic: document.queryCommandState("italic"),
    underline: document.queryCommandState("underline"),
    strikeThrough: document.queryCommandState("strikeThrough"),
    orderedList: document.queryCommandState("insertOrderedList"),
    unorderedList: document.queryCommandState("insertUnorderedList"),
    h2: isBlock("h2"),
    h3: isBlock("h3"),
    p: isBlock("p") && !isBlock("h2") && !isBlock("h3") && !isBlock("li"),
    alignLeft: document.queryCommandState("justifyLeft"),
    alignCenter: document.queryCommandState("justifyCenter"),
    alignRight: document.queryCommandState("justifyRight"),
    orderedListStart: (() => {
      const surface = getBoundEditorSurface();
      return surface ? orderedListStartFromSelection(surface) : null;
    })(),
  };
}

export { RICH_TEXT_FONT_FAMILIES, RICH_TEXT_FONT_SIZES };
