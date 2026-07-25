import Link from "next/link";
import type { PageTreeNode } from "@/lib/types";

function flattenPages(
  nodes: PageTreeNode[],
  kbSlug: string,
  homepagePageId?: string | null,
): Array<{ id: string; title: string; href: string }> {
  const out: Array<{ id: string; title: string; href: string }> = [];
  function walk(list: PageTreeNode[]) {
    for (const node of list) {
      if ((node.page.nodeKind ?? "page") === "page") {
        out.push({
          id: node.page.id,
          title: node.page.title,
          href:
            node.page.id === homepagePageId
              ? `/kb/${kbSlug}`
              : `/kb/${kbSlug}/${node.page.path.join("/")}`,
        });
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }
  walk(nodes);
  return out;
}

export function ArticlePageNav({
  nodes,
  kbSlug,
  homepagePageId,
  currentPageId,
}: {
  nodes: PageTreeNode[];
  kbSlug: string;
  homepagePageId?: string | null;
  currentPageId: string;
}) {
  const pages = flattenPages(nodes, kbSlug, homepagePageId);
  const index = pages.findIndex((page) => page.id === currentPageId);
  if (index < 0 || pages.length < 2) {
    return null;
  }

  const previous = index > 0 ? pages[index - 1] : null;
  const next = index < pages.length - 1 ? pages[index + 1] : null;

  return (
    <nav aria-label="Nearby pages" className="article-page-nav print-hide">
      {previous ? (
        <Link className="article-page-nav__link" href={previous.href} rel="prev">
          <span className="meta">Previous</span>
          <strong>{previous.title}</strong>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link className="article-page-nav__link article-page-nav__link--next" href={next.href} rel="next">
          <span className="meta">Next</span>
          <strong>{next.title}</strong>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
