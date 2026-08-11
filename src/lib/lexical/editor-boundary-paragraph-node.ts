"use client";

import {
  $applyNodeReplacement,
  ParagraphNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedParagraphNode,
  type Spread,
} from "lexical";

export type SerializedEditorBoundaryParagraphNode = Spread<
  { type: "editor-boundary-paragraph"; version: 1 },
  SerializedParagraphNode
>;

export class EditorBoundaryParagraphNode extends ParagraphNode {
  static getType(): string {
    return "editor-boundary-paragraph";
  }

  static clone(node: EditorBoundaryParagraphNode): EditorBoundaryParagraphNode {
    return new EditorBoundaryParagraphNode(node.__key);
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    element.setAttribute("data-editor-boundary", "true");
    return element;
  }

  updateDOM(prevNode: ParagraphNode, dom: HTMLElement, config: EditorConfig): boolean {
    const changed = super.updateDOM(prevNode, dom, config);
    dom.setAttribute("data-editor-boundary", "true");
    return changed;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor);
    if (output.element instanceof HTMLElement) {
      output.element.setAttribute("data-editor-boundary", "true");
    }
    return output;
  }

  static importJSON(serialized: SerializedEditorBoundaryParagraphNode): EditorBoundaryParagraphNode {
    return $createEditorBoundaryParagraphNode().updateFromJSON(serialized);
  }

  exportJSON(): SerializedEditorBoundaryParagraphNode {
    return {
      ...super.exportJSON(),
      type: "editor-boundary-paragraph",
      version: 1,
    };
  }
}

export function $createEditorBoundaryParagraphNode(): EditorBoundaryParagraphNode {
  return $applyNodeReplacement(new EditorBoundaryParagraphNode());
}

export function $isEditorBoundaryParagraphNode(
  node: LexicalNode | null | undefined,
): node is EditorBoundaryParagraphNode {
  return node instanceof EditorBoundaryParagraphNode;
}
