import { useState, useRef } from 'react';
import type { Tab as TabType, TabColor } from '../../domain';
import { TabContextMenu } from './TabContextMenu';
import { useTabRename } from './hooks';
import { getTabTitle } from './utils';
import './Tab.css';

interface TabProps {
  tab: TabType;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (name: string | undefined) => void;
  onColorChange: (color: TabColor) => void;
  onTogglePinned: () => void;
  onNewTab: () => void;
  onDuplicate: () => void;
  onCloseOtherTabs: () => void;
  onCloseAllTabs: () => void;
  onForceCloseAllTabs: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: 'before' | 'after' | null;
  onMouseDragStart: (tabId: string, e: React.MouseEvent) => void;
}

function getStatusIndicator(tab: TabType): 'error' | 'warning' | null {
  if (tab.requestState.status !== 'success') return null;
  const code = tab.requestState.response.status;
  if (code >= 400) return 'error';
  if (code >= 300) return 'warning';
  return null;
}

export function Tab({
  tab,
  isActive,
  onSelect,
  onClose,
  onRename,
  onColorChange,
  onTogglePinned,
  onNewTab,
  onDuplicate,
  onCloseOtherTabs,
  onCloseAllTabs,
  onForceCloseAllTabs,
  isDragging,
  isDropTarget,
  dropPosition,
  onMouseDragStart,
}: TabProps) {
  const { request, isDirty, name, color, pinned } = tab;
  const tabRef = useRef<HTMLDivElement>(null);
  const method = request.method.toLowerCase();
  const statusIndicator = getStatusIndicator(tab);
  const title = getTabTitle(tab);

  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const {
    isRenaming,
    renameValue,
    renameInputRef,
    startRename,
    handleRenameChange,
    handleRenameSubmit,
    handleRenameKeyDown,
  } = useTabRename({
    initialName: name,
    getDefaultTitle: () => title,
    onRename,
  });

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleStartRename = () => {
    startRename();
    setShowContextMenu(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.tab-close')) return;
    onMouseDragStart(tab.id, e);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  const classNames = [
    'tab',
    isActive && 'active',
    pinned && 'pinned',
    color && 'has-color',
    isDragging && 'dragging',
    isDropTarget && dropPosition === 'before' && 'drop-before',
    isDropTarget && dropPosition === 'after' && 'drop-after',
  ].filter(Boolean).join(' ');

  const tabStyle = color ? { '--tab-color': color } as React.CSSProperties : undefined;

  return (
    <>
      <div
        ref={tabRef}
        role="tab"
        tabIndex={0}
        className={classNames}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        title={request.url || 'New Request'}
        style={tabStyle}
        data-tab-id={tab.id}
        data-tab-pinned={pinned ? 'true' : 'false'}
      >
        {pinned && <span className="tab-pin">📌</span>}
        <span className={`tab-method ${method}`}>{request.method}</span>
        {statusIndicator && (
          <span className={`tab-status tab-status--${statusIndicator}`} />
        )}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            className="tab-rename-input"
            value={renameValue}
            onChange={(e) => handleRenameChange(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tab-title">{title}</span>
        )}
        {isDirty && <span className="tab-dirty" />}
        {!pinned && (
          <button
            className="tab-close"
            onClick={handleClose}
            title="Close tab"
            aria-label="Close tab"
          >
            ×
          </button>
        )}
      </div>

      {showContextMenu && (
        <TabContextMenu
          position={contextMenuPos}
          pinned={pinned || false}
          color={color || null}
          onClose={() => setShowContextMenu(false)}
          onNewTab={onNewTab}
          onDuplicate={onDuplicate}
          onRename={handleStartRename}
          onTogglePinned={onTogglePinned}
          onColorChange={onColorChange}
          onCloseTab={onClose}
          onCloseOtherTabs={onCloseOtherTabs}
          onCloseAllTabs={onCloseAllTabs}
          onForceCloseAllTabs={onForceCloseAllTabs}
        />
      )}
    </>
  );
}
