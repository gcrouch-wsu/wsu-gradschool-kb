import { escapeHtml } from "@/lib/rich-text";
import type { ParsedDocx } from "@/lib/docx-import";
import type { ContentBlock } from "@/lib/types";

const BULLET_PATTERN = /^\s*(?:[-*•·‣▪◦]|\u2022)\s+(.*)$/;
const ORDERED_PATTERN = /^\s*\d+[.)]\s+(.*)$/;

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u00a0/g, " ");
}

function toParagraphChunks(normalized: string): string[] {
  const blankLineSplit = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  if (blankLineSplit.length > 1) {
    return blankLineSplit;
  }

  return normalized
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function collapseInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Converts extracted plain text (from a legacy .doc file) into content blocks. Since
 * these formats give us no reliable structure, we heuristically detect simple
 * bullet/numbered lists and treat every other chunk as a paragraph.
 */
export function convertPlainTextToBlocks(rawText: string, fallbackTitle: string): ParsedDocx {
  const normalized = normalizeText(rawText ?? "");
  const chunks = toParagraphChunks(normalized);

  const blocks: ContentBlock[] = [];
  const messages: string[] = [];
  let title: string | null = null;
  let index = 0;
  const nextId = (prefix: string) => `${prefix}-${index++}`;

  let pendingList: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!pendingList || pendingList.items.length === 0) {
      pendingList = null;
      return;
    }
    blocks.push({
      blockId: nextId("list"),
      type: "list",
      ordered: pendingList.ordered,
      items: pendingList.items,
      itemHtml: pendingList.items.map((item) => escapeHtml(item)),
    });
    pendingList = null;
  };

  for (const chunk of chunks) {
    const bulletMatch = BULLET_PATTERN.exec(chunk);
    const orderedMatch = bulletMatch ? null : ORDERED_PATTERN.exec(chunk);

    if (bulletMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const itemText = collapseInline((bulletMatch ?? orderedMatch)![1]);
      if (!itemText) {
        continue;
      }
      if (!pendingList || pendingList.ordered !== ordered) {
        flushList();
        pendingList = { ordered, items: [] };
      }
      pendingList.items.push(itemText);
      continue;
    }

    flushList();

    const text = collapseInline(chunk);
    if (!text) {
      continue;
    }

    if (title === null) {
      title = text.slice(0, 200);
      continue;
    }

    blocks.push({ blockId: nextId("paragraph"), type: "paragraph", text, html: escapeHtml(text) });
  }

  flushList();

  if (title === null) {
    title = fallbackTitle.trim() || null;
  }

  if (blocks.length === 0) {
    messages.push("No readable text was found in this file. It may be scanned images or otherwise not text-based.");
  }

  return { title, blocks, messages };
}
