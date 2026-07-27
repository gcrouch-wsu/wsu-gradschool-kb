/** Parse tag facets from query strings (comma-separated or repeated params). */
export function parseSearchTagFacets(input: string | string[] | undefined): string[] {
  const raw = Array.isArray(input) ? input : input ? [input] : [];
  const tags = new Set<string>();
  for (const value of raw) {
    for (const part of value.split(",")) {
      const tag = part.trim().toLowerCase();
      if (tag) {
        tags.add(tag);
      }
    }
  }
  return [...tags];
}

export function appendSearchTagParam(params: URLSearchParams, tag: string) {
  const existing = parseSearchTagFacets(params.getAll("tag"));
  if (!existing.includes(tag.toLowerCase())) {
    params.append("tag", tag);
  }
}

export function removeSearchTagParam(params: URLSearchParams, tag: string) {
  const needle = tag.toLowerCase();
  const next = parseSearchTagFacets(params.getAll("tag")).filter((value) => value !== needle);
  params.delete("tag");
  for (const value of next) {
    params.append("tag", value);
  }
}
