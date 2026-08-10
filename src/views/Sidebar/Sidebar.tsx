import { useState } from 'react';
import type { HistoryEntry } from '../../domain';
import { HistoryList } from './HistoryList';
import { CollectionsPanel } from '../Collections';
import './Sidebar.css';

type SidebarTab = 'history' | 'collections';

interface SidebarProps {
  history: HistoryEntry[];
  selectedHistoryId?: string;
  onHistorySelect: (entry: HistoryEntry) => void;
  onClearHistory?: () => void;
  onSettingsClick?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenCollectionRequest: (nodeId: string) => void;
  selectedCollectionId?: string | null;
}

export function Sidebar({
  history,
  selectedHistoryId,
  onHistorySelect,
  onClearHistory,
  onSettingsClick,
  collapsed,
  onToggleCollapse,
  onOpenCollectionRequest,
  selectedCollectionId,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('history');
  if (collapsed) {
    return (
      <aside className="sidebar sidebar--collapsed">
        <button
          className="sidebar-expand-btn"
          onClick={onToggleCollapse}
          title="Expand sidebar"
        >
          <span className="sidebar-expand-icon" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'history'}
            className={`sidebar-tab ${tab === 'history' ? 'sidebar-tab--active' : ''}`}
            onClick={() => setTab('history')}
          >
            History
          </button>
          <button
            role="tab"
            aria-selected={tab === 'collections'}
            className={`sidebar-tab ${tab === 'collections' ? 'sidebar-tab--active' : ''}`}
            onClick={() => setTab('collections')}
          >
            Collections
          </button>
        </div>
        <div className="sidebar-actions">
          {tab === 'history' && history.length > 0 && onClearHistory && (
            <button
              className="sidebar-action-btn"
              onClick={onClearHistory}
              title="Clear history"
            >
              🗑️
            </button>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title="Collapse sidebar"
          >
            <span className="sidebar-collapse-icon" />
          </button>
        </div>
      </div>
      <div className="sidebar-content">
        {tab === 'history' ? (
          <HistoryList
            entries={history}
            selectedId={selectedHistoryId}
            onSelect={onHistorySelect}
          />
        ) : (
          <CollectionsPanel
            onOpenRequest={onOpenCollectionRequest}
            selectedId={selectedCollectionId}
          />
        )}
      </div>
      <div className="sidebar-footer">
        <button
          className="sidebar-settings-btn"
          onClick={onSettingsClick}
          title="Settings"
        >
          <span className="settings-icon">⚙️</span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
