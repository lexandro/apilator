import { useState, useRef, useEffect } from 'react';
import type { HistoryEntry } from '../../domain';
import { EmptyState } from '../common';
import './HistoryList.css';

interface HistoryListProps {
  entries: HistoryEntry[];
  selectedId?: string;
  onSelect: (entry: HistoryEntry) => void;
}

function groupByDate(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const groups = new Map<string, HistoryEntry[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const entry of entries) {
    const entryDate = new Date(entry.timestamp).toDateString();
    let label: string;
    if (entryDate === today) {
      label = 'Today';
    } else if (entryDate === yesterday) {
      label = 'Yesterday';
    } else {
      label = new Date(entry.timestamp).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
      });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(entry);
  }
  return groups;
}

function getPathFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    // If URL is invalid, try to extract path after domain
    const match = url.match(/^(?:https?:\/\/)?[^/]+(\/.*)?$/);
    return match?.[1] || url;
  }
}

// Scrolling URL component
function ScrollingUrl({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [scrollVars, setScrollVars] = useState<{ offset: number; duration: number }>({ offset: 0, duration: 0 });

  const path = getPathFromUrl(url);

  useEffect(() => {
    const updateScrollVars = () => {
      const container = containerRef.current;
      const inner = innerRef.current;
      if (!container || !inner) return;

      const containerWidth = container.offsetWidth;
      const textWidth = inner.scrollWidth;
      const overflow = textWidth - containerWidth;

      if (overflow > 0) {
        // Calculate duration based on overflow (slower for longer text)
        const duration = Math.max(2, overflow / 40); // 40px per second
        setScrollVars({ offset: -overflow, duration });
      } else {
        setScrollVars({ offset: 0, duration: 0 });
      }
    };

    const container = containerRef.current;
    if (!container) return;

    // ResizeObserver fires once on observe, which covers the initial measurement too.
    const resizeObserver = new ResizeObserver(updateScrollVars);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [url, path]);

  const hasOverflow = scrollVars.offset < 0;

  return (
    <div
      ref={containerRef}
      className={`history-path-scroll ${hasOverflow ? 'has-overflow' : ''}`}
      style={hasOverflow ? {
        '--scroll-offset': `${scrollVars.offset}px`,
        '--scroll-duration': `${scrollVars.duration}s`,
      } as React.CSSProperties : undefined}
    >
      <span ref={innerRef} className="history-path-scroll-inner">
        {path}
      </span>
    </div>
  );
}

export function HistoryList({ entries, selectedId, onSelect }: HistoryListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  if (entries.length === 0) {
    return <EmptyState icon="📭" message="No requests yet" className="history-empty" />;
  }

  const groupedEntries = groupByDate(entries);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <div className="history-list">
      {Array.from(groupedEntries.entries()).map(([label, groupEntries]) => {
        const isCollapsed = collapsedGroups.has(label);
        return (
          <div key={label} className="history-group">
            <button
              className="history-group-header"
              onClick={() => toggleGroup(label)}
            >
              <span className={`history-group-chevron ${isCollapsed ? 'collapsed' : ''}`}>
                ▼
              </span>
              <span className="history-group-label">{label}</span>
            </button>
            {!isCollapsed && (
              <div className="history-group-items">
                {groupEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`history-item ${selectedId === entry.id ? 'selected' : ''}`}
                    onClick={() => onSelect(entry)}
                    title={entry.request.url}
                  >
                    <div className="history-item-content">
                      <div className="history-item-main">
                        <span className={`history-method ${entry.request.method.toLowerCase()}`}>
                          {entry.request.method}
                        </span>
                        <span className="history-url">
                          {entry.request.url}
                        </span>
                      </div>
                      <ScrollingUrl url={entry.request.url} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
