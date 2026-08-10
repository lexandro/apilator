interface HighlightedLineProps {
  line: string;
  lineStart: number;
  matches: number[];
  matchIndices: number[];
  currentMatch: number;
  queryLength: number;
}

export function HighlightedLine({
  line,
  lineStart,
  matches,
  matchIndices,
  currentMatch,
  queryLength,
}: HighlightedLineProps) {
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  const sortedIndices = [...matchIndices].sort((a, b) => matches[a] - matches[b]);

  for (const matchIdx of sortedIndices) {
    const matchPos = matches[matchIdx] - lineStart;
    if (matchPos < 0 || matchPos >= line.length) continue;

    if (matchPos > lastEnd) {
      parts.push(<span key={`t${lastEnd}`}>{line.slice(lastEnd, matchPos)}</span>);
    }

    const isCurrent = matchIdx === currentMatch;
    const matchEnd = Math.min(matchPos + queryLength, line.length);
    parts.push(
      <mark
        key={`m${matchIdx}`}
        className={`search-highlight ${isCurrent ? 'current' : ''}`}
      >
        {line.slice(matchPos, matchEnd)}
      </mark>
    );
    lastEnd = matchEnd;
  }

  if (lastEnd < line.length) {
    parts.push(<span key={`t${lastEnd}`}>{line.slice(lastEnd)}</span>);
  }

  return <>{parts.length > 0 ? parts : line || ' '}</>;
}
