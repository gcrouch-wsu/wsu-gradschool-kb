"use client";

import { $isTextNode, TextNode, type DOMExportOutput, type DOMExportOutputMap, type LexicalEditor, type LexicalNode } from "lexical";
import { canonicalInlineStyle } from "@/lib/rich-text";

function styledTextTarget(element: HTMLElement): HTMLElement {
  if (element.tagName.toLowerCase() === "span") {
    return element;
  }
  return element.querySelector("span") ?? element;
}

function exportTextNodeWithInlineStyle(editor: LexicalEditor, node: LexicalNode): DOMExportOutput {
  if (!$isTextNode(node)) {
    return { element: null };
  }
  const output = node.exportDOM(editor);
  const style = canonicalInlineStyle(node.getStyle());
  if (!style || !(output.element instanceof HTMLElement)) {
    return output;
  }
  styledTextTarget(output.element).setAttribute("style", style);
  return output;
}

const exportMap: DOMExportOutputMap = new Map([[TextNode, exportTextNodeWithInlineStyle]]);

export const lexicalHtmlConfig = {
  export: exportMap,
};
