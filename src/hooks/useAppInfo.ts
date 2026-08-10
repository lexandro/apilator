import { useEffect, useState } from 'react';
import { systemService, type AppInfo } from '../services';

/** Keeps the About panel free of direct backend calls. */
export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    systemService.getAppInfo().then((loaded) => {
      if (!cancelled) setInfo(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
