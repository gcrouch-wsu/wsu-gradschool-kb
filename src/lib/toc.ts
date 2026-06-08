import type { ContentBlock } from "@/lib/types";

export interface TocNode {
  id: string;
  text: string;
  children: { id: string; text: string }[];
}

export function extractHeadings(blocks: ContentBlock[]): Array<{ id: string; text: string; level: number }> {
  const headings: Array<{ id: string; text: string; level: number }> = [];
  for (const block of blocks) {
    if (block.type === "heading") {
      headings.push({ id: block.blockId, text: block.text, level: block.level });
    } else if (block.type === "procedure_section") {
      headings.push({ id: block.blockId, text: block.title, level: block.level });
      headings.push(...extractHeadings(block.blocks));
    } else if (block.type === "card") {
      headings.push(...extractHeadings(block.blocks));
    }
  }
  return headings;
}

export function buildToc(blocks: ContentBlock[], maxDepth: number): TocNode[] {
  const nodes: TocNode[] = [];
  const headings = extractHeadings(blocks);

  for (const h of headings) {
    if (h.level > maxDepth) {
      continue;
    }
    if (h.level === 2) {
      nodes.push({ id: h.id, text: h.text, children: [] });
    } else {
      const parent = nodes[nodes.length - 1];
      const child = { id: h.id, text: h.text };
      if (parent) {
        parent.children.push(child);
      } else {
        nodes.push({ id: h.id, text: h.text, children: [] });
      }
    }
  }
  return nodes;
}

export function hasTocEntries(blocks: ContentBlock[], tocDepth = 3): boolean {
  return buildToc(blocks, tocDepth).length >= 1;
}
