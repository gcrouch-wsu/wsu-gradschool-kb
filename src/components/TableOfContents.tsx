"use client";

import { useEffect, useState } from "react";
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
    } else if (block.type === "procedure_section") {
      headings.push({ id: block.blockId, text: block.title, level: block.level });
      headings.push(...extractHeadings(block.blocks));
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
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!showToc) return;

    const headingIds = extractHeadings(blocks)
      .filter((h) => h.level <= tocDepth)
      .map((h) => h.id);

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // rootMargin accounts for the sticky header and gives some buffer
        rootMargin: "-100px 0px -40% 0px",
        threshold: 0,
      }
    );

    headingIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [blocks, showToc, tocDepth]);

  if (!showToc) {
    return null;
  }
  const toc = buildToc(blocks, tocDepth);

  if (toc.length < 1) {
    return null;
  }

  return (
    <nav aria-label="On this page" className="toc">
      <strong className="toc__title">On this page</strong>
      <ol>
        {toc.map((node) => (
          <li key={node.id}>
            <a 
              href={`#${node.id}`} 
              className={activeId === node.id ? "is-active" : ""}
            >
              {node.text}
            </a>
            {node.children.length > 0 && (
              <ol>
                {node.children.map((child) => (
                  <li key={child.id}>
                    <a 
                      href={`#${child.id}`}
                      className={activeId === child.id ? "is-active" : ""}
                    >
                      {child.text}
                    </a>
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
