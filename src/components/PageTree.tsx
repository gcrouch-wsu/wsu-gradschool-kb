import Link from "next/link";
import type { PageTreeNode } from "@/lib/types";

function TreeItems({
  nodes,
  kbSlug,
  homepagePageId,
  currentPageId,
  currentPath,
}: {
  nodes: PageTreeNode[];
  kbSlug: string;
  homepagePageId?: string | null;
  currentPageId?: string;
  currentPath?: string;
}) {
  return (
    <ul>
      {nodes.map((node) => {
        const href = node.page.id === homepagePageId ? `/kb/${kbSlug}` : `/kb/${kbSlug}/${node.page.path.join("/")}`;
        const isCurrent = currentPageId ? currentPageId === node.page.id : currentPath === node.page.path.join("/");
        return (
          <li key={node.page.id}>
            <Link aria-current={isCurrent ? "page" : undefined} href={href}>
              {node.page.title}
            </Link>
            {node.page.visibility === "staff" && (
              <span className="badge badge--staff"> Staff</span>
            )}
            {node.children.length > 0 && (
              <TreeItems
                currentPageId={currentPageId}
                currentPath={currentPath}
                homepagePageId={homepagePageId}
                kbSlug={kbSlug}
                nodes={node.children}
              />
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
}: {
  nodes: PageTreeNode[];
  kbSlug: string;
  homepagePageId?: string | null;
  currentPageId?: string;
  currentPath?: string;
}) {
  if (nodes.length === 0) {
    return <p className="meta">No pages yet.</p>;
  }
  return (
    <TreeItems
      currentPageId={currentPageId}
      currentPath={currentPath}
      homepagePageId={homepagePageId}
      kbSlug={kbSlug}
      nodes={nodes}
    />
  );
}
