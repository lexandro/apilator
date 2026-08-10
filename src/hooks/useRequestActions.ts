import { useCallback } from 'react';
import { useTabsStore, useHistoryStore, useSettingsStore, useEnvironmentsStore } from '../stores';
import { httpService, fileService } from '../services';
import type { RequestState, HttpRequest, HttpResponse } from '../domain';

/**
 * Which backend request each tab currently has in flight. Module scope rather than a ref
 * so cancelling works from anywhere the hook is mounted.
 */
const inFlight = new Map<string, string>();

export function useRequestActions() {
  const activeTab = useTabsStore((s) => s.getActiveTab());
  const updateRequestState = useTabsStore((s) => s.updateRequestState);
  const setTabDirty = useTabsStore((s) => s.setTabDirty);
  const addHistoryEntry = useHistoryStore((s) => s.addEntry);
  const getProxyConfig = useSettingsStore((s) => s.getProxyConfig);
  const getGeneralSettings = useSettingsStore((s) => s.getGeneralSettings);
  const getVariables = useEnvironmentsStore((s) => s.getVariables);

  const runRequest = useCallback(
    async (tabId: string, request: HttpRequest): Promise<RequestState | null> => {
      if (!request.url.trim()) {
        updateRequestState(tabId, {
          status: 'error',
          error: { message: 'Please enter a URL', type: 'unknown' },
        });
        return null;
      }

      const requestId = crypto.randomUUID();
      inFlight.set(tabId, requestId);

      updateRequestState(tabId, { status: 'loading' });

      const general = getGeneralSettings();

      const result = await httpService.sendRequest(request, {
        proxy: getProxyConfig(),
        verifyTls: general.verifyTls,
        timeoutMs: general.requestTimeout,
        maxResponseBytes: general.maxResponseSize * 1024 * 1024,
        followRedirects: general.autoFollowRedirects,
        sendNoCacheHeader: general.sendNoCacheHeader,
        httpVersion: general.httpVersion,
        variables: getVariables(),
        requestId,
      });

      // A newer request for this tab started while this one was running; its result wins.
      if (inFlight.get(tabId) !== requestId) return null;
      inFlight.delete(tabId);

      updateRequestState(tabId, result);

      if (result.status === 'success') {
        addHistoryEntry(request, result.response);
        setTabDirty(tabId, false);
      }

      return result;
    },
    [
      updateRequestState,
      addHistoryEntry,
      setTabDirty,
      getProxyConfig,
      getGeneralSettings,
      getVariables,
    ]
  );

  const handleSend = useCallback(async () => {
    if (!activeTab) return;
    await runRequest(activeTab.id, activeTab.request);
  }, [activeTab, runRequest]);

  const handleCancel = useCallback(() => {
    if (!activeTab) return;

    const requestId = inFlight.get(activeTab.id);
    if (!requestId) return;

    inFlight.delete(activeTab.id);
    void httpService.cancelRequest(requestId);

    updateRequestState(activeTab.id, {
      status: 'error',
      error: { message: 'Request cancelled', type: 'cancelled' },
    });
  }, [activeTab, updateRequestState]);

  const saveResponse = useCallback(async (response: HttpResponse) => {
    if (response.bodyEncoding === 'base64') {
      console.error('Binary responses cannot be saved as text yet');
      return;
    }

    const contentType =
      response.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
    const { ext, name } = fileService.getExtensionFromContentType(contentType);

    try {
      await fileService.saveTextFile(response.body, {
        defaultPath: `response.${ext}`,
        filters: [
          { name, extensions: [ext] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, []);

  const handleSendAndDownload = useCallback(async () => {
    if (!activeTab) return;

    const result = await runRequest(activeTab.id, activeTab.request);
    if (result?.status !== 'success' || !result.response.body) return;

    await saveResponse(result.response);
  }, [activeTab, runRequest, saveResponse]);

  return {
    handleSend,
    handleSendAndDownload,
    handleCancel,
    saveResponse,
  };
}
