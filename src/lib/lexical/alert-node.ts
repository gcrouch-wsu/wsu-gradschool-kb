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
import { ElementNode } from "lexical";

export type SerializedAlertNode = Spread<
  { type: "alert"; version: 1; blockId?: string },
  SerializedElementNode
>;

function convertAlertElement(domNode: HTMLElement): DOMConversionOutput | null {
  const blockId = domNode.getAttribute("data-block-id") ?? undefined;
  return { node: $createAlertNode(blockId) };
}

export class AlertNode extends ElementNode {
  __blockId?: string;

  static getType(): string {
    return "alert";
  }

  static clone(node: AlertNode): AlertNode {
    return new AlertNode(node.__blockId, node.__key);
  }

  constructor(blockId?: string, key?: NodeKey) {
    super(key);
    this.__blockId = blockId;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const aside = document.createElement("aside");
    aside.className = "doc-alert doc-alert--info";
    aside.setAttribute("role", "note");
    aside.setAttribute("data-variant", "info");
    aside.setAttribute("data-lexical-alert", "true");
    if (this.__blockId) {
      aside.setAttribute("data-block-id", this.__blockId);
    }
    return aside;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const aside = document.createElement("aside");
    aside.className = "doc-alert doc-alert--info";
    aside.setAttribute("role", "note");
    aside.setAttribute("data-variant", "info");
    if (this.__blockId) {
      aside.setAttribute("data-block-id", this.__blockId);
    }
    return { element: aside };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      aside: (node) => {
        if (node instanceof HTMLElement && node.classList.contains("doc-alert")) {
          return { conversion: convertAlertElement, priority: 3 };
        }
        return null;
      },
    };
  }

  static importJSON(serialized: SerializedAlertNode): AlertNode {
    return $createAlertNode(serialized.blockId);
  }

  exportJSON(): SerializedAlertNode {
    return {
      ...super.exportJSON(),
      type: "alert",
      version: 1,
      blockId: this.__blockId,
    };
  }

  isInline(): false {
    return false;
  }

  canBeEmpty(): boolean {
    return true;
  }

  isShadowRoot(): boolean {
    return true;
  }
}

export function $createAlertNode(blockId?: string): AlertNode {
  return new AlertNode(blockId);
}

export function $isAlertNode(node: LexicalNode | null | undefined): node is AlertNode {
  return node instanceof AlertNode;
}
