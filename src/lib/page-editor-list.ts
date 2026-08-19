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

function isListElement(element: Element | null): element is HTMLOListElement | HTMLUListElement {
  return element instanceof HTMLOListElement || element instanceof HTMLUListElement;
}

export function canIndentListItem(li: HTMLLIElement): boolean {
  return isListElement(li.parentElement) && li.previousElementSibling instanceof HTMLLIElement;
}

export function canOutdentListItem(li: HTMLLIElement): boolean {
  const parentList = li.parentElement;
  return isListElement(parentList) && parentList.parentElement instanceof HTMLLIElement;
}

export function listLevelForItem(li: HTMLLIElement, surface: HTMLElement): number {
  let level = 0;
  let current: HTMLElement | null = li.parentElement;
  while (current && surface.contains(current)) {
    if (isListElement(current)) {
      level += 1;
    }
    current = current.parentElement;
  }
  return level;
}

export function listMarkerLabelForItem(li: HTMLLIElement, surface: HTMLElement): string {
  const parentList = li.parentElement;
  if (parentList instanceof HTMLUListElement) {
    return "bullet";
  }
  const level = listLevelForItem(li, surface);
  if (level <= 1) {
    return "1.";
  }
  if (level === 2) {
    return "a.";
  }
  return "i.";
}

export function indentListItem(li: HTMLLIElement): boolean {
  const parentList = li.parentElement;
  if (!parentList || (parentList.tagName !== "UL" && parentList.tagName !== "OL")) {
    return false;
  }

  const previous = li.previousElementSibling;
  if (!(previous instanceof HTMLLIElement)) {
    return false;
  }

  let nested = previous.querySelector(":scope > ul, :scope > ol");
  if (!(nested instanceof HTMLElement)) {
    nested = document.createElement(parentList.tagName);
    previous.appendChild(nested);
  }
  nested.appendChild(li);
  return true;
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
  | { type: "flow"; blocks: ContentBlock[]; clientKey?: string }
  | { type: "image"; block: Extract<ContentBlock, { type: "image" }> }
  | { type: "table"; block: Extract<ContentBlock, { type: "table" }> }
  | { type: "asset_link"; block: Extract<ContentBlock, { type: "asset_link" }> }
  | { type: "card"; block: Extract<ContentBlock, { type: "card" }> }
  | { type: "procedure_section"; block: Extract<ContentBlock, { type: "procedure_section" }> }
  | { type: "video"; block: Extract<ContentBlock, { type: "video" }> }
  | { type: "excerpt"; block: Extract<ContentBlock, { type: "excerpt" }> }
  | { type: "sourced"; block: Extract<ContentBlock, { type: "sourced" }> }
  | { type: "section_divider"; block: Extract<ContentBlock, { type: "section_divider" }> };

function isFlowBlock(block: ContentBlock): boolean {
  return block.type === "paragraph" || block.type === "heading" || block.type === "list" || block.type === "alert";
}

function isEditableGapTarget(section: EditorSection): boolean {
  return section.type === "image" || section.type === "section_divider";
}

function mergeAdjacentFlowSections(sections: EditorSection[]): EditorSection[] {
  const merged: EditorSection[] = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    if (section.type === "flow" && previous?.type === "flow") {
      previous.blocks.push(...section.blocks);
      previous.clientKey = previous.clientKey ?? section.clientKey;
    } else if (section.type === "flow") {
      merged.push({ type: "flow", blocks: [...section.blocks], clientKey: section.clientKey });
    } else {
      merged.push(section);
    }
  }
  return merged;
}

export function normalizeEditorSections(sections: EditorSection[]): EditorSection[] {
  const merged = mergeAdjacentFlowSections(sections);
  const normalized: EditorSection[] = [];
  for (let index = 0; index < merged.length; index += 1) {
    const section = merged[index];
    if (isEditableGapTarget(section) && normalized[normalized.length - 1]?.type !== "flow") {
      normalized.push({ type: "flow", blocks: [] });
    }
    normalized.push(section);
    const next = merged[index + 1];
    if (isEditableGapTarget(section) && (!next || isEditableGapTarget(next))) {
      normalized.push({ type: "flow", blocks: [] });
    }
  }
  return stampFlowClientKeys(mergeAdjacentFlowSections(normalized));
}

function gapFlowClientKey(sections: EditorSection[], index: number): string {
  let left = "start";
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const section = sections[cursor];
    if (section.type !== "flow") {
      left = section.block.blockId;
      break;
    }
    if (section.blocks.length > 0) {
      left = section.blocks[section.blocks.length - 1]?.blockId ?? left;
      break;
    }
  }
  let right = "end";
  for (let cursor = index + 1; cursor < sections.length; cursor += 1) {
    const section = sections[cursor];
    if (section.type !== "flow") {
      right = section.block.blockId;
      break;
    }
    if (section.blocks.length > 0) {
      right = section.blocks[0]?.blockId ?? right;
      break;
    }
  }
  return `gap:${left}:${right}`;
}

