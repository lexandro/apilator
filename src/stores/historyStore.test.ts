import { describe, it, expect, beforeEach } from 'vitest';
import { useHistoryStore } from './historyStore';
import { createEmptyRequest } from '../domain';
import type { HttpResponse, HttpRequest } from '../domain';

const store = () => useHistoryStore.getState();

function request(url = 'https://api.test/items'): HttpRequest {
  return { ...createEmptyRequest(), url };
}

function response(bodySize = 1000): HttpResponse {
  return {
    status: 201,
    statusText: 'Created',
    headers: [{ id: 'h', key: 'content-type', value: 'application/json', enabled: true }],
    body: 'x'.repeat(bodySize),
    bodyEncoding: 'utf8',
    truncated: false,
    size: bodySize,
    time: 42,
    networkInfo: { httpVersion: 'HTTP/2', remoteAddr: '1.2.3.4:443', tlsVerified: true },
  };
}

beforeEach(() => {
  useHistoryStore.setState({ history: [] });
});

describe('addEntry', () => {
  it('records the request and the response summary', () => {
    store().addEntry(request(), response());

    const [entry] = store().history;
    expect(entry.request.url).toBe('https://api.test/items');
    expect(entry.response).toEqual({ status: 201, statusText: 'Created', size: 1000, time: 42 });
  });

  it('never stores the response body', () => {
    store().addEntry(request(), response(50_000));

    // Serialising the whole store must not contain the payload. This is the regression
    // guard for the 86 MB state file and the 60 MB of retained heap.
    expect(JSON.stringify(store().history)).not.toContain('xxxxxxxxxx');
  });

  it('never stores response headers or network info either', () => {
    store().addEntry(request(), response());

    const summary = store().history[0].response as unknown as Record<string, unknown>;
    expect(summary.headers).toBeUndefined();
    expect(summary.networkInfo).toBeUndefined();
    expect(summary.body).toBeUndefined();
  });

  it('keeps an entry small regardless of how big the response was', () => {
    store().addEntry(request(), response(5_000_000));

    expect(JSON.stringify(store().history[0]).length).toBeLessThan(2000);
  });

  it('puts the newest entry first', () => {
    store().addEntry(request('https://api.test/first'), response());
    store().addEntry(request('https://api.test/second'), response());

    expect(store().history.map((e) => e.request.url)).toEqual([
      'https://api.test/second',
      'https://api.test/first',
    ]);
  });

  it('gives every entry a distinct id', () => {
    store().addEntry(request(), response());
    store().addEntry(request(), response());

    const ids = store().history.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('snapshots the request, so later edits do not rewrite history', () => {
    const req = request();
    store().addEntry(req, response());

    req.url = 'https://api.test/edited-afterwards';

    expect(store().history[0].request.url).toBe('https://api.test/items');
  });

  it('caps the history at 50 entries, dropping the oldest', () => {
    for (let i = 0; i < 55; i++) {
      store().addEntry(request(`https://api.test/${i}`), response());
    }

    expect(store().history).toHaveLength(50);
    expect(store().history[0].request.url).toBe('https://api.test/54');
    expect(store().history[store().history.length - 1].request.url).toBe('https://api.test/5');
  });

  it('returns the created entry', () => {
    const entry = store().addEntry(request(), response());

    expect(entry.id).toBe(store().history[0].id);
  });
});

describe('deleteEntry', () => {
  it('removes only the named entry', () => {
    const first = store().addEntry(request('https://api.test/a'), response());
    store().addEntry(request('https://api.test/b'), response());

    store().deleteEntry(first.id);

    expect(store().history.map((e) => e.request.url)).toEqual(['https://api.test/b']);
  });

  it('ignores an unknown id', () => {
    store().addEntry(request(), response());

    store().deleteEntry('nope');

    expect(store().history).toHaveLength(1);
  });
});

describe('clearHistory', () => {
  it('empties the list', () => {
    store().addEntry(request(), response());

    store().clearHistory();

    expect(store().history).toEqual([]);
  });
});
