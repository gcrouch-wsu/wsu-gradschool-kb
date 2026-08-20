"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
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

/**
 * IDs that should start expanded: the current page and its ancestors, or all roots when
 * browsing.
 *
 * The current page's *own* children used to stay collapsed — only nodes with a matching
 * descendant were expanded — so standing on a parent page hid the pages beneath it behind a
 * chevron. That is exactly where you look to confirm a page was nested, so it read as the
 * child being missing from the tree entirely.
 */
export function initialExpandedIds(
  nodes: PageTreeNode[],
  currentPageId?: string,
  currentPath?: string,
  expandDepth = 6,
): Set<string> {
  const expanded = new Set<string>();

  // Open every branch down to expandDepth, whether or not the reader is on a page in it.
  // This used to run only when no current page matched, and only over the top-level nodes,
  // so anything nested two levels deep was invisible on the KB landing page — the tree
  // showed the first heading and nothing under it.
  function openToDepth(list: PageTreeNode[], depth: number) {
    if (depth >= expandDepth) {
      return;
    }
    for (const node of list) {
      if (node.children.length > 0) {
        expanded.add(node.page.id);
        openToDepth(node.children, depth + 1);
      }
    }
  }
  openToDepth(nodes, 0);

  function walk(list: PageTreeNode[], ancestors: string[]): boolean {
    for (const node of list) {
      const childHit = walk(node.children, [...ancestors, node.page.id]);
      const selfHit = isCurrentNode(node, currentPageId, currentPath);
      if (selfHit || childHit) {
        for (const id of ancestors) {
          expanded.add(id);
        }
        // childHit implies children exist, so this covers both the ancestor case and the
        // current page's own branch.
        if (node.children.length > 0) {
          expanded.add(node.page.id);
        }
        return true;
      }
    }
    return false;
  }

  // The current page's chain opens regardless of expandDepth: a reader who navigated to a
  // deep page must be able to see where they are.
  walk(nodes, []);
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
        className="page-tree__link page-tree__link--external"
        href={node.page.linkUrl}
        {...(node.page.linkNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        <span className="page-tree__title">{node.page.title}</span>
        <ExternalLink aria-hidden className="page-tree__link-icon" size={13} strokeWidth={2} />
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
  depth,
  maxDepth,
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
  depth: number;
  /** Deepest level rendered to readers; deeper branches are hidden, not collapsed. */
  maxDepth: number;
}) {
  return (
    <ul>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0 && depth + 1 < maxDepth;
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
                {/* Drafts reach this tree only when the reader is signed-in staff
                    (buildPageTree's includeStaff), so this never leaks to the public.
                    Without it a draft is indistinguishable from a published page. */}
                {node.page.status === "draft" && <span className="badge badge--draft">Draft</span>}
                {node.page.status === "proposed" && (
                  <span className="badge badge--draft">In review</span>
                )}
              </div>
            </div>
            {hasChildren && isExpanded && (
              <div className="page-tree__branch" id={collapsible ? groupId : undefined}>
                <TreeItems
                  collapsible={collapsible}
                  currentPageId={currentPageId}
                  currentPath={currentPath}
                  depth={depth + 1}
                  expandedIds={expandedIds}
                  homepagePageId={homepagePageId}
                  idPrefix={idPrefix}
                  kbSlug={kbSlug}
                  maxDepth={maxDepth}
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
  maxDepth = 6,
  expandDepth = 6,
}: {
  nodes: PageTreeNode[];
  kbSlug: string;
  homepagePageId?: string | null;
  currentPageId?: string;
  currentPath?: string;
  /** When true, nested branches can expand/collapse (theme / Manage Styles). */
  collapsible?: boolean;
  /** Deepest level shown to readers (per KB, Manage Styles). */
  maxDepth?: number;
  /** How many levels start open when the tree is collapsible (per KB, Manage Styles). */
  expandDepth?: number;
}) {
  const idPrefix = useId().replace(/:/g, "");
  const requiredExpanded = useMemo(
    () => initialExpandedIds(nodes, currentPageId, currentPath, expandDepth),
    [nodes, currentPageId, currentPath, expandDepth],
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(requiredExpanded);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setExpandedIds((current) => {
        const next = new Set(current);
        for (const id of requiredExpanded) {
          next.add(id);
        }
        return next;
      });
    });
    return () => window.cancelAnimationFrame(frame);
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
      depth={0}
      expandedIds={expandedIds}
      homepagePageId={homepagePageId}
      idPrefix={idPrefix}
      kbSlug={kbSlug}
      maxDepth={maxDepth}
      nodes={nodes}
      onToggle={onToggle}
    />
  );
}
