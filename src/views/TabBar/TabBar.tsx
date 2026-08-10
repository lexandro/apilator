import { useRef } from 'react';
import type { Tab as TabType, TabColor } from '../../domain';
import { Tab } from './Tab';
import { DragGhost } from './DragGhost';
import { useTabScroll, useTabDrag } from './hooks';
import './TabBar.css';

interface TabBarProps {
  tabs: TabType[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onTabRename: (tabId: string, name: string | undefined) => void;
  onTabColorChange: (tabId: string, color: TabColor) => void;
  onTabTogglePinned: (tabId: string) => void;
  onTabDuplicate: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseAllTabs: () => void;
  onForceCloseAllTabs: () => void;
  onTabReorder: (fromId: string, toId: string, position: 'before' | 'after') => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
  onTabRename,
  onTabColorChange,
  onTabTogglePinned,
  onTabDuplicate,
  onCloseOtherTabs,
  onCloseAllTabs,
  onForceCloseAllTabs,
  onTabReorder,
}: TabBarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const { canScrollLeft, canScrollRight, scroll, hasOverflow } = useTabScroll(tabsRef, [tabs]);

  const { dragState, handleMouseDragStart, isDragging, isDropTarget, getDropPosition } = useTabDrag(
    tabsRef,
    { tabs, onReorder: onTabReorder }
  );

  const draggedTab = dragState.isDragging
    ? tabs.find((t) => t.id === dragState.draggedTabId)
    : null;

  return (
    <div className="tabbar">
      {canScrollLeft && (
        <button
          className="tabbar-scroll tabbar-scroll--left"
          onClick={() => scroll('left')}
          aria-label="Scroll tabs left"
        >
          ‹
        </button>
      )}

      <div className="tabbar-tabs" ref={tabsRef}>
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onTabSelect(tab.id)}
            onClose={() => onTabClose(tab.id)}
            onRename={(name) => onTabRename(tab.id, name)}
            onColorChange={(color) => onTabColorChange(tab.id, color)}
            onTogglePinned={() => onTabTogglePinned(tab.id)}
            onNewTab={onNewTab}
            onDuplicate={() => onTabDuplicate(tab.id)}
            onCloseOtherTabs={() => onCloseOtherTabs(tab.id)}
            onCloseAllTabs={onCloseAllTabs}
            onForceCloseAllTabs={onForceCloseAllTabs}
            isDragging={isDragging(tab.id)}
            isDropTarget={isDropTarget(tab.id)}
            dropPosition={getDropPosition(tab.id)}
            onMouseDragStart={handleMouseDragStart}
          />
        ))}
        {!hasOverflow && (
          <button
            className="tabbar-new"
            onClick={onNewTab}
            title="New tab (Ctrl+N)"
            aria-label="New tab"
          >
            +
          </button>
        )}
      </div>

      {canScrollRight && (
        <button
          className="tabbar-scroll tabbar-scroll--right"
          onClick={() => scroll('right')}
          aria-label="Scroll tabs right"
        >
          ›
        </button>
      )}

      {hasOverflow && (
        <button
          className="tabbar-new tabbar-new--fixed"
          onClick={onNewTab}
          title="New tab (Ctrl+N)"
          aria-label="New tab"
        >
          +
        </button>
      )}

      {draggedTab && (
        <DragGhost
          tab={draggedTab}
          x={dragState.currentX - dragState.ghostOffsetX}
          y={dragState.currentY - dragState.ghostOffsetY}
        />
      )}
    </div>
  );
}
