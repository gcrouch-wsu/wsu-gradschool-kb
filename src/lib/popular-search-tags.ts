import { getVisiblePagesForKb } from "@/lib/kb-store";
import { normalizePageTags } from "@/lib/page-tags";

export interface PopularTag {
  tag: string;
  count: number;
}

export async function getPopularSearchTags(
  kbIds: string[],
  includeStaff: boolean,
  limit = 24,
): Promise<PopularTag[]> {
  const counts = new Map<string, number>();

  for (const kbId of kbIds) {
    const pages = await getVisiblePagesForKb(kbId, includeStaff);
    for (const page of pages) {
      for (const tag of normalizePageTags(page.tags)) {
        const key = tag.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, limit);
}
