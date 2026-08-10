import { create } from 'zustand';
import type { Tab, HttpRequest, RequestState, TabColor } from '../domain';
import { createTab } from '../domain';

// ============================================================
// Tab Operations (pure functions)
// ============================================================

function closeTabOperation(
  tabs: Tab[],
  tabId: string,
  activeTabId: string
): { newTabs: Tab[]; newActiveTabId: string } {
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return { newTabs: tabs, newActiveTabId: activeTabId };

  const newTabs = tabs.filter((t) => t.id !== tabId);

  if (newTabs.length === 0) {
    const newTab = createTab();
    return { newTabs: [newTab], newActiveTabId: newTab.id };
  }

  let newActiveTabId = activeTabId;
  if (tabId === activeTabId) {
    const newIndex = Math.min(index, newTabs.length - 1);
    newActiveTabId = newTabs[newIndex].id;
  }

  return { newTabs, newActiveTabId };
}

function duplicateTabOperation(tab: Tab): Tab {
  return {
    id: crypto.randomUUID(),
    request: { ...tab.request, id: crypto.randomUUID() },
    requestState: { status: 'idle' },
    isDirty: false,
    name: undefined,
    color: null,
    pinned: false,
  };
}

function closeOtherTabsOperation(
  tabs: Tab[],
  keepTabId: string,
  activeTabId: string
): { newTabs: Tab[]; newActiveTabId: string } {
  const filtered = tabs.filter((t) => t.id === keepTabId || t.pinned);

  if (filtered.length === 0) {
    const newTab = createTab();
    return { newTabs: [newTab], newActiveTabId: newTab.id };
  }

  const newActiveTabId = filtered.some((t) => t.id === activeTabId)
    ? activeTabId
    : filtered[0].id;

  return { newTabs: filtered, newActiveTabId };
}

function closeAllTabsOperation(tabs: Tab[]): { newTabs: Tab[]; newActiveTabId: string } {
  const pinned = tabs.filter((t) => t.pinned);

  if (pinned.length === 0) {
    const newTab = createTab();
    return { newTabs: [newTab], newActiveTabId: newTab.id };
  }

  return { newTabs: pinned, newActiveTabId: pinned[0].id };
}

function reorderTabsOperation(
  tabs: Tab[],
  fromId: string,
  toId: string,
  position: 'before' | 'after'
): Tab[] {
  const fromIndex = tabs.findIndex((t) => t.id === fromId);
  const toIndex = tabs.findIndex((t) => t.id === toId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return tabs;

  const fromTab = tabs[fromIndex];
  const toTab = tabs[toIndex];

  if (fromTab.pinned !== toTab.pinned) return tabs;

  const newTabs = [...tabs];
  newTabs.splice(fromIndex, 1);

  let insertIndex = newTabs.findIndex((t) => t.id === toId);
  if (position === 'after') insertIndex++;

  newTabs.splice(insertIndex, 0, fromTab);
  return newTabs;
}

function togglePinnedOperation(tabs: Tab[], tabId: string): Tab[] {
  const updated = tabs.map((tab) =>
    tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab
  );

  return updated.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });
}

// ============================================================
// Constants
// ============================================================

const MAX_CLOSED_TABS = 20;

// ============================================================
// Store Interface
// ============================================================

interface TabsState {
  // State
  tabs: Tab[];
  activeTabId: string;
  closedTabs: Tab[];

  // Computed
  getActiveTab: () => Tab | undefined;

  // Actions
  createNewTab: () => void;
  addTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  updateRequest: (tabId: string, request: HttpRequest) => void;
  updateRequestState: (tabId: string, requestState: RequestState) => void;
  setTabDirty: (tabId: string, isDirty: boolean) => void;
  renameTab: (tabId: string, name: string | undefined) => void;
  setTabColor: (tabId: string, color: TabColor) => void;
  toggleTabPinned: (tabId: string) => void;
  updateTab: (tabId: string, request: HttpRequest) => void;
  duplicateTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  forceCloseAllTabs: () => void;
  reorderTabs: (fromId: string, toId: string, position: 'before' | 'after') => void;
  reopenLastClosedTab: () => void;

  // Hydration (from persistence)
  hydrate: (tabs: Tab[], activeTabId: string, closedTabs?: Tab[]) => void;
}

// ============================================================
// Store Creation
// ============================================================

const initialTab = createTab();

export const useTabsStore = create<TabsState>((set, get) => ({
  // Initial state
  tabs: [initialTab],
  activeTabId: initialTab.id,
  closedTabs: [],

  // Computed
  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },

  // Actions
  createNewTab: () => {
    const newTab = createTab();
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  addTab: (tab) => {
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
  },

  closeTab: (tabId) => {
    const tabToClose = get().tabs.find((t) => t.id === tabId);

    set((state) => {
      const { newTabs, newActiveTabId } = closeTabOperation(state.tabs, tabId, state.activeTabId);

      // Add closed tab to stack (if it existed)
      const newClosedTabs = tabToClose
        ? [tabToClose, ...state.closedTabs].slice(0, MAX_CLOSED_TABS)
        : state.closedTabs;

      return { tabs: newTabs, activeTabId: newActiveTabId, closedTabs: newClosedTabs };
    });
  },

  selectTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateRequest: (tabId, request) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, request, isDirty: true } : tab
      ),
    }));
  },

  updateRequestState: (tabId, requestState) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, requestState } : tab
      ),
    }));
  },

  setTabDirty: (tabId, isDirty) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, isDirty } : tab
      ),
    }));
  },

  renameTab: (tabId, name) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, name } : tab
      ),
    }));
  },

  setTabColor: (tabId, color) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, color } : tab
      ),
    }));
  },

  toggleTabPinned: (tabId) => {
    set((state) => ({
      tabs: togglePinnedOperation(state.tabs, tabId),
    }));
  },

  updateTab: (tabId, request) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              request: { ...request, id: crypto.randomUUID() },
              requestState: { status: 'idle' },
              isDirty: false,
            }
          : tab
      ),
      activeTabId: tabId,
    }));
  },

  duplicateTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const newTab = duplicateTabOperation(tab);
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const { newTabs, newActiveTabId } = closeOtherTabsOperation(
        state.tabs,
        tabId,
        state.activeTabId
      );
      return { tabs: newTabs, activeTabId: newActiveTabId };
    });
  },

  closeAllTabs: () => {
    set((state) => {
      const { newTabs, newActiveTabId } = closeAllTabsOperation(state.tabs);
      return { tabs: newTabs, activeTabId: newActiveTabId };
    });
  },

  forceCloseAllTabs: () => {
    const newTab = createTab();
    set({ tabs: [newTab], activeTabId: newTab.id });
  },

  reorderTabs: (fromId, toId, position) => {
    set((state) => ({
      tabs: reorderTabsOperation(state.tabs, fromId, toId, position),
    }));
  },

  reopenLastClosedTab: () => {
    const { closedTabs } = get();
    if (closedTabs.length === 0) return;

    const [tabToReopen, ...remainingClosed] = closedTabs;

    // Create restored tab with new ID to avoid conflicts
    const restoredTab: Tab = {
      ...tabToReopen,
      id: crypto.randomUUID(),
      request: { ...tabToReopen.request, id: crypto.randomUUID() },
      requestState: { status: 'idle' },
    };

    set((state) => ({
      tabs: [...state.tabs, restoredTab],
      activeTabId: restoredTab.id,
      closedTabs: remainingClosed,
    }));
  },

  // Hydration
  hydrate: (tabs, activeTabId, closedTabs) => {
    set({ tabs, activeTabId, closedTabs: closedTabs ?? [] });
  },
}));
