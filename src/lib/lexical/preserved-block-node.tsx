"use client";

import type { JSX } from "react";
import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";

export type SerializedPreservedBlockNode = Spread<
  { html: string; type: "preserved-block"; version: 1 },
  SerializedLexicalNode
>;

function convertPreservedElement(domNode: HTMLElement): DOMConversionOutput | null {
  const html = domNode.outerHTML;
  if (!html.trim()) {
    return null;
  }
  return { node: $createPreservedBlockNode(html) };
}

export class PreservedBlockNode extends DecoratorNode<JSX.Element> {
  __html: string;

  static getType(): string {
    return "preserved-block";
  }

  static clone(node: PreservedBlockNode): PreservedBlockNode {
    return new PreservedBlockNode(node.__html, node.__key);
  }

  constructor(html: string, key?: NodeKey) {
    super(key);
    this.__html = html;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("div");
    span.className = "lexical-preserved-block";
    span.contentEditable = "false";
    span.setAttribute("data-lexical-preserved", "true");
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const template = document.createElement("template");
    template.innerHTML = this.__html.trim();
    const element = template.content.firstElementChild as HTMLElement | null;
    return { element: element ?? document.createElement("div") };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      figure: (node) => {
        if (node instanceof HTMLElement && node.classList.contains("doc-image")) {
          return {
            conversion: convertPreservedElement,
            priority: 4,
          };
        }
        return null;
      },
      div: (node) => {
        if (node instanceof HTMLElement && node.classList.contains("doc-section-break")) {
          return {
            conversion: convertPreservedElement,
            priority: 4,
          };
        }
        return null;
      },
    };
  }

  static importJSON(serialized: SerializedPreservedBlockNode): PreservedBlockNode {
    return $createPreservedBlockNode(serialized.html);
  }

  exportJSON(): SerializedPreservedBlockNode {
    return {
      html: this.__html,
      type: "preserved-block",
      version: 1,
    };
  }

  isInline(): false {
    return false;
  }

  getHtml(): string {
    return this.__html;
  }

  setHtml(html: string): void {
    const writable = this.getWritable();
    writable.__html = html;
  }

  decorate(): JSX.Element {
    return (
      <div
        className="lexical-preserved-block__inner"
        // Structural editor HTML (images) round-tripped via page-document.
        dangerouslySetInnerHTML={{ __html: this.__html }}
        contentEditable={false}
      />
    );
  }
}

export function $createPreservedBlockNode(html: string): PreservedBlockNode {
  return new PreservedBlockNode(html);
}

export function $isPreservedBlockNode(node: LexicalNode | null | undefined): node is PreservedBlockNode {
  return node instanceof PreservedBlockNode;
}
