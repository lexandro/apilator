import { useEffect, RefObject } from 'react';

type ElementRef = RefObject<HTMLElement | null>;

/**
 * Pass every element that counts as "inside" — a menu rendered through a portal is not a
 * DOM descendant of its trigger, and leaving it out closes the menu on the mousedown that
 * precedes the click on an option.
 */
export function useClickOutside(
  refs: ElementRef | ElementRef[],
  onClickOutside: () => void,
  isActive: boolean = true
): void {
  useEffect(() => {
    if (!isActive) return;

    const list = Array.isArray(refs) ? refs : [refs];

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inside = list.some((ref) => ref.current?.contains(target));
      if (!inside && list.some((ref) => ref.current)) {
        onClickOutside();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [refs, onClickOutside, isActive]);
}
