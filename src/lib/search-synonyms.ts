/** Small expandable synonym groups for search query expansion. */
const SYNONYM_GROUPS: string[][] = [
  ["handbook", "manual", "guide"],
  ["visa", "immigration", "i-20", "i20"],
  ["assistantship", "ga", "ta", "ra"],
  ["deadline", "due date", "due-date"],
  ["fact sheet", "factsheet", "one-pager"],
];

const LOOKUP = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  const normalized = group.map((term) => term.toLowerCase());
  for (const term of normalized) {
    LOOKUP.set(term, normalized.filter((other) => other !== term));
  }
}

/** Expand a free-text query with synonym alternatives (OR-friendly tokens). */
export function expandSearchQueryWithSynonyms(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return "";
  }
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const extras = new Set<string>();
  for (const token of tokens) {
    const alts = LOOKUP.get(token);
    if (alts) {
      for (const alt of alts) {
        extras.add(alt);
      }
    }
  }
  // Also match multi-word synonym keys against the full query.
  for (const [key, alts] of LOOKUP) {
    if (key.includes(" ") && trimmed.toLowerCase().includes(key)) {
      for (const alt of alts) {
        extras.add(alt);
      }
    }
  }
  if (extras.size === 0) {
    return trimmed;
  }
  return `${trimmed} ${[...extras].join(" ")}`;
}

export function listSynonymGroupsForTests() {
  return SYNONYM_GROUPS.map((group) => [...group]);
}
