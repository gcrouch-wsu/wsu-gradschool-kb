import type { ContentBlock } from "@/lib/types";

interface TocNode {
  id: string;
  text: string;
  children: { id: string; text: string }[];
}

function buildToc(blocks: ContentBlock[]): TocNode[] {
  const nodes: TocNode[] = [];
  for (const block of blocks) {
    if (block.type !== "heading") {
      continue;
    }
    if (block.level === 2) {
      nodes.push({ id: block.blockId, text: block.text, children: [] });
    } else {
      const parent = nodes[nodes.length - 1];
      const child = { id: block.blockId, text: block.text };
      if (parent) {
        parent.children.push(child);
      } else {
        // A level-3 heading with no preceding level-2 still gets a top-level entry.
        nodes.push({ id: block.blockId, text: block.text, children: [] });
      }
    }
  }
  return nodes;
}

export function TableOfContents({ blocks }: { blocks: ContentBlock[] }) {
  const toc = buildToc(blocks);
  if (toc.length < 2) {
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
