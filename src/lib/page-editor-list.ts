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

export function isEmptyFlowSection(section: EditorSection): boolean {
  return section.type === "flow" && section.blocks.length === 0;
}

/**
 * Collapse only consecutive empty gap flows. Non-empty flows stay separate so the
 * editor can move/insert text boxes without silently merging them on the next emit.
 */
function mergeAdjacentFlowSections(sections: EditorSection[]): EditorSection[] {
  const merged: EditorSection[] = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    if (section.type === "flow" && previous?.type === "flow") {
      if (isEmptyFlowSection(previous) && isEmptyFlowSection(section)) {
        previous.clientKey = previous.clientKey ?? section.clientKey;
        continue;
      }
      merged.push({ type: "flow", blocks: [...section.blocks], clientKey: section.clientKey });
    } else if (section.type === "flow") {
      merged.push({ type: "flow", blocks: [...section.blocks], clientKey: section.clientKey });
    } else {
      merged.push(section);
    }
  }
  return merged;
}

/** Skip empty gap flows when choosing a move neighbor. */
export function moveTargetIndex(sections: EditorSection[], index: number, direction: -1 | 1): number {
  let target = index + direction;
  while (target >= 0 && target < sections.length && isEmptyFlowSection(sections[target]!)) {
    target += direction;
  }
  return target >= 0 && target < sections.length ? target : -1;
}

/** Swap a section with the next non-gap neighbor (used by section ↑/↓ controls). */
export function moveEditorSection(
  sections: EditorSection[],
  index: number,
  direction: -1 | 1,
): EditorSection[] | null {
  const target = moveTargetIndex(sections, index, direction);
  if (target < 0) {
    return null;
  }
  const next = [...sections];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return normalizeEditorSections(next);
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

/** Assign clientKeys only when missing — deterministic for SSR/hydration safety. */
export function stampFlowClientKeys(sections: EditorSection[]): EditorSection[] {
  return sections.map((section, index) => {
    if (section.type !== "flow") {
      return section;
    }
    if (section.clientKey) {
      return section;
    }
    if (section.blocks.length > 0) {
      return {
        ...section,
        clientKey: `flow:${section.blocks.map((block) => block.blockId).join(":")}`,
      };
    }
    return { ...section, clientKey: `${gapFlowClientKey(sections, index)}:${index}` };
  });
}

/**
 * Keep flow identities stable across emit/normalize cycles so Lexical surfaces
 * are not remounted (and crashed) when paragraph block IDs are re-minted.
 *
 * Matching is by identity, never by position: a purely positional pass hands the
 * key of the box that *used to* sit at index N to whatever now sits there, so a
 * move up/down re-labelled both boxes, React kept both surfaces exactly where they
 * already were, and the reorder appeared not to happen at all.
 *
 * Resolution order per flow:
 *  1. its own clientKey, when a previous flow carried the same one — moves, plus
 *     the key `updateFlowSection` deliberately carries over;
 *  2. a previous flow sharing a block id (content survived a partial id re-mint);
 *  3. the next unclaimed previous flow in document order — a whole-flow re-mint,
 *     which is what every Lexical emit produces because Lexical's HTML export
 *     drops `data-block-id`;
 *  4. a freshly derived key.
 */
export function preserveFlowClientKeys(
  previous: EditorSection[],
  next: EditorSection[],
): EditorSection[] {
  const prevFlows = previous.filter(
    (section): section is Extract<EditorSection, { type: "flow" }> => section.type === "flow",
  );
  const prevKeys = new Set(
    prevFlows.map((flow) => flow.clientKey).filter((key): key is string => Boolean(key)),
  );

  const nextFlows: { index: number; section: Extract<EditorSection, { type: "flow" }> }[] = [];
  next.forEach((section, index) => {
    if (section.type === "flow") {
      nextFlows.push({ index, section });
    }
  });

  const used = new Set<string>();
  const resolved = new Map<number, string>();

  for (const { index, section } of nextFlows) {
    const key = section.clientKey;
    if (key && prevKeys.has(key) && !used.has(key)) {
      used.add(key);
      resolved.set(index, key);
    }
  }

  for (const { index, section } of nextFlows) {
    if (resolved.has(index) || section.blocks.length === 0) {
      continue;
    }
    const nextIds = new Set(section.blocks.map((block) => block.blockId));
    const match = prevFlows.find(
      (candidate) =>
        candidate.clientKey &&
        !used.has(candidate.clientKey) &&
        candidate.blocks.length > 0 &&
        candidate.blocks.some((block) => nextIds.has(block.blockId)),
    );
    if (match?.clientKey) {
      used.add(match.clientKey);
      resolved.set(index, match.clientKey);
    }
  }

  let prevFlowCursor = 0;
  for (const { index } of nextFlows) {
    if (resolved.has(index)) {
      continue;
    }
    while (prevFlowCursor < prevFlows.length) {
      const prior = prevFlows[prevFlowCursor];
      prevFlowCursor += 1;
      if (prior?.clientKey && !used.has(prior.clientKey)) {
        used.add(prior.clientKey);
        resolved.set(index, prior.clientKey);
        break;
      }
    }
  }

  return next.map((section, index) => {
    if (section.type !== "flow") {
      return section;
    }
    const inherited = resolved.get(index);
    const key =
      inherited ??
      (section.clientKey && !used.has(section.clientKey)
        ? section.clientKey
        : section.blocks.length > 0
          ? `flow:${section.blocks.map((block) => block.blockId).join(":")}`
          : `${gapFlowClientKey(next, index)}:${index}`);
    used.add(key);
    return section.clientKey === key ? section : { ...section, clientKey: key };
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
