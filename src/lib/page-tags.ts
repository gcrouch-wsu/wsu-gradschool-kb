export const PAGE_TAG_MAX_COUNT = 12;
export const PAGE_TAG_MAX_LENGTH = 40;

export function normalizePageTags(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of source) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ").slice(0, PAGE_TAG_MAX_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= PAGE_TAG_MAX_COUNT) break;
  }

  return tags;
}

export function formatPageTagsForSearch(tags: string[] | undefined): string {
  return normalizePageTags(tags).join(" ");
}

export const ASSET_TAG_MAX_COUNT = PAGE_TAG_MAX_COUNT;
export const ASSET_TAG_MAX_LENGTH = PAGE_TAG_MAX_LENGTH;

export function normalizeAssetTags(value: unknown): string[] {
  return normalizePageTags(value);
}

export function formatAssetTagsForSearch(tags: string[] | undefined): string {
  return normalizeAssetTags(tags).join(" ");
}
