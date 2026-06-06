/** Selection + formatting for contenteditable surfaces (page editor, table cells). */

let savedRange: Range | null = null;
let savedEditable: HTMLElement | null = null;
let boundEditorSurface: HTMLElement | null = null;

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
  }
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
}

export function restoreRichTextSelection(): boolean {
  if (!savedRange || !savedEditable || !document.contains(savedEditable)) {
    console.warn("restoreRichTextSelection fail: missing state", {
      hasRange: !!savedRange,
      hasEditable: !!savedEditable,
      inDoc: savedEditable ? document.contains(savedEditable) : false,
    });
    return false;
  }
  if (boundEditorSurface && !boundEditorSurface.contains(savedRange.startContainer)) {
    console.warn("restoreRichTextSelection fail: range outside bound surface");
    return false;
  }
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }
  try {
    savedEditable.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(savedRange);
    return true;
  } catch (err) {
    console.warn("restoreRichTextSelection fail: addRange error", err);
    return false;
  }
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
