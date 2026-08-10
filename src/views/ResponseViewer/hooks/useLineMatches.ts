import { useMemo } from 'react';
import { buildLineStarts, findLineAt, groupMatchesByLine } from '../../../utils/lineIndex';

interface UseLineMatchesOptions {
  lines: string[];
  matches: number[];
  currentMatch: number;
  hasQuery: boolean;
}

interface UseLineMatchesReturn {
  /** Character offset where each line starts. */
  lineStarts: number[];
  /** Map: lineIdx -> match indices in that line */
  lineMatches: Map<number, number[]>;
  /** Line index containing the current match */
  currentMatchLine: number;
}

export function useLineMatches({
  lines,
  matches,
  currentMatch,
  hasQuery,
}: UseLineMatchesOptions): UseLineMatchesReturn {
  const lineStarts = useMemo(() => buildLineStarts(lines), [lines]);

  const lineMatches = useMemo(() => {
    if (!hasQuery || matches.length === 0) return new Map<number, number[]>();
    return groupMatchesByLine(lines, lineStarts, matches);
  }, [lines, lineStarts, matches, hasQuery]);

  const currentMatchLine = useMemo(() => {
    if (matches.length === 0 || currentMatch >= matches.length) return -1;
    return findLineAt(lineStarts, matches[currentMatch]);
  }, [lineStarts, matches, currentMatch]);

  return { lineStarts, lineMatches, currentMatchLine };
}
