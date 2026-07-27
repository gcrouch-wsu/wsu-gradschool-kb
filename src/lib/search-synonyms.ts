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

export interface ExpandedSearchQuery {
  /** The caller's query, trimmed and lowercased. Never widened. */
  original: string;
  /** Alternative terms for the query, to be OR-ed against it — never AND-ed. */
  synonyms: string[];
}

/**
 * Split a query into the original text plus synonym alternatives.
 *
 * Callers must combine these disjunctively. Appending synonyms to the query
 * string instead makes them extra required terms in `to_tsquery` /
 * `websearch_to_tsquery` (both AND bare terms), so "handbook" would only match
 * pages that also say "manual" and "guide".
 */
export function expandSearchQueryTerms(query: string, customGroups?: string[][]): ExpandedSearchQuery {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return { original: "", synonyms: [] };
  }
  const lookup = buildLookup(mergeGroups(customGroups));
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const extras = new Set<string>();
  for (const token of tokens) {
    for (const alt of lookup.get(token) ?? []) {
      extras.add(alt);
    }
  }
  for (const [key, alts] of lookup) {
    if (key.includes(" ") && trimmed.includes(key)) {
      for (const alt of alts) {
        extras.add(alt);
      }
    }
  }
  extras.delete(trimmed);
  return { original: trimmed, synonyms: [...extras] };
}

export function listSynonymGroupsForTests() {
  return DEFAULT_SYNONYM_GROUPS.map((group) => [...group]);
}
