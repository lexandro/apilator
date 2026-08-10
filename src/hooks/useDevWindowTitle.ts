import { useEffect } from 'react';
import { systemService } from '../services';

/** Marks the window so a dev build is never mistaken for the installed app. */
export function useDevWindowTitle(title: string) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    systemService.setWindowTitle(title);
  }, [title]);
}
