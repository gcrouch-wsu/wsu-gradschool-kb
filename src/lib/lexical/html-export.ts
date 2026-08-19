"use client";

import {
  $isTextNode,
  TextNode,
  type DOMConversion,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type DOMExportOutputMap,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
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

/**
 * Read inline colour/font styles back out of stored HTML.
 *
 * Lexical's own importer does not carry a `style` attribute onto the text nodes it
 * creates, so without this the export map above had no counterpart: applying a colour
 * looked right, saved right, and rendered right on the public page, but the colour was
 * gone the next time the page was opened in the editor. Bold survived (Lexical imports
 * `<strong>` as a format), which is why it read as "you can have colour or bold, not both".
 */
function convertStyledSpan(element: HTMLElement): DOMConversionOutput {
  const style = canonicalInlineStyle(element.getAttribute("style") ?? undefined);
  return {
    forChild: (child) => {
      // Only fill a gap: a nested span carrying its own style is more specific.
      if (style && $isTextNode(child) && !child.getStyle()) {
        child.setStyle(style);
      }
      return child;
    },
    node: null,
  };
}

const importMap: DOMConversionMap = {
  span: (node: Node): DOMConversion | null => {
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    // No safe style to carry: fall through to Lexical's own span handling
    // (Google Docs bold detection, note spans, plain wrappers).
    if (!canonicalInlineStyle(node.getAttribute("style") ?? undefined)) {
      return null;
    }
    return { conversion: convertStyledSpan, priority: 2 };
  },
};

export const lexicalHtmlConfig = {
  export: exportMap,
  import: importMap,
};
