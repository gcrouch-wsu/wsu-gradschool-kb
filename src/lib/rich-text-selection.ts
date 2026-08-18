let savedRange: Range | null = null;
let savedEditable: HTMLElement | null = null;
let boundEditorSurface: HTMLElement | null = null;
export interface RichTextSelectionSnapshot {
  editable: HTMLElement;
  end: number;
  start: number;
}

let savedTextSelection: RichTextSelectionSnapshot | null = null;

function editableFromNode(node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.isContentEditable) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

export function getBoundEditorSurface(): HTMLElement | null {
  return boundEditorSurface;
}

export function bindEditorSurface(surface: HTMLElement | null) {
  boundEditorSurface = surface;
  if (!surface) {
    savedRange = null;
    savedEditable = null;
    savedTextSelection = null;
  }
}

function textOffsetForBoundary(root: HTMLElement, node: Node, offset: number): number | null {
  try {
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function saveTextSelection(range: Range, editable: HTMLElement) {
  const start = textOffsetForBoundary(editable, range.startContainer, range.startOffset);
  const end = textOffsetForBoundary(editable, range.endContainer, range.endOffset);
  if (start === null || end === null) {
    return;
  }
  savedTextSelection = { editable, start, end };
}

function textPositionForOffset(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let lastText: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    const length = text.data.length;
    if (remaining <= length) {
      return { node: text, offset: remaining };
    }
    remaining -= length;
    lastText = text;
    current = walker.nextNode();
  }
  if (lastText) {
    return { node: lastText, offset: lastText.data.length };
  }
  return { node: root, offset: root.childNodes.length };
}

export function restoreRichTextSelectionSnapshot(snapshot: RichTextSelectionSnapshot): boolean {
  if (!document.contains(snapshot.editable)) {
    return false;
  }
  if (boundEditorSurface && !boundEditorSurface.contains(snapshot.editable)) {
    return false;
  }
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }
  try {
    const range = document.createRange();
    const start = textPositionForOffset(snapshot.editable, snapshot.start);
    const end = textPositionForOffset(snapshot.editable, snapshot.end);
    snapshot.editable.focus({ preventScroll: true });
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
    savedEditable = snapshot.editable;
    savedTextSelection = snapshot;
    return true;
  } catch {
    return false;
  }
}

function restoreTextSelection(): boolean {
  return savedTextSelection ? restoreRichTextSelectionSnapshot(savedTextSelection) : false;
}

export function saveRichTextSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (boundEditorSurface && !boundEditorSurface.contains(range.commonAncestorContainer)) {
    return;
  }
  const editable = editableFromNode(range.commonAncestorContainer);
  if (!editable) {
    return;
  }
  savedRange = range.cloneRange();
  savedEditable = editable;
  saveTextSelection(range, editable);
}

export function captureRichTextSelectionSnapshot(): RichTextSelectionSnapshot | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (boundEditorSurface && !boundEditorSurface.contains(range.commonAncestorContainer)) {
    return null;
  }
  const editable = editableFromNode(range.commonAncestorContainer);
  if (!editable) {
    return null;
  }
  const start = textOffsetForBoundary(editable, range.startContainer, range.startOffset);
  const end = textOffsetForBoundary(editable, range.endContainer, range.endOffset);
  if (start === null || end === null) {
    return null;
  }
  return { editable, start, end };
}

export function restoreRichTextSelection(): boolean {
  const rangeToRestore =
    savedRange &&
    savedEditable &&
    document.contains(savedEditable) &&
    (!boundEditorSurface || boundEditorSurface.contains(savedRange.startContainer))
      ? savedRange
      : null;
  const editableToRestore = rangeToRestore ? savedEditable : null;
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }
  if (rangeToRestore && editableToRestore) {
    try {
      editableToRestore.focus({ preventScroll: true });
      selection.removeAllRanges();
      selection.addRange(rangeToRestore);
      return true;
    } catch {
      // Fall back to text offsets below; Lexical can replace selected text nodes
      // while preserving the visible text, which invalidates the stored Range.
    }
  }
  return restoreTextSelection();
}

export function applyToRichTextSelection(run: () => void): boolean {
  if (!restoreRichTextSelection()) {
    return false;
  }
  run();
  savedEditable?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  savedEditable?.focus({ preventScroll: true });
  return true;
}

export function runEditorCommand(command: string, value?: string): boolean {
  return applyToRichTextSelection(() => {
    document.execCommand(command, false, value);
  });
}
