/** Soft cap for "Next steps" related pages so the section stays scannable. */
export const RELATED_PAGES_SOFT_MAX = 8;

/** Max rows shown in the related-page search menu. */
export const RELATED_PAGES_SEARCH_LIMIT = 12;

export type RelatedPageOption = {
  id: string;
  title: string;
  path: string;
  status?: string;
};

export function filterRelatedPageMatches(
  options: RelatedPageOption[],
  selectedIds: string[],
  query: string,
  limit = RELATED_PAGES_SEARCH_LIMIT,
): RelatedPageOption[] {
  const selected = new Set(selectedIds);
  const q = query.trim().toLowerCase();
  const matches = options.filter((option) => {
    if (selected.has(option.id)) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      option.title.toLowerCase().includes(q) ||
      option.path.toLowerCase().includes(q)
    );
  });

  matches.sort((a, b) => {
    if (!q) {
      return a.path.localeCompare(b.path) || a.title.localeCompare(b.title);
    }
    const aTitle = a.title.toLowerCase().startsWith(q) ? 0 : 1;
    const bTitle = b.title.toLowerCase().startsWith(q) ? 0 : 1;
    if (aTitle !== bTitle) {
      return aTitle - bTitle;
    }
    return a.title.localeCompare(b.title) || a.path.localeCompare(b.path);
  });

  return matches.slice(0, limit);
}

export function canAddRelatedPage(selectedCount: number, max = RELATED_PAGES_SOFT_MAX) {
  return selectedCount < max;
}
