import { useEffect, useRef, useState } from 'react';
import { useTabsStore, useHistoryStore } from '../stores';
import { persistenceService } from '../services';

const SAVE_DEBOUNCE_MS = 1000;

/**
 * Owns loading and saving the app state, so the view layer never touches a service.
 * Returns false until the saved state has been restored (or found to be unusable).
 */
export function usePersistence(): { isReady: boolean } {
  const [isReady, setIsReady] = useState(false);

  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const closedTabs = useTabsStore((s) => s.closedTabs);
  const hydrateTabs = useTabsStore((s) => s.hydrate);

  const history = useHistoryStore((s) => s.history);
  const hydrateHistory = useHistoryStore((s) => s.hydrate);

  useEffect(() => {
    persistenceService
      .loadAppState()
      .then((state) => {
        if (!state) return;

        const loadedTabs = persistenceService.stateToTabs(state);
        if (loadedTabs.length > 0) {
          const activeExists = loadedTabs.some((t) => t.id === state.activeTabId);
          hydrateTabs(
            loadedTabs,
            activeExists ? state.activeTabId : loadedTabs[0].id,
            persistenceService.stateToClosedTabs(state)
          );
        }

        hydrateHistory(persistenceService.stateToHistory(state));
      })
      .catch((error) => {
        // Whatever went wrong, the app must still start rather than sit on the splash
        // screen forever.
        console.error('Failed to restore saved state:', error);
      })
      .finally(() => setIsReady(true));
  }, [hydrateTabs, hydrateHistory]);

  // The listener reads the latest snapshot from a ref, so it is registered once instead
  // of being torn down and re-added on every keystroke.
  const snapshotRef = useRef({ tabs, activeTabId, history, closedTabs });
  snapshotRef.current = { tabs, activeTabId, history, closedTabs };

  useEffect(() => {
    if (!isReady) return;

    const handleBeforeUnload = () => {
      const snapshot = snapshotRef.current;
      persistenceService.saveAppState(
        snapshot.tabs,
        snapshot.activeTabId,
        snapshot.history,
        snapshot.closedTabs
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;

    const timeout = setTimeout(() => {
      persistenceService.saveAppState(tabs, activeTabId, history, closedTabs);
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [tabs, activeTabId, history, closedTabs, isReady]);

  return { isReady };
}
