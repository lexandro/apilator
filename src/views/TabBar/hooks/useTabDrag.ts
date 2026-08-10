import { useState, useEffect, useCallback, RefObject } from 'react';
import type { Tab } from '../../../domain';

export interface DragState {
  draggedTabId: string | null;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | null;
  isDragging: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  ghostOffsetX: number;
  ghostOffsetY: number;
}

const INITIAL_DRAG_STATE: DragState = {
  draggedTabId: null,
  dropTargetId: null,
  dropPosition: null,
  isDragging: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  ghostOffsetX: 0,
  ghostOffsetY: 0,
};

const DRAG_THRESHOLD = 5; // pixels before drag starts

interface UseTabDragOptions {
  tabs: Tab[];
  onReorder: (fromId: string, toId: string, position: 'before' | 'after') => void;
}

interface UseTabDragReturn {
  dragState: DragState;
  handleMouseDragStart: (tabId: string, e: React.MouseEvent) => void;
  isDragging: (tabId: string) => boolean;
  isDropTarget: (tabId: string) => boolean;
  getDropPosition: (tabId: string) => 'before' | 'after' | null;
}

export function useTabDrag(
  containerRef: RefObject<HTMLDivElement | null>,
  { tabs, onReorder }: UseTabDragOptions
): UseTabDragReturn {
  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE);

  const handleMouseDragStart = useCallback((tabId: string, e: React.MouseEvent) => {
    const tabElement = (e.target as HTMLElement).closest('[data-tab-id]');
    const rect = tabElement?.getBoundingClientRect();
    const offsetX = rect ? e.clientX - rect.left : 0;
    const offsetY = rect ? e.clientY - rect.top : 0;

    setDragState({
      draggedTabId: tabId,
      dropTargetId: null,
      dropPosition: null,
      isDragging: false,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      ghostOffsetX: offsetX,
      ghostOffsetY: offsetY,
    });
  }, []);

  const findTabAtPosition = useCallback((x: number, y: number): { tabId: string; position: 'before' | 'after' } | null => {
    const container = containerRef.current;
    if (!container) return null;

    const tabElements = container.querySelectorAll('[data-tab-id]');
    for (const el of tabElements) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const tabId = el.getAttribute('data-tab-id');
        if (!tabId) continue;

        const midpoint = rect.left + rect.width / 2;
        const position = x < midpoint ? 'before' : 'after';
        return { tabId, position };
      }
    }
    return null;
  }, [containerRef]);

  // Global mouse move/up handlers
  useEffect(() => {
    if (!dragState.draggedTabId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - dragState.startX);
      const dy = Math.abs(e.clientY - dragState.startY);

      const shouldDrag = dragState.isDragging || dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD;

      if (shouldDrag) {
        const target = findTabAtPosition(e.clientX, e.clientY);
        let dropTargetId: string | null = null;
        let dropPosition: 'before' | 'after' | null = null;

        if (target && target.tabId !== dragState.draggedTabId) {
          const draggedTab = tabs.find((t) => t.id === dragState.draggedTabId);
          const targetTab = tabs.find((t) => t.id === target.tabId);

          if (draggedTab && targetTab && draggedTab.pinned === targetTab.pinned) {
            dropTargetId = target.tabId;
            dropPosition = target.position;
          }
        }

        setDragState((prev) => ({
          ...prev,
          isDragging: true,
          currentX: e.clientX,
          currentY: e.clientY,
          dropTargetId,
          dropPosition,
        }));
      }
    };

    const handleMouseUp = () => {
      if (dragState.isDragging && dragState.dropTargetId && dragState.dropPosition) {
        onReorder(dragState.draggedTabId!, dragState.dropTargetId, dragState.dropPosition);
      }

      setDragState(INITIAL_DRAG_STATE);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, tabs, findTabAtPosition, onReorder]);

  const isDragging = useCallback(
    (tabId: string) => dragState.isDragging && dragState.draggedTabId === tabId,
    [dragState.isDragging, dragState.draggedTabId]
  );

  const isDropTarget = useCallback(
    (tabId: string) => dragState.dropTargetId === tabId,
    [dragState.dropTargetId]
  );

  const getDropPosition = useCallback(
    (tabId: string) => (dragState.dropTargetId === tabId ? dragState.dropPosition : null),
    [dragState.dropTargetId, dragState.dropPosition]
  );

  return {
    dragState,
    handleMouseDragStart,
    isDragging,
    isDropTarget,
    getDropPosition,
  };
}
