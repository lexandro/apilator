interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  matchCount: number;
  currentMatch: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  hasQuery: boolean;
}

export function SearchBar({
  query,
  onQueryChange,
  onKeyDown,
  matchCount,
  currentMatch,
  onPrevMatch,
  onNextMatch,
  hasQuery,
}: SearchBarProps) {
  return (
    <div className="response-search">
      <input
        type="text"
        className="response-search-input"
        placeholder="Search..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {matchCount > 0 && (
        <>
          <span className="response-search-count">
            {currentMatch + 1}/{matchCount}
          </span>
          <button
            className="response-search-nav"
            onClick={onPrevMatch}
            title="Previous (Shift+Enter)"
          >
            ▲
          </button>
          <button
            className="response-search-nav"
            onClick={onNextMatch}
            title="Next (Enter)"
          >
            ▼
          </button>
        </>
      )}
      {hasQuery && matchCount === 0 && (
        <span className="response-search-no-match">No matches</span>
      )}
    </div>
  );
}
