import type { KnowledgeBase } from "@/lib/types";

/** Filter home KB cards by title, description, or slug (case-insensitive). */
export function filterHomeKbs<T extends Pick<KnowledgeBase, "title" | "description" | "slug">>(
  kbs: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return kbs;
  return kbs.filter((kb) => {
    const haystack = `${kb.title} ${kb.description} ${kb.slug}`.toLowerCase();
    return haystack.includes(needle);
  });
}

export function paginateHomeKbs<T>(items: T[], page: number, pageSize: number): {
  pageItems: T[];
  currentPage: number;
  totalPages: number;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
  };
}
