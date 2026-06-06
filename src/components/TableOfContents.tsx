import type { ContentBlock } from "@/lib/types";

interface TocNode {
  id: string;
  text: string;
  children: { id: string; text: string }[];
}

function extractHeadings(blocks: ContentBlock[]): Array<{ id: string; text: string; level: number }> {
  const headings: Array<{ id: string; text: string; level: number }> = [];
  for (const block of blocks) {
    if (block.type === "heading") {
      headings.push({ id: block.blockId, text: block.text, level: block.level });
    } else if (block.type === "card") {
      headings.push(...extractHeadings(block.blocks));
    }
  }
  return headings;
}

function buildToc(blocks: ContentBlock[], maxDepth: number): TocNode[] {
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

/** True when the page has at least one heading within the chosen depth (i.e. a TOC would render). */
export function hasTocEntries(blocks: ContentBlock[], tocDepth = 3): boolean {
  return buildToc(blocks, tocDepth).length >= 1;
}

export function TableOfContents({
  blocks,
  showToc = true,
  tocDepth = 3,
}: {
  blocks: ContentBlock[];
  showToc?: boolean;
  tocDepth?: number;
}) {
  if (!showToc) {
    return null;
  }
  const toc = buildToc(blocks, tocDepth);
  // Show whenever the editor enabled the TOC and the page has at least one
  // heading within the chosen depth. (Previously hidden unless 2+ headings,
  // which silently dropped a single-H2 outline.)
  if (toc.length < 1) {
    return null;
  }

  return (
    <nav aria-label="On this page" className="toc">
      <strong className="toc__title">On this page</strong>
      <ol>
        {toc.map((node) => (
          <li key={node.id}>
            <a href={`#${node.id}`}>{node.text}</a>
            {node.children.length > 0 && (
              <ol>
                {node.children.map((child) => (
                  <li key={child.id}>
                    <a href={`#${child.id}`}>{child.text}</a>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
