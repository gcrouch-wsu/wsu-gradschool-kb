import Link from "next/link";
import type { PageTreeNode } from "@/lib/types";

function TreeItems({
  nodes,
  kbSlug,
  currentPath,
}: {
  nodes: PageTreeNode[];
  kbSlug: string;
  currentPath?: string;
}) {
  return (
    <ul>
      {nodes.map((node) => {
        const href = `/kb/${kbSlug}/${node.page.path.join("/")}`;
        const isCurrent = currentPath === node.page.path.join("/");
        return (
          <li key={node.page.id}>
            <Link aria-current={isCurrent ? "page" : undefined} href={href}>
              {node.page.title}
            </Link>
            {node.page.visibility === "staff" && (
              <span className="badge badge--staff"> Staff</span>
            )}
            {node.children.length > 0 && (
              <TreeItems currentPath={currentPath} kbSlug={kbSlug} nodes={node.children} />
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
  currentPath,
}: {
  nodes: PageTreeNode[];
  kbSlug: string;
  currentPath?: string;
}) {
  if (nodes.length === 0) {
    return <p className="meta">No pages yet.</p>;
  }
  return <TreeItems currentPath={currentPath} kbSlug={kbSlug} nodes={nodes} />;
}
