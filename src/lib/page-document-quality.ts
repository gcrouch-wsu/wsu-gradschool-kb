import { parse, type HTMLElement, type Node } from "node-html-parser";
import { richTextToPlainText, sanitizeListItemHtml, sanitizeRichText, textToRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

export type DocumentQualityIssueCode =
  | "blank-spacer-paragraph"
  | "bold-paragraph-heading"
  | "duplicated-text"
  | "dense-nested-list"
  | "field-value-list";

export interface DocumentQualityIssue {
  code: DocumentQualityIssueCode;
  blockId: string;
  fixable: boolean;
  id: string;
  message: string;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isElement(node: Node): node is HTMLElement {
  return (node as HTMLElement).tagName !== undefined && (node as HTMLElement).tagName !== null;
}

function isMeaningfulNode(node: Node) {
  if (!isElement(node)) {
    return Boolean(collapseWhitespace(node.text ?? ""));
  }
  const tag = node.tagName?.toLowerCase();
  if (tag === "br") {
    return false;
  }
  return Boolean(collapseWhitespace(node.text ?? "") || node.querySelector("img, table, ul, ol"));
}

function plainRichText(html: string | undefined, fallback = "") {
  return collapseWhitespace(richTextToPlainText(html ?? "") || fallback);
}

function isBreakOnlyRichText(html: string | undefined) {
  return !html || html.replace(/<br\s*\/?>/gi, "").replace(/&nbsp;|\u00a0/g, "").trim() === "";
}

export function isBlankParagraphBlock(block: ContentBlock): boolean {
  if (block.type !== "paragraph") {
    return false;
  }
  return !collapseWhitespace(block.text) && isBreakOnlyRichText(block.html);
}

function paragraphText(block: Extract<ContentBlock, { type: "paragraph" }>) {
  return plainRichText(block.html, block.text);
}

function blockText(block: ContentBlock): string {
  switch (block.type) {
    case "paragraph":
      return paragraphText(block);
    case "heading":
      return plainRichText(block.html, block.text);
    case "alert":
      return plainRichText(block.html, block.text);
    case "list":
      return block.items.join(" ");
    case "table":
      return block.rows.flat().join(" ");
    case "card":
      return [block.title ?? "", ...block.blocks.map(blockText)].join(" ");
    case "procedure_section":
      return [block.title, ...block.blocks.map(blockText)].join(" ");
    case "sourced":
      return block.blocks.map(blockText).join(" ");
    default:
      return "";
  }
}

function isBoldOnlyParagraph(block: Extract<ContentBlock, { type: "paragraph" }>) {
  const clean = sanitizeRichText(block.html ?? textToRichText(block.text)).trim();
  const text = paragraphText(block);
  if (text.length < 3 || text.length > 90 || /[.!?]$/.test(text)) {
    return false;
  }
  const root = parse(clean);
  const meaningful = root.childNodes.filter(isMeaningfulNode);
  if (meaningful.length !== 1 || !isElement(meaningful[0])) {
    return false;
  }
  return meaningful[0].tagName?.toLowerCase() === "strong";
}

function hasRepeatedFullText(text: string) {
  const normalized = collapseWhitespace(text);
  if (normalized.length < 48 || normalized.length % 2 !== 0) {
    return false;
  }
  const midpoint = normalized.length / 2;
  return normalized.slice(0, midpoint) === normalized.slice(midpoint);
}

function leadingTextBeforeNestedList(html: string) {
  const root = parse(`<li>${sanitizeListItemHtml(html, { keepNotes: true })}</li>`);
  const li = root.querySelector("li");
  if (!li) {
    return "";
  }
  const parts: string[] = [];
  for (const child of li.childNodes) {
    if (isElement(child) && /^(ul|ol)$/i.test(child.tagName ?? "")) {
      break;
    }
    parts.push(isElement(child) ? child.text : child.text ?? "");
  }
  return collapseWhitespace(parts.join(" "));
}

function nestedListIssue(block: Extract<ContentBlock, { type: "list" }>) {
  const itemHtml = block.itemHtml ?? block.items.map(textToRichText);
  return itemHtml.some((html) => {
    if (!/<(?:ul|ol)\b/i.test(html)) {
      return false;
    }
    const lead = leadingTextBeforeNestedList(html);
    const fieldLabels = lead.match(/\b[A-Z][A-Za-z /-]{1,40}:/g) ?? [];
    return lead.length > 140 || fieldLabels.length >= 2;
  });
}

function isFieldValueItem(text: string) {
  const clean = collapseWhitespace(text);
  return /^[A-Za-z][A-Za-z0-9 /()&-]{1,48}:\s+\S/.test(clean);
}

function fieldValueListIssue(block: Extract<ContentBlock, { type: "list" }>) {
  return block.items.filter(isFieldValueItem).length >= 4;
}

function issue(id: string, blockId: string, code: DocumentQualityIssueCode, message: string, fixable = false) {
  return { blockId, code, fixable, id, message };
}

function analyzeBlock(block: ContentBlock, path: string): DocumentQualityIssue[] {
  const issues: DocumentQualityIssue[] = [];
  if (isBlankParagraphBlock(block)) {
    issues.push(
      issue(
        `${path}:blank`,
        block.blockId,
        "blank-spacer-paragraph",
        "Blank paragraph spacer creates extra vertical spacing. Use the document's normal block spacing instead.",
        true,
      ),
    );
    return issues;
  }

  const text = blockText(block);
  if (hasRepeatedFullText(text)) {
    issues.push(
      issue(`${path}:duplicate`, block.blockId, "duplicated-text", "This block looks like it contains duplicated text."),
    );
  }

  if (block.type === "paragraph" && isBoldOnlyParagraph(block)) {
    issues.push(
      issue(
        `${path}:bold-heading`,
        block.blockId,
        "bold-paragraph-heading",
        "This short bold paragraph looks like a section heading. Convert it to H2 or H3 if it starts a section.",
      ),
    );
  }

  if (block.type === "list") {
    if (nestedListIssue(block)) {
      issues.push(
        issue(
          `${path}:dense-nested-list`,
          block.blockId,
          "dense-nested-list",
          "This nested list item mixes a long parent item with child bullets. Split the parent text or use a field/value table.",
        ),
      );
    }
    if (fieldValueListIssue(block)) {
      issues.push(
        issue(
          `${path}:field-value-list`,
          block.blockId,
          "field-value-list",
          "This list looks like field/value data. A table may read more cleanly than bullets.",
        ),
      );
    }
  }

  if (block.type === "card" || block.type === "procedure_section" || block.type === "sourced") {
    block.blocks.forEach((child, index) => issues.push(...analyzeBlock(child, `${path}.${index}`)));
  }

  return issues;
}

export function analyzeDocumentQuality(blocks: ContentBlock[]) {
  return blocks.flatMap((block, index) => analyzeBlock(block, String(index)));
}

export function cleanDocumentLayout(blocks: ContentBlock[]): ContentBlock[] {
  const cleaned: ContentBlock[] = [];
  for (const block of blocks) {
    if (isBlankParagraphBlock(block)) {
      continue;
    }
    if (block.type === "card" || block.type === "procedure_section" || block.type === "sourced") {
      cleaned.push({ ...block, blocks: cleanDocumentLayout(block.blocks) });
      continue;
    }
    cleaned.push(block);
  }
  return cleaned.length > 0 ? cleaned : blocks.slice(0, 1);
}
