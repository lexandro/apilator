import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  onNewTab: () => void;
  onCloseTab: () => void;
  onSend: () => void;
  onReopenClosedTab: () => void;
}

export function useKeyboardShortcuts({
  onNewTab,
  onCloseTab,
  onSend,
  onReopenClosedTab,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+T - Reopen closed tab
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        onReopenClosedTab();
        return;
      }

      // Ctrl+N or Ctrl+T - New tab
      if (e.ctrlKey && (e.key === 'n' || e.key === 't')) {
        e.preventDefault();
        onNewTab();
      }

      // Ctrl+W - Close tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        onCloseTab();
      }

      // Ctrl+Enter - Send request
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        onSend();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewTab, onCloseTab, onSend, onReopenClosedTab]);
}