/** Assign clientKeys only when missing — never rewrite keys from parsed block IDs. */
export function stampFlowClientKeys(sections: EditorSection[]): EditorSection[] {
  return sections.map((section, index) => {
    if (section.type !== "flow") {
      return section;
    }
    if (section.clientKey) {
      return section;
    }
    if (section.blocks.length > 0) {
      return { ...section, clientKey: `flow-${crypto.randomUUID()}` };
    }
    return { ...section, clientKey: `${gapFlowClientKey(sections, index)}:${index}` };
  });
}

/**
 * Keep flow identities stable across emit/normalize cycles so Lexical surfaces
 * are not remounted (and crashed) when paragraph block IDs are re-minted.
 */
export function preserveFlowClientKeys(
  previous: EditorSection[],
  next: EditorSection[],
): EditorSection[] {
  if (
    previous.length === next.length &&
    previous.every((section, index) => section.type === next[index]?.type)
  ) {
    return next.map((section, index) => {
      if (section.type !== "flow") {
        return section;
      }
      const prior = previous[index];
      if (prior?.type === "flow" && prior.clientKey) {
        return { ...section, clientKey: prior.clientKey };
      }
      return section.clientKey ? section : { ...section, clientKey: `flow-${crypto.randomUUID()}` };
    });
  }

  const used = new Set<string>();
  const prevFlows = previous.filter(
    (section): section is Extract<EditorSection, { type: "flow" }> => section.type === "flow",
  );
  let prevFlowCursor = 0;

  return next.map((section, index) => {
    if (section.type !== "flow") {
      return section;
    }
    if (section.clientKey && !used.has(section.clientKey)) {
      used.add(section.clientKey);
      return section;
    }
    const nextIds = new Set(section.blocks.map((block) => block.blockId));
    const overlapIndex = prevFlows.findIndex((candidate) => {
      if (!candidate.clientKey || used.has(candidate.clientKey)) {
        return false;
      }
      if (section.blocks.length === 0 || candidate.blocks.length === 0) {
        return false;
      }
      return candidate.blocks.some((block) => nextIds.has(block.blockId));
    });
    if (overlapIndex >= 0) {
      const overlap = prevFlows[overlapIndex];
      if (overlap?.clientKey) {
        used.add(overlap.clientKey);
        return { ...section, clientKey: overlap.clientKey };
      }
    }
    while (prevFlowCursor < prevFlows.length) {
      const prior = prevFlows[prevFlowCursor];
      prevFlowCursor += 1;
      if (prior?.clientKey && !used.has(prior.clientKey)) {
        used.add(prior.clientKey);
        return { ...section, clientKey: prior.clientKey };
      }
    }
    const key =
      section.blocks.length > 0
        ? `flow-${crypto.randomUUID()}`
        : `${gapFlowClientKey(next, index)}:${index}`;
    used.add(key);
    return { ...section, clientKey: key };
  });
}

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
    if (isFlowBlock(block)) {
      currentFlow.push(block);
    } else {
      flushFlow();
      if (block.type === "image") sections.push({ type: "image", block });
      else if (block.type === "table") sections.push({ type: "table", block });
      else if (block.type === "asset_link") sections.push({ type: "asset_link", block });
      else if (block.type === "card") sections.push({ type: "card", block });
      else if (block.type === "procedure_section") sections.push({ type: "procedure_section", block });
      else if (block.type === "video") sections.push({ type: "video", block });
      else if (block.type === "excerpt") sections.push({ type: "excerpt", block });
      else if (block.type === "sourced") sections.push({ type: "sourced", block });
      else if (block.type === "section_divider") sections.push({ type: "section_divider", block });
    }
  }
  flushFlow();
  return normalizeEditorSections(sections);
}

export function sectionsToBlocks(sections: EditorSection[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const section of sections) {
    if (section.type === "flow") blocks.push(...section.blocks);
    else if (section.type === "image") blocks.push(section.block);
    else if (section.type === "table") blocks.push(section.block);
    else if (section.type === "asset_link") blocks.push(section.block);
    else if (section.type === "card") blocks.push(section.block);
    else if (section.type === "procedure_section") blocks.push(section.block);
    else if (section.type === "video") blocks.push(section.block);
    else if (section.type === "excerpt") blocks.push(section.block);
    else if (section.type === "sourced") blocks.push(section.block);
    else if (section.type === "section_divider") blocks.push(section.block);
  }
  return blocks;
}
