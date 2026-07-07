import type { ContentBlock } from "@/lib/types";

function closestListItem(node: Node): HTMLLIElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLLIElement) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

export function listItemFromSelection(surface: HTMLElement): HTMLLIElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const li = closestListItem(selection.getRangeAt(0).startContainer);
  if (!li || !surface.contains(li)) {
    return null;
  }
  return li;
}

export function orderedListFromSelection(surface: HTMLElement): HTMLOListElement | null {
  const li = listItemFromSelection(surface);
  const list = li?.closest("ol");
  return list instanceof HTMLOListElement && surface.contains(list) ? list : null;
}

export function orderedListStartFromSelection(surface: HTMLElement): number | null {
  const list = orderedListFromSelection(surface);
  if (!list) {
    return null;
  }
  return Number(list.getAttribute("start")) || 1;
}

function orderedListEnd(list: HTMLOListElement): number {
  const start = Number(list.getAttribute("start")) || 1;
  return start + Math.max(0, list.querySelectorAll(":scope > li").length - 1);
}

export function suggestedOrderedListStart(list: HTMLOListElement): number | null {
  let previous = list.previousElementSibling;
  while (previous) {
    if (previous instanceof HTMLOListElement) {
      return orderedListEnd(previous) + 1;
    }
    if (previous instanceof HTMLElement && previous.textContent?.trim()) {
      return null;
    }
    previous = previous.previousElementSibling;
  }
  return null;
}

export function setOrderedListStart(list: HTMLOListElement, start: number): boolean {
  if (!Number.isFinite(start) || start < 1) {
    return false;
  }
  const value = Math.max(1, Math.floor(start));
  if (value === 1) {
    list.removeAttribute("start");
  } else {
    list.setAttribute("start", String(value));
  }
  return true;
}

export function indentListItem(li: HTMLLIElement): boolean {
  const parentList = li.parentElement;
  if (!parentList || (parentList.tagName !== "UL" && parentList.tagName !== "OL")) {
    return false;
  }

  const previous = li.previousElementSibling;
  if (previous instanceof HTMLLIElement) {
    let nested = previous.querySelector(":scope > ul, :scope > ol");
    if (!(nested instanceof HTMLElement)) {
      nested = document.createElement(parentList.tagName);
      previous.appendChild(nested);
    }
    nested.appendChild(li);
    return true;
  }

  // The first item has no previous sibling to nest under; indenting it would
  // produce list markup with no parent item (invalid HTML that the sanitizer
  // strips, losing the text). Match Word/Docs behavior: not allowed.
  return false;
}

export function outdentListItem(li: HTMLLIElement): boolean {
  const parentList = li.parentElement;
  if (!parentList || (parentList.tagName !== "UL" && parentList.tagName !== "OL")) {
    return false;
  }

  const parentLi = parentList.parentElement;
  if (!(parentLi instanceof HTMLLIElement)) {
    return false;
  }

  const outerList = parentLi.parentElement;
  if (!outerList || (outerList.tagName !== "UL" && outerList.tagName !== "OL")) {
    return false;
  }

  outerList.insertBefore(li, parentLi.nextSibling);
  if (parentList.childElementCount === 0) {
    parentList.remove();
  }
  return true;
}

export type EditorSection =
  | { type: "flow"; blocks: ContentBlock[] }
  | { type: "table"; block: Extract<ContentBlock, { type: "table" }> }
  | { type: "asset_link"; block: Extract<ContentBlock, { type: "asset_link" }> }
  | { type: "card"; block: Extract<ContentBlock, { type: "card" }> }
  | { type: "procedure_section"; block: Extract<ContentBlock, { type: "procedure_section" }> }
  | { type: "video"; block: Extract<ContentBlock, { type: "video" }> }
  | { type: "section_divider"; block: Extract<ContentBlock, { type: "section_divider" }> };

export function blocksToSections(blocks: ContentBlock[]): EditorSection[] {
  const sections: EditorSection[] = [];
  let currentFlow: ContentBlock[] = [];

  const flushFlow = () => {
    if (currentFlow.length > 0) {
      sections.push({ type: "flow", blocks: [...currentFlow] });
      currentFlow = [];
    }
  };

  for (const block of blocks) {
    if (
      block.type === "paragraph" ||
      block.type === "heading" ||
      block.type === "list" ||
      block.type === "alert" ||
      block.type === "image"
    ) {
      currentFlow.push(block);
    } else {
      flushFlow();
      if (block.type === "table") sections.push({ type: "table", block });
      else if (block.type === "asset_link") sections.push({ type: "asset_link", block });
      else if (block.type === "card") sections.push({ type: "card", block });
      else if (block.type === "procedure_section") sections.push({ type: "procedure_section", block });
      else if (block.type === "video") sections.push({ type: "video", block });
      else if (block.type === "section_divider") sections.push({ type: "section_divider", block });
    }
  }
  flushFlow();
  return sections;
}

export function sectionsToBlocks(sections: EditorSection[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const section of sections) {
    if (section.type === "flow") blocks.push(...section.blocks);
    else if (section.type === "table") blocks.push(section.block);
    else if (section.type === "asset_link") blocks.push(section.block);
    else if (section.type === "card") blocks.push(section.block);
    else if (section.type === "procedure_section") blocks.push(section.block);
    else if (section.type === "video") blocks.push(section.block);
    else if (section.type === "section_divider") blocks.push(section.block);
  }
  return blocks;
}
