"use client";

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from "lexical";
import { $applyNodeReplacement, ElementNode } from "lexical";

export type SerializedNoteNode = Spread<
  {
    type: "doc-note";
    version: 1;
    noteId: string;
    noteBody: string;
    point: boolean;
  },
  SerializedElementNode
>;

function convertNoteElement(domNode: HTMLElement): DOMConversionOutput | null {
  const noteId = domNode.getAttribute("data-note-id") ?? "";
  const noteBody = domNode.getAttribute("data-note-body") ?? "";
  const point = domNode.classList.contains("doc-note--point");
  const node = $createNoteNode({ noteId, noteBody, point });
  return { node };
}

export class NoteNode extends ElementNode {
  __noteId: string;
  __noteBody: string;
  __point: boolean;

  static getType(): string {
    return "doc-note";
  }

  static clone(node: NoteNode): NoteNode {
    return new NoteNode(
      { noteId: node.__noteId, noteBody: node.__noteBody, point: node.__point },
      node.__key,
    );
  }

  constructor(
    input: { noteId: string; noteBody: string; point: boolean },
    key?: NodeKey,
  ) {
    super(key);
    this.__noteId = input.noteId;
    this.__noteBody = input.noteBody;
    this.__point = input.point;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.className = this.__point ? "doc-note doc-note--point" : "doc-note";
    if (this.__noteId) {
      span.setAttribute("data-note-id", this.__noteId);
    }
    span.setAttribute("data-note-body", this.__noteBody);
    return span;
  }

  updateDOM(prev: NoteNode, dom: HTMLElement): boolean {
    if (prev.__noteBody !== this.__noteBody || prev.__noteId !== this.__noteId || prev.__point !== this.__point) {
      dom.className = this.__point ? "doc-note doc-note--point" : "doc-note";
      if (this.__noteId) {
        dom.setAttribute("data-note-id", this.__noteId);
      } else {
        dom.removeAttribute("data-note-id");
      }
      dom.setAttribute("data-note-body", this.__noteBody);
    }
    return false;
  }

  exportDOM(): DOMExportOutput {
    return { element: this.createDOM({} as EditorConfig) };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (node) => {
        if (node instanceof HTMLElement && node.classList.contains("doc-note")) {
          return { conversion: convertNoteElement, priority: 3 };
        }
        return null;
      },
    };
  }

  static importJSON(serialized: SerializedNoteNode): NoteNode {
    return $createNoteNode(serialized);
  }

  exportJSON(): SerializedNoteNode {
    return {
      ...super.exportJSON(),
      type: "doc-note",
      version: 1,
      noteId: this.__noteId,
      noteBody: this.__noteBody,
      point: this.__point,
    };
  }

  isInline(): true {
    return true;
  }

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }
}

export function $createNoteNode(input: {
  noteId: string;
  noteBody: string;
  point: boolean;
}): NoteNode {
  return $applyNodeReplacement(new NoteNode(input));
}

export function $isNoteNode(node: LexicalNode | null | undefined): node is NoteNode {
  return node instanceof NoteNode;
}
