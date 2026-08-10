import { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { KeyValuePair, BodyEncoding } from '../../domain';
import { detectContentType, formatBody, type FormatType } from '../../utils/formatters';
import { useSearchHighlight } from '../../hooks/useSearchHighlight';
import { normalizeString } from '../../utils/searchHighlight';
import { EmptyState } from '../common';
import { FormatSelector } from './FormatSelector';
import { SearchBar } from './SearchBar';
import { HighlightedLine } from './HighlightedLine';
import { useLineMatches } from './hooks';
import { useSettingsStore } from '../../stores';
import './ResponseBody.css';

interface ResponseBodyProps {
  body: string;
  headers: KeyValuePair[];
  bodyEncoding?: BodyEncoding;
  truncated?: boolean;
}

const LINE_HEIGHT = 20;

export function ResponseBody({ body, headers, bodyEncoding = 'utf8', truncated = false }: ResponseBodyProps) {
  const formatDetectionEnabled = useSettingsStore((s) => s.getGeneralSettings().responseFormatDetection);
  const detectedFormat = formatDetectionEnabled ? detectContentType(headers) : 'raw';
  const [format, setFormat] = useState<FormatType>(detectedFormat);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFormat(detectedFormat);
  }, [detectedFormat]);

  const displayBody = useMemo(
    () => formatBody(body, format, bodyEncoding),
    [body, format, bodyEncoding]
  );
  const lines = useMemo(() => displayBody.split('\n'), [displayBody]);

  const {
    searchQuery,
    setSearchQuery,
    debouncedQuery,
    matches,
    currentMatch,
    handleNextMatch,
    handlePrevMatch,
    handleSearchKeyDown,
  } = useSearchHighlight({ text: displayBody });

  const { lineStarts, lineMatches, currentMatchLine } = useLineMatches({
    lines,
    matches,
    currentMatch,
    hasQuery: !!debouncedQuery,
  });

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
  });

  useEffect(() => {
    if (currentMatchLine >= 0) {
      rowVirtualizer.scrollToIndex(currentMatchLine, { align: 'center', behavior: 'smooth' });
    }
  }, [currentMatchLine, rowVirtualizer]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showLineNumbers = format !== 'hex' && format !== 'base64';
  const lineNumberWidth = Math.max(3, String(lines.length).length);

  if (!body) {
    return <EmptyState message="No response body" className="response-body-empty" />;
  }

  return (
    <div className="response-body">
      <div className="response-body-toolbar">
        <FormatSelector
          format={format}
          onFormatChange={setFormat}
          isOpen={showFormatMenu}
          onToggle={() => setShowFormatMenu(!showFormatMenu)}
          onClose={() => setShowFormatMenu(false)}
        />

        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onKeyDown={handleSearchKeyDown}
          matchCount={matches.length}
          currentMatch={currentMatch}
          onPrevMatch={handlePrevMatch}
          onNextMatch={handleNextMatch}
          hasQuery={!!debouncedQuery}
        />

        <button className="copy-btn" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {bodyEncoding === 'base64' && (
        <p className="response-body-notice" role="status">
          Binary response: not valid UTF-8. Hex shows the real bytes; the other views show
          the payload base64-encoded.
        </p>
      )}
      {truncated && (
        <p className="response-body-notice" role="status">
          Response was cut off at the configured maximum size.
        </p>
      )}

      <div className="response-body-content" ref={parentRef}>
        <div
          className="virtual-list"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const lineIdx = virtualRow.index;
            const line = lines[lineIdx];
            const matchIndices = lineMatches.get(lineIdx);
            const hasCurrentMatch = matchIndices?.includes(currentMatch);

            return (
              <div
                key={virtualRow.key}
                className={`virtual-row ${hasCurrentMatch ? 'current-match-line' : ''}`}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {showLineNumbers && (
                  <span
                    className="line-number"
                    style={{ width: `${lineNumberWidth + 2}ch` }}
                  >
                    {lineIdx + 1}
                  </span>
                )}
                <span className="line-content">
                  {matchIndices && debouncedQuery ? (
                    <HighlightedLine
                      line={line}
                      lineStart={lineStarts[lineIdx]}
                      matches={matches}
                      matchIndices={matchIndices}
                      currentMatch={currentMatch}
                      queryLength={normalizeString(debouncedQuery).length}
                    />
                  ) : (
                    line || ' '
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
