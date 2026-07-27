/** Tiny Levenshtein for "did you mean" suggestions (short titles only). */
export function editDistance(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) {
    return 0;
  }
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

export function suggestDidYouMean(
  query: string,
  candidates: string[],
  options: { maxDistance?: number } = {},
): string | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized.length < 3) {
    return null;
  }
  const maxDistance = options.maxDistance ?? Math.max(2, Math.floor(normalized.length / 4));
  let best: { title: string; distance: number } | null = null;
  for (const title of candidates) {
    const words = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const distances = [editDistance(normalized, title), ...words.map((word) => editDistance(normalized, word))];
    const distance = Math.min(...distances);
    if (distance === 0 || distance > maxDistance) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { title, distance };
    }
  }
  return best?.title ?? null;
}
