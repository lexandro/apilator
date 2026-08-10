import { useRef } from 'react';
import type { TabColor } from '../../domain';
import { TAB_COLORS } from '../../domain';
import { useClickOutside } from '../../hooks/useClickOutside';

interface TabContextMenuProps {
  position: { x: number; y: number };
  pinned: boolean;
  color: TabColor | null;
  onClose: () => void;
  onNewTab: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onTogglePinned: () => void;
  onColorChange: (color: TabColor | null) => void;
  onCloseTab: () => void;
  onCloseOtherTabs: () => void;
  onCloseAllTabs: () => void;
  onForceCloseAllTabs: () => void;
}

export function TabContextMenu({
  position,
  pinned,
  color,
  onClose,
  onNewTab,
  onDuplicate,
  onRename,
  onTogglePinned,
  onColorChange,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onForceCloseAllTabs,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, onClose);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="tab-context-menu"
      style={{ left: position.x, top: position.y }}
    >
      <button onClick={() => handleAction(onNewTab)}>
        New Request
        <span className="tab-context-shortcut">Ctrl+N</span>
      </button>
      <button onClick={() => handleAction(onDuplicate)}>
        Duplicate Tab
      </button>
      <div className="tab-context-menu-divider" />
      <button onClick={onRename}>Rename</button>
      <button onClick={() => handleAction(onTogglePinned)}>
        {pinned ? 'Unpin' : 'Pin'}
      </button>
      <div className="tab-context-menu-divider" />
      <div className="tab-context-menu-colors">
        {TAB_COLORS.map((c) => (
          <button
            key={c}
            className={`tab-color-btn ${color === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => handleAction(() => onColorChange(c))}
            title={c}
          />
        ))}
      </div>
      <div className="tab-context-menu-actions">
        <button
          className="tab-context-reset"
          onClick={() => handleAction(() => onColorChange(null))}
        >
          Reset
        </button>
      </div>
      <div className="tab-context-menu-divider" />
      <button onClick={() => handleAction(onCloseTab)}>
        Close Tab
        <span className="tab-context-shortcut">Ctrl+W</span>
      </button>
      <button onClick={() => handleAction(onCloseOtherTabs)}>
        Close Other Tabs
      </button>
      <button onClick={() => handleAction(onCloseAllTabs)}>
        Close All Tabs
      </button>
      <button
        className="tab-context-dangerous"
        onClick={() => handleAction(onForceCloseAllTabs)}
      >
        Force Close All Tabs
      </button>
    </div>
  );
}
