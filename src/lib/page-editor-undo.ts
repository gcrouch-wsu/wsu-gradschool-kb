import { getBoundEditorSurface } from "@/lib/rich-text-selection";

// Structural editor operations (list indent, image controls, alt text, the
// heading-merge guard, link commits) mutate the DOM directly, which the
// browser's native undo stack cannot see. This module keeps lightweight
// innerHTML snapshots so Ctrl+Z right after a structural change restores the
// surface instead of native undo skipping it or restoring stale content.
// Typing resets the "structural tail" so ordinary undo keeps handling text.

interface Snapshot {
  surface: HTMLElement;
  html: string;
}

const MAX_SNAPSHOTS = 50;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
// How many consecutive structural changes happened since the last typing
// input. Only that many custom undos are performed before deferring to the
// browser again.
let structuralTail = 0;

// Pass `preHtml` when the DOM has already been mutated and the pre-change
// markup was captured beforehand.
export function snapshotStructuralChange(preHtml?: string) {
  const surface = getBoundEditorSurface();
  if (!surface) {
    return;
  }
  undoStack.push({ surface, html: preHtml ?? surface.innerHTML });
  if (undoStack.length > MAX_SNAPSHOTS) {
    undoStack.shift();
  }
  redoStack.length = 0;
  structuralTail += 1;
}

// Call with the native InputEvent's inputType: real user edits (typing,
// native deletes, execCommand) carry an inputType, while the synthetic input
// events dispatched after DOM surgery do not.
export function noteEditorInput(event: { inputType?: string }) {
  if (event.inputType) {
    structuralTail = 0;
  }
}

function applySnapshot(from: Snapshot[], to: Snapshot[]): boolean {
  const surface = getBoundEditorSurface();
  const top = from[from.length - 1];
  if (!top || !surface || top.surface !== surface || !surface.isConnected) {
    return false;
  }
  from.pop();
  to.push({ surface, html: surface.innerHTML });
  surface.innerHTML = top.html;
  surface.focus({ preventScroll: true });
  surface.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}

export function undoStructural(): boolean {
  if (structuralTail === 0) {
    return false;
  }
  const ok = applySnapshot(undoStack, redoStack);
  if (ok) {
    structuralTail -= 1;
  }
  return ok;
}

export function redoStructural(): boolean {
  const ok = applySnapshot(redoStack, undoStack);
  if (ok) {
    structuralTail += 1;
  }
  return ok;
}
