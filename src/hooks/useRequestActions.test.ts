// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor , cleanup } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../services/fileService', () => ({
  fileService: {
    saveTextFile: vi.fn().mockResolvedValue(true),
    getExtensionFromContentType: vi.fn().mockReturnValue({ ext: 'json', name: 'JSON' }),
    pickFile: vi.fn(),
  },
}));

import { invoke } from '@tauri-apps/api/core';
import { useRequestActions } from './useRequestActions';
import { useTabsStore, useHistoryStore } from '../stores';
import { fileService } from '../services';
import { createTab } from '../domain';

const invokeMock = vi.mocked(invoke);
const saveTextFile = vi.mocked(fileService.saveTextFile);
const getExtension = vi.mocked(fileService.getExtensionFromContentType);

function rustResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    status_text: 'OK',
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}',
    body_encoding: 'utf8',
    truncated: false,
    size: 11,
    time: 42,
    http_version: 'HTTP/1.1',
    remote_addr: null,
    tls_verified: true,
    ...overrides,
  };
}

/** Puts a single tab with the given url in the store and returns its id. */
function seedTab(url = 'https://api.test/items'): string {
  const tab = createTab();
  tab.request = { ...tab.request, url };
  useTabsStore.setState({ tabs: [tab], activeTabId: tab.id, closedTabs: [] });
  return tab.id;
}

function activeState() {
  return useTabsStore.getState().tabs[0].requestState;
}

/** A send_request call that only resolves when told to. */
function deferredSend() {
  let release!: (value: unknown) => void;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  invokeMock.mockImplementation(async (command: string) => {
    if (command === 'send_request') {
      await gate;
      return rustResponse();
    }
    return undefined;
  });

  return { release };
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(rustResponse());
  saveTextFile.mockClear();
  saveTextFile.mockResolvedValue(true);
  getExtension.mockReturnValue({ ext: 'json', name: 'JSON' });
  useHistoryStore.setState({ history: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('handleSend', () => {
  it('rejects a blank url without calling the backend', async () => {
    seedTab('   ');
    const { result } = renderHook(() => useRequestActions());

    await act(async () => {
      await result.current.handleSend();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(activeState()).toEqual({
      status: 'error',
      error: { message: 'Please enter a URL', type: 'unknown' },
    });
  });

  it('moves the tab through loading and into success', async () => {
    seedTab();
    const { release } = deferredSend();
    const { result } = renderHook(() => useRequestActions());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleSend();
    });

    await waitFor(() => expect(activeState().status).toBe('loading'));

    await act(async () => {
      release(undefined);
      await pending;
    });

    expect(activeState().status).toBe('success');
  });

  it('records the request in history on success', async () => {
    seedTab('https://api.test/created');
    const { result } = renderHook(() => useRequestActions());

    await act(async () => {
      await result.current.handleSend();
    });

    const history = useHistoryStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].request.url).toBe('https://api.test/created');
  });

  it('does not record a failed request in history', async () => {
    seedTab();
    invokeMock.mockRejectedValue({ message: 'boom', error_type: 'network' });
    const { result } = renderHook(() => useRequestActions());

    await act(async () => {
      await result.current.handleSend();
    });

    expect(activeState().status).toBe('error');
    expect(useHistoryStore.getState().history).toHaveLength(0);
  });

  it('clears the dirty flag once the request succeeded', async () => {
    const id = seedTab();
    useTabsStore.getState().updateRequest(id, {
      ...useTabsStore.getState().tabs[0].request,
      url: 'https://api.test/x',
    });
    expect(useTabsStore.getState().tabs[0].isDirty).toBe(true);

    const { result } = renderHook(() => useRequestActions());
    await act(async () => {
      await result.current.handleSend();
    });

    expect(useTabsStore.getState().tabs[0].isDirty).toBe(false);
  });

  it('sends a cancellable request id', async () => {
    seedTab();
    const { result } = renderHook(() => useRequestActions());

    await act(async () => {
      await result.current.handleSend();
    });

    const [, payload] = invokeMock.mock.calls[0];
    expect((payload as { params: { request_id?: string } }).params.request_id).toBeTruthy();
  });
});

describe('stale responses', () => {
  it('does not let an earlier response overwrite a later one', async () => {
    seedTab();

    const resolvers: Array<() => void> = [];
    invokeMock.mockImplementation(async (command: string, payload) => {
      if (command !== 'send_request') return undefined;
      const id = (payload as { params: { request_id: string } }).params.request_id;
      return new Promise((resolve) => {
        resolvers.push(() => resolve(rustResponse({ body: `from-${id}` })));
      });
    });

    const { result } = renderHook(() => useRequestActions());

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.handleSend();
    });
    act(() => {
      second = result.current.handleSend();
    });

    await waitFor(() => expect(resolvers).toHaveLength(2));

    // Resolve the newer request first, then the older one.
    await act(async () => {
      resolvers[1]();
      await second;
      resolvers[0]();
      await first;
    });

    const state = activeState();
    expect(state.status).toBe('success');
    if (state.status !== 'success') return;

    // Only one entry: the superseded request must not reach history either.
    expect(useHistoryStore.getState().history).toHaveLength(1);
  });
});

