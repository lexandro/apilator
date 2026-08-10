// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act , cleanup } from '@testing-library/react';

vi.mock('../services/persistenceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/persistenceService')>();
  return {
    ...actual,
    persistenceService: {
      loadAppState: vi.fn(),
      saveAppState: vi.fn().mockResolvedValue(undefined),
      stateToTabs: vi.fn().mockReturnValue([]),
      stateToClosedTabs: vi.fn().mockReturnValue([]),
      stateToHistory: vi.fn().mockReturnValue([]),
      getDataPath: vi.fn(),
    },
  };
});

import { usePersistence } from './usePersistence';
import { persistenceService } from '../services';
import { useTabsStore, useHistoryStore } from '../stores';
import { createTab } from '../domain';
import type { AppState } from '../services';

const loadAppState = vi.mocked(persistenceService.loadAppState);
const saveAppState = vi.mocked(persistenceService.saveAppState);
const stateToTabs = vi.mocked(persistenceService.stateToTabs);
const stateToClosedTabs = vi.mocked(persistenceService.stateToClosedTabs);
const stateToHistory = vi.mocked(persistenceService.stateToHistory);

const SAVE_DEBOUNCE_MS = 1000;

/**
 * Fake timers stop waitFor from ever advancing, so readiness is awaited by flushing the
 * microtask queue instead - the load path is a promise chain, not a timer.
 */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function savedState(activeTabId = 'restored-1'): AppState {
  return { version: 2, tabs: [], activeTabId, history: [] } as unknown as AppState;
}

beforeEach(() => {
  vi.useFakeTimers();
  loadAppState.mockReset().mockResolvedValue(null);
  saveAppState.mockClear();
  stateToTabs.mockReset().mockReturnValue([]);
  stateToClosedTabs.mockReset().mockReturnValue([]);
  stateToHistory.mockReset().mockReturnValue([]);

  const tab = createTab();
  useTabsStore.setState({ tabs: [tab], activeTabId: tab.id, closedTabs: [] });
  useHistoryStore.setState({ history: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Without an explicit cleanup, hooks mounted by earlier tests stay mounted and keep
  // reacting to store changes.
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loading', () => {
  it('reports ready once loading finished, even with nothing saved', async () => {
    const { result } = renderHook(() => usePersistence());

    expect(result.current.isReady).toBe(false);
    await settle();
    expect(result.current.isReady).toBe(true);
  });

  it('hydrates the stores from a saved state', async () => {
    const restored = createTab();
    restored.id = 'restored-1';
    loadAppState.mockResolvedValue(savedState('restored-1'));
    stateToTabs.mockReturnValue([restored]);

    const { result } = renderHook(() => usePersistence());
    await settle();
    expect(result.current.isReady).toBe(true);

    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual(['restored-1']);
    expect(useTabsStore.getState().activeTabId).toBe('restored-1');
  });

  it('falls back to the first tab when the saved active id is gone', async () => {
    const restored = createTab();
    restored.id = 'restored-1';
    loadAppState.mockResolvedValue(savedState('a-tab-that-no-longer-exists'));
    stateToTabs.mockReturnValue([restored]);

    const { result } = renderHook(() => usePersistence());
    await settle();
    expect(result.current.isReady).toBe(true);

    expect(useTabsStore.getState().activeTabId).toBe('restored-1');
  });

  it('keeps the default tab when the saved state has none', async () => {
    const before = useTabsStore.getState().tabs[0].id;
    loadAppState.mockResolvedValue(savedState());
    stateToTabs.mockReturnValue([]);

    const { result } = renderHook(() => usePersistence());
    await settle();
    expect(result.current.isReady).toBe(true);

    expect(useTabsStore.getState().tabs[0].id).toBe(before);
  });

  // B9: a throw here used to leave the app on the splash screen forever.
  it('still becomes ready when loading rejects', async () => {
    loadAppState.mockRejectedValue(new Error('disk on fire'));

    const { result } = renderHook(() => usePersistence());

    await settle();
    expect(result.current.isReady).toBe(true);
  });

  it('still becomes ready when hydration itself throws', async () => {
    loadAppState.mockResolvedValue(savedState());
    stateToTabs.mockImplementation(() => {
      throw new TypeError('tabs is not iterable');
    });

    const { result } = renderHook(() => usePersistence());

    await settle();
    expect(result.current.isReady).toBe(true);
  });
});

describe('saving', () => {
  async function readyHook() {
    const hook = renderHook(() => usePersistence());
    await settle();
    expect(hook.result.current.isReady).toBe(true);
    saveAppState.mockClear();
    return hook;
  }

  it('does not save before loading has finished', () => {
    renderHook(() => usePersistence());

    act(() => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 3);
    });

    expect(saveAppState).not.toHaveBeenCalled();
  });

  it('saves after the debounce once a tab changes', async () => {
    await readyHook();

    act(() => {
      useTabsStore.getState().createNewTab();
    });
    expect(saveAppState).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    expect(saveAppState).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid changes into a single save', async () => {
    await readyHook();

    // Each change must land in its own act, otherwise the effect has not re-registered
    // its timer by the time the clock is advanced.
    for (let i = 0; i < 3; i++) {
      act(() => {
        useTabsStore.getState().createNewTab();
      });
      act(() => {
        vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 100);
      });
    }

    act(() => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    expect(saveAppState).toHaveBeenCalledTimes(1);
  });

  it('saves the current tabs and history', async () => {
    await readyHook();

    act(() => {
      useTabsStore.getState().createNewTab();
    });
    act(() => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    const [tabs, activeTabId] = saveAppState.mock.calls[0];
    expect(tabs).toHaveLength(2);
    expect(activeTabId).toBe(useTabsStore.getState().activeTabId);
  });

  it('flushes the latest snapshot when the window is closing', async () => {
    await readyHook();

    act(() => {
      useTabsStore.getState().createNewTab();
    });
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(saveAppState).toHaveBeenCalledTimes(1);
    expect(saveAppState.mock.calls[0][0]).toHaveLength(2);
  });

  it('stops saving once unmounted', async () => {
    const hook = await readyHook();

    act(() => {
      useTabsStore.getState().createNewTab();
    });
    hook.unmount();

    act(() => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(saveAppState).not.toHaveBeenCalled();
  });
});
