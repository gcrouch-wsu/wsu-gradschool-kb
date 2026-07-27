import { editDistance } from "@/lib/search-suggest";

export interface FuzzySearchCandidate {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
}

/** Score how well a field matches a query token (0 = no match). */
function tokenScore(field: string, token: string): number {
  const value = field.trim().toLowerCase();
  const needle = token.trim().toLowerCase();
  if (!value || !needle) {
    return 0;
  }
  if (value === needle) {
    return 100;
  }
  if (value.startsWith(needle)) {
    return 80;
  }
  if (value.includes(needle)) {
    return 55;
  }
  const distance = editDistance(value, needle);
  const maxDistance = Math.max(2, Math.floor(needle.length / 3));
  if (distance <= maxDistance) {
    return Math.max(10, 50 - distance * 12);
  }
  const words = value.split(/[^a-z0-9]+/).filter(Boolean);
  let best = 0;
  for (const word of words) {
    const wordDistance = editDistance(word, needle);
    if (wordDistance <= maxDistance) {
      best = Math.max(best, Math.max(8, 45 - wordDistance * 10));
    }
  }
  return best;
}

export function scoreFuzzyQuery(query: string, candidate: FuzzySearchCandidate): number {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }
  const tagText = (candidate.tags ?? []).join(" ");
  let total = 0;
  for (const token of tokens) {
    const title = tokenScore(candidate.title, token);
    const summary = tokenScore(candidate.summary, token) * 0.35;
    const tags = tokenScore(tagText, token) * 0.6;
    total += Math.max(title, summary, tags);
  }
  return total / tokens.length;
}

export function rankFuzzyCandidates<T extends FuzzySearchCandidate>(
  query: string,
  candidates: T[],
  options: { minScore?: number; limit?: number } = {},
): Array<{ candidate: T; score: number }> {
  const minScore = options.minScore ?? 12;
  const limit = options.limit ?? 20;
  return candidates
    .map((candidate) => ({ candidate, score: scoreFuzzyQuery(query, candidate) }))
    .filter((entry) => entry.score >= minScore)
    .sort((left, right) => right.score - left.score || left.candidate.title.localeCompare(right.candidate.title))
    .slice(0, limit);
}
