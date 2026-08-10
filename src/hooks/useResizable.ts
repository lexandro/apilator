import { useCallback, useEffect, useRef, useState } from 'react';

interface UseResizableOptions {
  direction: 'horizontal' | 'vertical';
  initialSize: number;
  minSize: number;
  maxSize: number;
  storageKey?: string;
  /** Reference element to calculate percentage-based resizing */
  percentageOf?: () => number;
}

export function useResizable({
  direction,
  initialSize,
  minSize,
  maxSize,
  storageKey,
  percentageOf,
}: UseResizableOptions) {
  const containerRef = useRef<HTMLElement | null>(null);
  const isResizingRef = useRef(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);
  const currentSizeRef = useRef<number>(initialSize);
  const rafRef = useRef<number | null>(null);

  // Get initial size
  const getInitialSize = useCallback(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed)) return Math.min(Math.max(parsed, minSize), maxSize);
      }
    }
    return initialSize;
  }, [storageKey, initialSize, minSize, maxSize]);

  // Set CSS variable directly on container
  const updateSize = useCallback((newSize: number) => {
    currentSizeRef.current = newSize;
    if (containerRef.current) {
      containerRef.current.style.setProperty('--resize-size', `${newSize}`);
    }
  }, []);

  // Initialize size on mount
  const setContainerRef = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
    if (element) {
      const size = getInitialSize();
      currentSizeRef.current = size;
      element.style.setProperty('--resize-size', `${size}`);
    }
  }, [getInitialSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    isResizingRef.current = true;
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSizeRef.current = currentSizeRef.current;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.classList.add('resizing');
  }, [direction]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;

      // Cancel previous frame
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      // Schedule update on next frame
      rafRef.current = requestAnimationFrame(() => {
        const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
        const pixelDelta = currentPos - startPosRef.current;

        // Convert pixel delta to value delta (for percentage-based resizing)
        let delta = pixelDelta;
        if (percentageOf) {
          const containerSize = percentageOf();
          if (containerSize > 0) {
            delta = (pixelDelta / containerSize) * 100;
          }
        }

        const newSize = Math.min(Math.max(startSizeRef.current + delta, minSize), maxSize);
        updateSize(newSize);
      });
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) return;

      isResizingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.body.classList.remove('resizing');

      // Save to localStorage
      if (storageKey) {
        localStorage.setItem(storageKey, currentSizeRef.current.toString());
      }

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [direction, minSize, maxSize, storageKey, updateSize, percentageOf]);

  // Reading localStorage on every render would be a synchronous call per keystroke.
  const [resolvedInitialSize] = useState(getInitialSize);

  return {
    containerRef: setContainerRef,
    handleMouseDown,
    initialSize: resolvedInitialSize,
  };
}
