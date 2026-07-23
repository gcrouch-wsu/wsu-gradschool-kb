"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import type { PageTreeNode } from "@/lib/types";

function isCurrentNode(
  node: PageTreeNode,
  currentPageId?: string,
  currentPath?: string,
): boolean {
  if (currentPageId) {
    return currentPageId === node.page.id;
  }
  return Boolean(currentPath && currentPath === node.page.path.join("/"));
}

/** IDs that should start expanded: ancestors of the current page, or all roots when browsing. */
function initialExpandedIds(
  nodes: PageTreeNode[],
  currentPageId?: string,
  currentPath?: string,
): Set<string> {
  const expanded = new Set<string>();

  function walk(list: PageTreeNode[], ancestors: string[]): boolean {
    for (const node of list) {
      const childHit = walk(node.children, [...ancestors, node.page.id]);
      const selfHit = isCurrentNode(node, currentPageId, currentPath);
      if (selfHit || childHit) {
        for (const id of ancestors) {
          expanded.add(id);
        }
        if (childHit) {
          expanded.add(node.page.id);
        }
        return true;
      }
    }
    return false;
  }

  const found = walk(nodes, []);
  if (!found) {
    for (const node of nodes) {
      if (node.children.length > 0) {
        expanded.add(node.page.id);
      }
    }
  }
  return expanded;
}

function TreeLabel({
  node,
  kbSlug,
  homepagePageId,
  isCurrent,
}: {
  node: PageTreeNode;
  kbSlug: string;
  homepagePageId?: string | null;
  isCurrent: boolean;
}) {
  const kind = node.page.nodeKind ?? "page";
  const href =
    node.page.id === homepagePageId ? `/kb/${kbSlug}` : `/kb/${kbSlug}/${node.page.path.join("/")}`;
  const externalLink = kind === "link" && /^https?:\/\//.test(node.page.linkUrl ?? "");
  const internalLink = kind === "link" && (node.page.linkUrl ?? "").startsWith("/");

  if (kind === "group") {
    return <span className="page-tree__group">{node.page.title}</span>;
  }
  if (kind === "link" && (externalLink || internalLink)) {
    return (
      <a
        className="page-tree__link"
        href={node.page.linkUrl}
        {...(node.page.linkNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        <span className="page-tree__title">{node.page.title}</span>
        {node.page.linkNewTab && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
    );
  }
  if (kind === "link") {
    return <span className="page-tree__group">{node.page.title}</span>;
  }
  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      className="page-tree__link"
      href={href}
    >
      <span className="page-tree__title">{node.page.title}</span>
    </Link>
  );
}

function TreeItems({
  nodes,
  kbSlug,
  homepagePageId,
  currentPageId,
  currentPath,
  collapsible,
  expandedIds,
  onToggle,
  idPrefix,
}: {
  nodes: PageTreeNode[];
  kbSlug: string;
  homepagePageId?: string | null;
  currentPageId?: string;
  currentPath?: string;
  collapsible: boolean;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  idPrefix: string;
}) {
  return (
    <ul>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = !collapsible || expandedIds.has(node.page.id);
        const isCurrent = isCurrentNode(node, currentPageId, currentPath);
        const groupId = `${idPrefix}-${node.page.id}`;

        return (
          <li key={node.page.id}>
            <div className="page-tree__row">
              {collapsible &&
                (hasChildren ? (
                  <button
                    aria-controls={groupId}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.page.title}`}
                    className="page-tree__toggle"
                    onClick={() => onToggle(node.page.id)}
                    type="button"
                  >
                    {isExpanded ? (
                      <ChevronDown aria-hidden size={16} strokeWidth={2} />
                    ) : (
                      <ChevronRight aria-hidden size={16} strokeWidth={2} />
                    )}
                  </button>
                ) : (
                  <span aria-hidden className="page-tree__toggle-spacer" />
                ))}
              <div className="page-tree__label">
                <TreeLabel
                  homepagePageId={homepagePageId}
                  isCurrent={isCurrent}
                  kbSlug={kbSlug}
                  node={node}
                />
                {node.page.visibility === "staff" && (
                  <span className="badge badge--staff">Staff</span>
                )}
              </div>
            </div>
            {hasChildren && isExpanded && (
              <div className="page-tree__branch" id={collapsible ? groupId : undefined}>
                <TreeItems
                  collapsible={collapsible}
                  currentPageId={currentPageId}
                  currentPath={currentPath}
                  expandedIds={expandedIds}
                  homepagePageId={homepagePageId}
                  idPrefix={idPrefix}
                  kbSlug={kbSlug}
                  nodes={node.children}
                  onToggle={onToggle}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PageTree({
  nodes,
  kbSlug,
  homepagePageId,
  currentPageId,
  currentPath,
  collapsible = false,
}: {
  nodes: PageTreeNode[];
  kbSlug: string;
  homepagePageId?: string | null;
  currentPageId?: string;
  currentPath?: string;
  /** When true, nested branches can expand/collapse (theme / Manage Styles). */
  collapsible?: boolean;
}) {
  const idPrefix = useId().replace(/:/g, "");
  const requiredExpanded = useMemo(
    () => initialExpandedIds(nodes, currentPageId, currentPath),
    [nodes, currentPageId, currentPath],
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(requiredExpanded);

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const id of requiredExpanded) {
        next.add(id);
      }
      return next;
    });
  }, [requiredExpanded]);

  if (nodes.length === 0) {
    return <p className="meta">No pages yet.</p>;
  }

  function onToggle(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <TreeItems
      collapsible={collapsible}
      currentPageId={currentPageId}
      currentPath={currentPath}
      expandedIds={expandedIds}
      homepagePageId={homepagePageId}
      idPrefix={idPrefix}
      kbSlug={kbSlug}
      nodes={nodes}
      onToggle={onToggle}
    />
  );
}
