import { useEffect } from 'react';

export function useContextMenuBlock() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isEditable =
        tagName === 'input' ||
        tagName === 'textarea' ||
        target.isContentEditable;

      // Allow context menu on tabs (they have their own custom menu)
      const isTab = target.closest('.tab') !== null;

      // Allow native context menu only on editable elements and tabs
      if (!isEditable && !isTab) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);
}
