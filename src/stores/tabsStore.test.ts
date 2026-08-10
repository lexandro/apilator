import { describe, it, expect, beforeEach } from 'vitest';
import { useTabsStore } from './tabsStore';
import { createTab } from '../domain';

function reset() {
  const tab = createTab();
  useTabsStore.setState({ tabs: [tab], activeTabId: tab.id, closedTabs: [] });
  return tab;
}

const store = () => useTabsStore.getState();

function openTab(): string {
  store().createNewTab();
  return store().activeTabId;
}

describe('tabsStore', () => {
  beforeEach(reset);

  describe('createNewTab', () => {
    it('appends the tab and makes it active', () => {
      const first = store().tabs[0].id;
      const created = openTab();

      expect(store().tabs).toHaveLength(2);
      expect(store().tabs[0].id).toBe(first);
      expect(store().activeTabId).toBe(created);
    });

    it('gives every tab a distinct id', () => {
      openTab();
      openTab();
      const ids = store().tabs.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('closeTab', () => {
    it('removes the tab', () => {
      const second = openTab();
      store().closeTab(second);
      expect(store().tabs.map((t) => t.id)).not.toContain(second);
    });

    it('never leaves the window without a tab', () => {
      const only = store().tabs[0].id;
      store().closeTab(only);

      expect(store().tabs).toHaveLength(1);
      expect(store().tabs[0].id).not.toBe(only);
      expect(store().activeTabId).toBe(store().tabs[0].id);
    });

    it('activates the tab that slid into the closed one\'s position', () => {
      const a = store().tabs[0].id;
      const b = openTab();
      const c = openTab();

      store().selectTab(b);
      store().closeTab(b);

      expect(store().tabs.map((t) => t.id)).toEqual([a, c]);
      expect(store().activeTabId).toBe(c);
    });

    it('activates the last tab when the rightmost one is closed', () => {
      const a = store().tabs[0].id;
      const b = openTab();
      store().closeTab(b);
      expect(store().activeTabId).toBe(a);
    });

    it('leaves the active tab alone when a different tab is closed', () => {
      const a = store().tabs[0].id;
      const b = openTab();
      store().selectTab(a);
      store().closeTab(b);
      expect(store().activeTabId).toBe(a);
    });

    it('ignores an unknown tab id', () => {
      const before = store().tabs.map((t) => t.id);
      store().closeTab('does-not-exist');
      expect(store().tabs.map((t) => t.id)).toEqual(before);
    });
  });

  describe('reopenLastClosedTab', () => {
    it('restores the most recently closed tab', () => {
      const b = openTab();
      store().renameTab(b, 'important request');
      store().closeTab(b);

      store().reopenLastClosedTab();

      expect(store().tabs).toHaveLength(2);
      expect(store().tabs[1].name).toBe('important request');
      expect(store().activeTabId).toBe(store().tabs[1].id);
    });

    it('gives the restored tab a fresh id so it cannot collide with a live tab', () => {
      const b = openTab();
      store().closeTab(b);
      store().reopenLastClosedTab();

      expect(store().tabs[1].id).not.toBe(b);
    });

    it('pops the stack, so reopening twice restores two different tabs', () => {
      const b = openTab();
      const c = openTab();
      store().renameTab(b, 'B');
      store().renameTab(c, 'C');
      store().closeTab(b);
      store().closeTab(c);

      store().reopenLastClosedTab();
      store().reopenLastClosedTab();

      const names = store().tabs.map((t) => t.name);
      expect(names).toContain('B');
      expect(names).toContain('C');
      expect(store().closedTabs).toHaveLength(0);
    });

    it('does nothing when nothing has been closed', () => {
      const before = store().tabs.length;
      store().reopenLastClosedTab();
      expect(store().tabs).toHaveLength(before);
    });

    it('caps the closed-tab stack at 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        const id = openTab();
        store().closeTab(id);
      }
      expect(store().closedTabs).toHaveLength(20);
    });
  });

  describe('duplicateTab', () => {
    it('copies the request but gives the copy new ids', () => {
      const a = store().tabs[0].id;
      const original = store().tabs[0].request;
      store().updateRequest(a, { ...original, url: 'https://api.example.com/users' });

      store().duplicateTab(a);

      const copy = store().tabs[1];
      expect(copy.request.url).toBe('https://api.example.com/users');
      expect(copy.id).not.toBe(a);
      expect(copy.request.id).not.toBe(original.id);
    });

    it('does not carry over the name, colour or pinned flag', () => {
      const a = store().tabs[0].id;
      store().renameTab(a, 'original');
      store().setTabColor(a, '#e81123');
      store().toggleTabPinned(a);

      store().duplicateTab(a);
      const copy = store().tabs.find((t) => t.id === store().activeTabId)!;

      expect(copy.name).toBeUndefined();
      expect(copy.color).toBeNull();
      expect(copy.pinned).toBe(false);
    });
  });

  describe('pinning', () => {
    it('moves pinned tabs to the front', () => {
      openTab();
      const c = openTab();
      store().toggleTabPinned(c);
      expect(store().tabs[0].id).toBe(c);
    });

    it('unpinning is the inverse of pinning', () => {
      const b = openTab();
      store().toggleTabPinned(b);
      store().toggleTabPinned(b);
      expect(store().tabs.find((t) => t.id === b)!.pinned).toBe(false);
    });
  });

  describe('closeOtherTabs', () => {
    it('keeps the target tab', () => {
      const b = openTab();
      openTab();
      store().closeOtherTabs(b);
      expect(store().tabs.map((t) => t.id)).toEqual([b]);
    });

    it('keeps pinned tabs as well', () => {
      const a = store().tabs[0].id;
      const b = openTab();
      openTab();
      store().toggleTabPinned(a);

      store().closeOtherTabs(b);

      const ids = store().tabs.map((t) => t.id);
      expect(ids).toContain(a);
      expect(ids).toContain(b);
      expect(ids).toHaveLength(2);
    });
  });

  describe('closeAllTabs', () => {
    it('keeps pinned tabs', () => {
      const a = store().tabs[0].id;
      openTab();
      store().toggleTabPinned(a);

      store().closeAllTabs();

      expect(store().tabs.map((t) => t.id)).toEqual([a]);
    });

    it('opens a fresh tab when nothing was pinned', () => {
      const a = store().tabs[0].id;
      openTab();

      store().closeAllTabs();

      expect(store().tabs).toHaveLength(1);
      expect(store().tabs[0].id).not.toBe(a);
    });
  });

  describe('forceCloseAllTabs', () => {
    it('discards pinned tabs too', () => {
      const a = store().tabs[0].id;
      store().toggleTabPinned(a);

      store().forceCloseAllTabs();

      expect(store().tabs).toHaveLength(1);
      expect(store().tabs[0].id).not.toBe(a);
      expect(store().tabs[0].pinned).toBe(false);
    });
  });

  describe('reorderTabs', () => {
    it('moves a tab before another', () => {
      const a = store().tabs[0].id;
      const b = openTab();
      const c = openTab();

      store().reorderTabs(c, a, 'before');

      expect(store().tabs.map((t) => t.id)).toEqual([c, a, b]);
    });

    it('moves a tab after another', () => {
      const a = store().tabs[0].id;
      const b = openTab();
      const c = openTab();

      store().reorderTabs(a, c, 'after');

      expect(store().tabs.map((t) => t.id)).toEqual([b, c, a]);
    });

    it('refuses to move a tab across the pinned boundary', () => {
      const a = store().tabs[0].id;
      const b = openTab();
      store().toggleTabPinned(a);

      const before = store().tabs.map((t) => t.id);
      store().reorderTabs(b, a, 'before');

      expect(store().tabs.map((t) => t.id)).toEqual(before);
    });

    it('is a no-op for unknown ids or a self-move', () => {
      const a = store().tabs[0].id;
      const b = openTab();
      const before = store().tabs.map((t) => t.id);

      store().reorderTabs(a, 'nope', 'before');
      store().reorderTabs(b, b, 'after');

      expect(store().tabs.map((t) => t.id)).toEqual(before);
    });
  });

  describe('dirty tracking', () => {
    it('marks the tab dirty when the request changes', () => {
      const a = store().tabs[0].id;
      store().updateRequest(a, { ...store().tabs[0].request, url: 'https://x.test' });
      expect(store().tabs[0].isDirty).toBe(true);
    });

    it('updateRequestState does not mark the tab dirty', () => {
      const a = store().tabs[0].id;
      store().updateRequestState(a, { status: 'loading' });
      expect(store().tabs[0].isDirty).toBe(false);
    });
  });

  describe('getActiveTab', () => {
    it('returns the active tab', () => {
      const b = openTab();
      expect(store().getActiveTab()?.id).toBe(b);
    });

    it('returns undefined when the active id points nowhere', () => {
      useTabsStore.setState({ activeTabId: 'missing' });
      expect(store().getActiveTab()).toBeUndefined();
    });
  });
});
