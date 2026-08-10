import { useState, useMemo, useEffect, useCallback } from 'react';
import { findMatches } from '../utils/searchHighlight';

interface UseSearchHighlightOptions {
  text: string;
}

const SEARCH_DEBOUNCE_MS = 200;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export function useSearchHighlight({ text }: UseSearchHighlightOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);

  const debouncedQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  const matches = useMemo(() => findMatches(text, debouncedQuery), [text, debouncedQuery]);

  useEffect(() => {
    setCurrentMatch(0);
  }, [debouncedQuery]);

  const handleNextMatch = useCallback(() => {
    if (matches.length > 0) {
      setCurrentMatch((prev) => (prev + 1) % matches.length);
    }
  }, [matches.length]);

  const handlePrevMatch = useCallback(() => {
    if (matches.length > 0) {
      setCurrentMatch((prev) => (prev - 1 + matches.length) % matches.length);
    }
  }, [matches.length]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevMatch();
        } else {
          handleNextMatch();
        }
      }
      if (e.key === 'Escape') {
        setSearchQuery('');
      }
    },
    [handleNextMatch, handlePrevMatch]
  );

  return {
    searchQuery,
    setSearchQuery,
    debouncedQuery,
    matches,
    currentMatch,
    handleNextMatch,
    handlePrevMatch,
    handleSearchKeyDown,
  };
}
