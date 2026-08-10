import { useCallback, useEffect, useRef, useState } from 'react';
import { updaterService, type UpdateInfo } from '../services';

export type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'uptodate' | 'error';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 5000;

export interface UpdaterState {
  status: UpdaterStatus;
  update: UpdateInfo | null;
  message: string;
  progress: number | null;
  dismissed: boolean;
  check: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

/**
 * Checks in the background but never downloads unattended: an update is offered, and the
 * user decides. An automatic check stays silent unless it finds something.
 */
export function useUpdater(autoCheck = true): UpdaterState {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const busyRef = useRef(false);

  const check = useCallback(async (manual = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus('checking');
    setMessage('');

    try {
      const found = await updaterService.checkForUpdate();

      if (found) {
        setUpdate(found);
        setDismissed(false);
        setStatus('available');
      } else {
        setUpdate(null);
        setStatus(manual ? 'uptodate' : 'idle');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      // A failed background check is not worth interrupting anyone over.
      setStatus(manual ? 'error' : 'idle');
    } finally {
      busyRef.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    if (busyRef.current || !updaterService.hasPendingUpdate()) return;
    busyRef.current = true;
    setStatus('downloading');
    setProgress(0);

    try {
      await updaterService.installUpdate((downloaded, total) => {
        setProgress(total ? Math.round((downloaded / total) * 100) : null);
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStatus('error');
    } finally {
      busyRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  useEffect(() => {
    if (!autoCheck) return;

    const first = setTimeout(() => void check(false), FIRST_CHECK_DELAY_MS);
    const periodic = setInterval(() => void check(false), SIX_HOURS_MS);

    return () => {
      clearTimeout(first);
      clearInterval(periodic);
    };
  }, [autoCheck, check]);

  return { status, update, message, progress, dismissed, check, install, dismiss };
}