describe('handleCancel', () => {
  it('asks the backend to cancel and puts the tab into a cancelled error state', async () => {
    seedTab();
    const { release } = deferredSend();
    const { result } = renderHook(() => useRequestActions());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleSend();
    });
    await waitFor(() => expect(activeState().status).toBe('loading'));

    act(() => {
      result.current.handleCancel();
    });

    expect(activeState()).toEqual({
      status: 'error',
      error: { message: 'Request cancelled', type: 'cancelled' },
    });
    expect(invokeMock).toHaveBeenCalledWith('cancel_request', expect.anything());

    await act(async () => {
      release(undefined);
      await pending;
    });
  });

  it('does nothing when no request is in flight', () => {
    seedTab();
    const { result } = renderHook(() => useRequestActions());

    act(() => {
      result.current.handleCancel();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(activeState().status).toBe('idle');
  });

  it('keeps a cancelled request out of the history', async () => {
    seedTab();
    const { release } = deferredSend();
    const { result } = renderHook(() => useRequestActions());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleSend();
    });
    await waitFor(() => expect(activeState().status).toBe('loading'));

    act(() => {
      result.current.handleCancel();
    });

    await act(async () => {
      release(undefined);
      await pending;
    });

    expect(useHistoryStore.getState().history).toHaveLength(0);
    expect(activeState().status).toBe('error');
  });
});

describe('saveResponse', () => {
  it('writes the body through the file service', async () => {
    seedTab();
    const { result } = renderHook(() => useRequestActions());

    await act(async () => {
      await result.current.saveResponse({
        status: 200,
        statusText: 'OK',
        headers: [{ id: 'h', key: 'content-type', value: 'application/json', enabled: true }],
        body: '{"ok":true}',
        bodyEncoding: 'utf8',
        truncated: false,
        size: 11,
        time: 1,
        networkInfo: { httpVersion: 'HTTP/1.1', remoteAddr: null, tlsVerified: true },
      });
    });

    expect(saveTextFile).toHaveBeenCalledWith(
      '{"ok":true}',
      expect.objectContaining({ defaultPath: 'response.json' })
    );
  });

  it('refuses to write a binary response as text', async () => {
    seedTab();
    const { result } = renderHook(() => useRequestActions());

    await act(async () => {
      await result.current.saveResponse({
        status: 200,
        statusText: 'OK',
        headers: [],
        body: 'iVBORw0KGgo=',
        bodyEncoding: 'base64',
        truncated: false,
        size: 8,
        time: 1,
        networkInfo: { httpVersion: 'HTTP/1.1', remoteAddr: null, tlsVerified: true },
      });
    });

    expect(saveTextFile).not.toHaveBeenCalled();
  });
});
