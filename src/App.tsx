import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

import { TabBar } from './views/TabBar';
import { RequestBuilder } from './views/RequestBuilder';
import { ResponseViewer } from './views/ResponseViewer';
import { Sidebar } from './views/Sidebar';
import { SettingsModal } from './views/Settings';
import { EnvironmentSelector, EnvironmentsModal } from './views/Environments';

import {
  useKeyboardShortcuts,
  useContextMenuBlock,
  useResizable,
  useRequestActions,
  usePersistence,
  useDevWindowTitle,
  useUpdater,
} from './hooks';
import {
  useTabsStore,
  useHistoryStore,
  useSettingsStore,
  useCollectionsStore,
  useEnvironmentsStore,
} from './stores';
import type { HttpRequest, HistoryEntry, Tab } from './domain';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX_RATIO = 2 / 3;
const REQUEST_MIN_RATIO = 1 / 3;
const REQUEST_MAX_RATIO = 2 / 3;

function App() {
  // Stores
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = useTabsStore((s) => s.getActiveTab());
  const createNewTab = useTabsStore((s) => s.createNewTab);
  const addTab = useTabsStore((s) => s.addTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const selectTab = useTabsStore((s) => s.selectTab);
  const updateRequest = useTabsStore((s) => s.updateRequest);
  const updateRequestState = useTabsStore((s) => s.updateRequestState);
  const renameTab = useTabsStore((s) => s.renameTab);
  const setTabColor = useTabsStore((s) => s.setTabColor);
  const toggleTabPinned = useTabsStore((s) => s.toggleTabPinned);
  const updateTab = useTabsStore((s) => s.updateTab);
  const duplicateTab = useTabsStore((s) => s.duplicateTab);
  const closeOtherTabs = useTabsStore((s) => s.closeOtherTabs);
  const closeAllTabs = useTabsStore((s) => s.closeAllTabs);
  const forceCloseAllTabs = useTabsStore((s) => s.forceCloseAllTabs);
  const reorderTabs = useTabsStore((s) => s.reorderTabs);
  const reopenLastClosedTab = useTabsStore((s) => s.reopenLastClosedTab);

  const history = useHistoryStore((s) => s.history);
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const hydrateSecrets = useSettingsStore((s) => s.hydrateSecrets);

  const hydrateCollections = useCollectionsStore((s) => s.hydrate);
  const hydrateEnvironments = useEnvironmentsStore((s) => s.hydrate);
  const getCollectionRequest = useCollectionsStore((s) => s.getRequest);

  // Request actions (send, send & download)
  const { handleSend, handleSendAndDownload, handleCancel, saveResponse } = useRequestActions();

  const { isReady } = usePersistence();

  // Local state
  const [historyTabId, setHistoryTabId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    hydrateSecrets().catch((error) => {
      console.error('Failed to load secrets from the credential store:', error);
    });
  }, [hydrateSecrets]);

  useEffect(() => {
    hydrateCollections().catch((error) => {
      console.error('Failed to load collections:', error);
    });
  }, [hydrateCollections]);

  useEffect(() => {
    hydrateEnvironments().catch((error) => {
      console.error('Failed to load environments:', error);
    });
  }, [hydrateEnvironments]);

  const [showEnvironments, setShowEnvironments] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'general' | 'updates'>('general');
  const updater = useUpdater();

  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  const addCollection = useCollectionsStore((s) => s.addCollection);
  const addRequestToCollection = useCollectionsStore((s) => s.addRequest);
  const collections = useCollectionsStore((s) => s.collections);

  const handleSaveToCollection = useCallback(() => {
    if (!activeTab) return;

    const name = window.prompt('Save request as', activeTab.request.name || activeTab.request.url);
    if (!name?.trim()) return;

    // With nothing to save into, create the first collection rather than making the user
    // discover that step separately.
    const target = collections[0] ?? addCollection('My Collection');
    addRequestToCollection(target.id, name.trim(), activeTab.request);
  }, [activeTab, collections, addCollection, addRequestToCollection]);

  const handleOpenCollectionRequest = useCallback(
    (nodeId: string) => {
      const request = getCollectionRequest(nodeId);
      if (!request) return;

      setSelectedCollectionId(nodeId);
      addTab({
        id: crypto.randomUUID(),
        request: { ...request, id: crypto.randomUUID() },
        requestState: { status: 'idle' },
        isDirty: false,
      });
    },
    [addTab, getCollectionRequest]
  );

  // Resizable panels
  const contentRef = useRef<HTMLDivElement>(null);

  const sidebarResize = useResizable({
    direction: 'horizontal',
    initialSize: 280,
    minSize: SIDEBAR_MIN,
    maxSize: typeof window !== 'undefined' ? window.innerWidth * SIDEBAR_MAX_RATIO : 800,
    storageKey: 'apilator-sidebar-width',
  });

  const requestResize = useResizable({
    direction: 'vertical',
    initialSize: 45,
    minSize: REQUEST_MIN_RATIO * 100,
    maxSize: REQUEST_MAX_RATIO * 100,
    storageKey: 'apilator-request-height',
    percentageOf: () => contentRef.current?.offsetHeight ?? 0,
  });

  useDevWindowTitle('Apilator [DEV]');

  // Hide HTML splash screen when app is ready
  useEffect(() => {
    if (isReady) {
      const splash = document.getElementById('splash');
      if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => splash.remove(), 300);
      }
    }
  }, [isReady]);

  // Handle request change
  const handleRequestChange = useCallback(
    (request: HttpRequest) => {
      if (!activeTab) return;
      updateRequest(activeTab.id, request);
    },
    [activeTab, updateRequest]
  );

  // Handle history entry selection
  const handleHistorySelect = useCallback(
    (entry: HistoryEntry) => {
      const historyTabExists = historyTabId && tabs.some((t) => t.id === historyTabId);

      if (historyTabExists && historyTabId) {
        updateTab(historyTabId, entry.request);
      } else {
        const newTab: Tab = {
          id: crypto.randomUUID(),
          request: { ...entry.request, id: crypto.randomUUID() },
          requestState: { status: 'idle' },
          isDirty: false,
        };
        addTab(newTab);
        setHistoryTabId(newTab.id);
      }
    },
    [addTab, updateTab, historyTabId, tabs]
  );

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewTab: createNewTab,
    onCloseTab: () => activeTabId && closeTab(activeTabId),
    onSend: handleSend,
    onReopenClosedTab: reopenLastClosedTab,
  });

  // Block default context menu
  useContextMenuBlock();

  if (!isReady) {
    return null;
  }

  return (
    <div className="app">
      {updater.status === 'available' && updater.update && !updater.dismissed && (
        <div className="app-update-banner" role="status">
          <span>Version {updater.update.version} is available.</span>
          <button
            className="app-update-banner__action"
            onClick={() => {
              setSettingsSection('updates');
              setShowSettings(true);
            }}
          >
            View update
          </button>
          <button
            className="app-update-banner__dismiss"
            onClick={updater.dismiss}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="app-toolbar">
        <EnvironmentSelector onManage={() => setShowEnvironments(true)} />
      </div>

      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={selectTab}
        onTabClose={closeTab}
        onNewTab={createNewTab}
        onTabRename={renameTab}
        onTabColorChange={setTabColor}
        onTabTogglePinned={toggleTabPinned}
        onTabDuplicate={duplicateTab}
        onCloseOtherTabs={closeOtherTabs}
        onCloseAllTabs={closeAllTabs}
        onForceCloseAllTabs={forceCloseAllTabs}
        onTabReorder={reorderTabs}
      />

      <div className="app-main">
        <div
          className={`sidebar-container ${sidebarCollapsed ? 'sidebar-container--collapsed' : ''}`}
          ref={sidebarResize.containerRef}
          style={{ '--resize-size': sidebarResize.initialSize } as React.CSSProperties}
        >
          <Sidebar
            history={history}
            onHistorySelect={handleHistorySelect}
            onClearHistory={clearHistory}
            onSettingsClick={() => {
              setSettingsSection('general');
              setShowSettings(true);
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onOpenCollectionRequest={handleOpenCollectionRequest}
            selectedCollectionId={selectedCollectionId}
          />
          {!sidebarCollapsed && (
            <div
              className="resize-handle resize-handle--horizontal"
              onMouseDown={sidebarResize.handleMouseDown}
            />
          )}
        </div>

        <div className="app-content" ref={contentRef}>
          <div
            className="app-request"
            ref={requestResize.containerRef}
            style={{ '--resize-size': requestResize.initialSize } as React.CSSProperties}
          >
            {activeTab && (
              <RequestBuilder
                request={activeTab.request}
                onChange={handleRequestChange}
                onSend={handleSend}
                onSendAndDownload={handleSendAndDownload}
                onSave={handleSaveToCollection}
                isLoading={activeTab.requestState.status === 'loading'}
              />
            )}
            <div
              className="resize-handle resize-handle--vertical"
              onMouseDown={requestResize.handleMouseDown}
            />
          </div>

          <div className="app-response">
            {activeTab && (
              <ResponseViewer
                requestState={activeTab.requestState}
                onClear={() => updateRequestState(activeTab.id, { status: 'idle' })}
                onCancel={handleCancel}
                onSaveResponse={saveResponse}
              />
            )}
          </div>
        </div>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        updater={updater}
        initialSection={settingsSection}
      />

      <EnvironmentsModal
        isOpen={showEnvironments}
        onClose={() => setShowEnvironments(false)}
      />
    </div>
  );
}

export default App;
