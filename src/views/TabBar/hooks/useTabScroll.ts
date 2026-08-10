import { useState, useEffect, useCallback, RefObject } from 'react';

interface UseTabScrollReturn {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scroll: (direction: 'left' | 'right') => void;
  hasOverflow: boolean;
}

export function useTabScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  deps: unknown[] = []
): UseTabScrollReturn {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, [containerRef]);

  useEffect(() => {
    updateScrollButtons();

    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);

    const resizeObserver = new ResizeObserver(updateScrollButtons);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
      resizeObserver.disconnect();
    };
  }, [containerRef, updateScrollButtons]);

  useEffect(() => {
    updateScrollButtons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const container = containerRef.current;
    if (!container) return;

    const scrollAmount = 200;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, [containerRef]);

  const hasOverflow = canScrollLeft || canScrollRight;

  return {
    canScrollLeft,
    canScrollRight,
    scroll,
    hasOverflow,
  };
}
