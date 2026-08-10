const COMBINING_MARKS = /\p{Mn}/gu;

export function normalizeString(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');
}

export const DEFAULT_MAX_MATCHES = 10000;

export function findMatches(
  text: string,
  query: string,
  maxMatches = DEFAULT_MAX_MATCHES
): number[] {
  if (!query.trim()) return [];

  const normalizedQuery = normalizeString(query);
  const normalizedText = normalizeString(text);
  const result: number[] = [];

  let pos = 0;
  while ((pos = normalizedText.indexOf(normalizedQuery, pos)) !== -1) {
    result.push(pos);
    if (result.length >= maxMatches) break;
    pos += 1;
  }

  return result;
}
