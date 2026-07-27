/** Built-in synonym groups used when site settings have none configured. */
const DEFAULT_SYNONYM_GROUPS: string[][] = [
  ["handbook", "manual", "guide"],
  ["visa", "immigration", "i-20", "i20"],
  ["assistantship", "ga", "ta", "ra"],
  ["deadline", "due date", "due-date"],
  ["fact sheet", "factsheet", "one-pager"],
];

function buildLookup(groups: string[][]): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  for (const group of groups) {
    const normalized = group.map((term) => term.toLowerCase());
    for (const term of normalized) {
      lookup.set(term, normalized.filter((other) => other !== term));
    }
  }
  return lookup;
}

function mergeGroups(custom: string[][] | undefined): string[][] {
  if (!custom || custom.length === 0) {
    return DEFAULT_SYNONYM_GROUPS;
  }
  return [...DEFAULT_SYNONYM_GROUPS, ...custom];
}

/** Expand a free-text query with synonym alternatives (OR-friendly tokens). */
export function expandSearchQueryWithSynonyms(query: string, customGroups?: string[][]): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return "";
  }
  const lookup = buildLookup(mergeGroups(customGroups));
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const extras = new Set<string>();
  for (const token of tokens) {
    const alts = lookup.get(token);
    if (alts) {
      for (const alt of alts) {
        extras.add(alt);
      }
    }
  }
  for (const [key, alts] of lookup) {
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
  return DEFAULT_SYNONYM_GROUPS.map((group) => [...group]);
}
