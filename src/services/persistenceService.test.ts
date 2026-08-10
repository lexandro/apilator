import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';
import {
  persistenceService,
  migrateState,
  MIGRATIONS,
  STATE_VERSION,
  type AppState,
} from './persistenceService';
import { createEmptyRequest } from '../domain';
import type { Tab, HistoryEntry } from '../domain';

const invokeMock = vi.mocked(invoke);

function savedTab(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tab-1',
    request: { ...createEmptyRequest(), url: 'https://api.test/items' },
    isDirty: false,
    ...overrides,
  };
}

function validState(overrides: Partial<AppState> = {}): Record<string, unknown> {
  return {
    version: STATE_VERSION,
    tabs: [savedTab()],
    activeTabId: 'tab-1',
    history: [],
    closedTabs: [],
    ...overrides,
  };
}

/** Makes `load_state` return the given YAML, and records backup_state calls. */
function withStoredState(yamlContent: string | null) {
  invokeMock.mockImplementation(async (command: string) => {
    if (command === 'load_data') return yamlContent;
    if (command === 'backup_state') return 'C:\\data\\apilator-state.yaml.bak';
    return undefined;
  });
}

function backupCalls(): string[] {
  return invokeMock.mock.calls
    .filter(([command]) => command === 'backup_data')
    .map(([, payload]) => (payload as { suffix: string }).suffix);
}

beforeEach(() => {
  invokeMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const REAL_MIGRATIONS = { ...MIGRATIONS };

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(MIGRATIONS)) {
    delete MIGRATIONS[Number(key)];
  }
  Object.assign(MIGRATIONS, REAL_MIGRATIONS);
});

/** Replaces the migration table for a single test. */
function withMigrations(table: typeof MIGRATIONS) {
  for (const key of Object.keys(MIGRATIONS)) {
    delete MIGRATIONS[Number(key)];
  }
  Object.assign(MIGRATIONS, table);
}

// ============================================================
// migrateState
// ============================================================

describe('migrateState', () => {
  it('passes a current-version state straight through', () => {
    const state = validState();
    expect(migrateState(state)).toBe(state);
  });

  it('rejects a non-object', () => {
    expect(migrateState(null)).toBeNull();
    expect(migrateState('nope')).toBeNull();
    expect(migrateState([])).toBeNull();
  });

  it('rejects a state with no version', () => {
    expect(migrateState({ tabs: [] })).toBeNull();
  });

  it('rejects a non-integer version', () => {
    expect(migrateState({ version: 1.5 })).toBeNull();
    expect(migrateState({ version: '1' })).toBeNull();
  });

  it('rejects a state written by a newer app version', () => {
    expect(migrateState({ version: STATE_VERSION + 1 })).toBeNull();
  });

  it('rejects an older state when no migration is registered for it', () => {
    expect(migrateState({ version: 0 })).toBeNull();
  });

  it('runs a registered migration', () => {
    withMigrations({ [STATE_VERSION - 1]: (s) => ({ ...s, version: STATE_VERSION, done: true }) });

    expect(migrateState({ version: STATE_VERSION - 1, tabs: [] })).toEqual({
      version: STATE_VERSION,
      tabs: [],
      done: true,
    });
  });

  it('chains migrations until the current version is reached', () => {
    withMigrations({
      0: (s) => ({ ...s, version: 1, steps: ['a'] }),
      1: (s) => ({ ...s, version: 2, steps: [...(s.steps as string[]), 'b'] }),
    });

    expect(migrateState({ version: 0 })).toEqual({ version: 2, steps: ['a', 'b'] });
  });

  it('refuses a migration that fails to bump the version, rather than looping forever', () => {
    withMigrations({ 0: (s) => ({ ...s }) });

    expect(migrateState({ version: 0 })).toBeNull();
  });

  it('refuses a migration that returns a non-object', () => {
    withMigrations({ 0: () => null as unknown as Record<string, unknown> });

    expect(migrateState({ version: 0 })).toBeNull();
  });
});

// ============================================================
// v1 -> v2: history response bodies are dropped
// ============================================================

describe('the v1 to v2 migration', () => {
  function v1State(bodySize: number) {
    return {
      version: 1,
      tabs: [savedTab()],
      activeTabId: 'tab-1',
      history: [
        {
          id: 'h1',
          timestamp: 1700000000000,
          request: { ...createEmptyRequest(), url: 'https://api.test/x' },
          response: {
            status: 201,
            statusText: 'Created',
            headers: [{ id: 'x', key: 'content-type', value: 'application/json', enabled: true }],
            body: 'x'.repeat(bodySize),
            size: bodySize,
            time: 42,
            networkInfo: { httpVersion: 'HTTP/1.1', remoteAddr: null, tlsVerified: true },
          },
        },
      ],
    };
  }

  it('strips the response body but keeps the summary fields', () => {
    const migrated = migrateState(v1State(1000)) as Record<string, unknown>;
    const entry = (migrated.history as Record<string, unknown>[])[0];

    expect(entry.response).toEqual({
      status: 201,
      statusText: 'Created',
      size: 1000,
      time: 42,
    });
  });

  it('bumps the version', () => {
    expect((migrateState(v1State(10)) as Record<string, unknown>).version).toBe(2);
  });

  it('leaves tabs untouched', () => {
    const state = v1State(10);
    const originalTabs = structuredClone(state.tabs);

    const migrated = migrateState(state) as Record<string, unknown>;

    expect(migrated.tabs).toEqual(originalTabs);
  });

  it('shrinks a realistic state file by orders of magnitude', () => {
    const before = YAML.stringify(v1State(1_000_000)).length;
    const after = YAML.stringify(migrateState(v1State(1_000_000))).length;

    expect(after).toBeLessThan(before / 100);
  });

  it('survives a history entry with no response at all', () => {
    const state = { ...v1State(10), history: [{ id: 'h', timestamp: 1, request: {} }] };
    const migrated = migrateState(state) as Record<string, unknown>;

    expect((migrated.history as Record<string, unknown>[])[0].response).toEqual({
      status: 0,
      statusText: '',
      size: 0,
      time: 0,
    });
  });

  it('survives a history entry whose response fields have the wrong types', () => {
    const state = {
      ...v1State(10),
      history: [
        { id: 'h', timestamp: 1, request: {}, response: { status: 'nope', size: null, time: [] } },
      ],
    };
    const migrated = migrateState(state) as Record<string, unknown>;

    expect((migrated.history as Record<string, unknown>[])[0].response).toEqual({
      status: 0,
      statusText: '',
      size: 0,
      time: 0,
    });
  });

  it('survives a state with no history key', () => {
    const migrated = migrateState({ version: 1, tabs: [], activeTabId: 'x' }) as Record<
      string,
      unknown
    >;

    expect(migrated.history).toEqual([]);
    expect(migrated.version).toBe(2);
  });
});

// ============================================================
// loadAppState
// ============================================================

describe('loadAppState', () => {
  it('returns null when there is no saved state yet', async () => {
    withStoredState(null);

    expect(await persistenceService.loadAppState()).toBeNull();
    expect(backupCalls()).toEqual([]);
  });

  it('loads a valid state', async () => {
    withStoredState(YAML.stringify(validState()));

    const state = await persistenceService.loadAppState();

    expect(state).not.toBeNull();
    expect(state!.activeTabId).toBe('tab-1');
    expect(backupCalls()).toEqual([]);
  });

  it('backs up rather than deletes an unparseable file', async () => {
    withStoredState('{ this is: not: valid: yaml');

    expect(await persistenceService.loadAppState()).toBeNull();
    expect(backupCalls()).toEqual(['corrupt']);
  });

  it('backs up rather than deletes a state from a newer app version', async () => {
    withStoredState(YAML.stringify(validState({ version: STATE_VERSION + 1 })));

    expect(await persistenceService.loadAppState()).toBeNull();
    expect(backupCalls()).toEqual([`v${STATE_VERSION + 1}`]);
  });

  it('backs up rather than deletes a state with an unmigratable old version', async () => {
    withStoredState(YAML.stringify({ version: 0, tabs: [] }));

    expect(await persistenceService.loadAppState()).toBeNull();
    expect(backupCalls()).toEqual(['v0']);
  });

  it('backs up rather than deletes a state that is missing its tabs array', async () => {
    withStoredState(YAML.stringify({ version: STATE_VERSION, activeTabId: 'x' }));

    expect(await persistenceService.loadAppState()).toBeNull();
    expect(backupCalls()).toEqual(['invalid']);
  });

  it('backs up rather than deletes a state whose root is not an object', async () => {
    withStoredState(YAML.stringify(['not', 'a', 'state']));

    expect(await persistenceService.loadAppState()).toBeNull();
    expect(backupCalls()).toEqual(['unknown']);
  });

  it('survives the backup command itself failing', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'load_data') return 'not: [valid';
      if (command === 'backup_data') throw new Error('disk is on fire');
      return undefined;
    });

    await expect(persistenceService.loadAppState()).resolves.toBeNull();
  });

  it('returns null when the backend cannot read the file at all', async () => {
    invokeMock.mockRejectedValue(new Error('permission denied'));

    expect(await persistenceService.loadAppState()).toBeNull();
  });
});

// ============================================================
// Hydration
// ============================================================

describe('stateToTabs', () => {
  function load(raw: Record<string, unknown>): AppState {
    return raw as unknown as AppState;
  }

  it('restores a saved tab with idle request state', () => {
    const tabs = persistenceService.stateToTabs(load(validState()));

    expect(tabs).toHaveLength(1);
    expect(tabs[0].request.url).toBe('https://api.test/items');
    expect(tabs[0].requestState).toEqual({ status: 'idle' });
  });

  it('drops a tab whose request is unusable instead of throwing', () => {
    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [savedTab(), { id: 'broken' }, { id: 'x', request: {} }] as never }))
    );

    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('tab-1');
  });

  it('fills in a missing headers array rather than dropping the tab', () => {
    const request = { ...createEmptyRequest(), url: 'https://x.test' } as Record<string, unknown>;
    delete request.headers;

    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [{ id: 't', request, isDirty: false }] as never }))
    );

    expect(tabs).toHaveLength(1);
    expect(Array.isArray(tabs[0].request.headers)).toBe(true);
  });

  it('defaults a missing auth config to no-auth for backwards compatibility', () => {
    const request = { ...createEmptyRequest(), url: 'https://x.test' } as Record<string, unknown>;
    delete request.auth;

    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [{ id: 't', request, isDirty: false }] as never }))
    );

    expect(tabs[0].request.auth).toEqual({ type: 'none' });
  });

  it('falls back to GET when the saved method is not a real HTTP method', () => {
    const request = { ...createEmptyRequest(), url: 'https://x.test', method: 'BREW' };

    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [{ id: 't', request, isDirty: false }] as never }))
    );

    expect(tabs[0].request.method).toBe('GET');
  });

  it('repairs a body whose sub-fields are missing', () => {
    const request = { ...createEmptyRequest(), url: 'https://x.test', body: { type: 'raw' } };

    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [{ id: 't', request, isDirty: false }] as never }))
    );

    expect(tabs[0].request.body).toEqual({
      type: 'raw',
      raw: { content: '', format: 'json' },
      formData: [],
      urlencoded: [],
    });
  });

  it('falls back to the default body type for an unknown one', () => {
    const request = { ...createEmptyRequest(), url: 'https://x.test', body: { type: 'protobuf' } };

    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [{ id: 't', request, isDirty: false }] as never }))
    );

    expect(tabs[0].request.body.type).toBe('none');
  });

  it('keeps a valid basic auth config', () => {
    const request = {
      ...createEmptyRequest(),
      url: 'https://x.test',
      auth: { type: 'basic', username: 'u', password: 'p' },
    };

    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [{ id: 't', request, isDirty: false }] as never }))
    );

    expect(tabs[0].request.auth).toEqual({ type: 'basic', username: 'u', password: 'p' });
  });

  it('downgrades an unsupported JWT algorithm to HS256 instead of keeping a value we cannot sign', () => {
    const request = {
      ...createEmptyRequest(),
      url: 'https://x.test',
      auth: { type: 'jwt', algorithm: 'RS256', secret: 's' },
    };

    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [{ id: 't', request, isDirty: false }] as never }))
    );

    expect(tabs[0].request.auth).toMatchObject({ type: 'jwt', algorithm: 'HS256', secret: 's' });
  });

  it('falls back to no-auth for an unrecognised auth type', () => {
    const request = {
      ...createEmptyRequest(),
      url: 'https://x.test',
      auth: { type: 'oauth2', token: 'x' },
    };

    const tabs = persistenceService.stateToTabs(
      load(validState({ tabs: [{ id: 't', request, isDirty: false }] as never }))
    );

    expect(tabs[0].request.auth).toEqual({ type: 'none' });
  });

  it('gives a tab without an id a fresh one, so it cannot collide', () => {
    const tabs = persistenceService.stateToTabs(
      load(
        validState({
          tabs: [{ request: { ...createEmptyRequest(), url: 'https://x.test' } }] as never,
        })
      )
    );

    expect(typeof tabs[0].id).toBe('string');
    expect(tabs[0].id.length).toBeGreaterThan(0);
  });
});

describe('stateToHistory', () => {
  const entry: HistoryEntry = {
    id: 'h1',
    timestamp: 1700000000000,
    request: { ...createEmptyRequest(), url: 'https://api.test/x' },
    response: { status: 200, statusText: 'OK', size: 2, time: 5 },
  };

  it('returns an empty array when there is no history', () => {
    const state = { version: STATE_VERSION, tabs: [], activeTabId: 'x' } as unknown as AppState;
    expect(persistenceService.stateToHistory(state)).toEqual([]);
  });

  it('keeps valid entries', () => {
    const state = { ...validState({ history: [entry] }) } as unknown as AppState;
    expect(persistenceService.stateToHistory(state)).toHaveLength(1);
  });

  it('strips a body that somehow survived into a v2 file', () => {
    const withBody = {
      ...entry,
      response: { ...entry.response, body: 'x'.repeat(1000), headers: [] },
    };
    const state = { ...validState({ history: [withBody] as never }) } as unknown as AppState;

    const [loaded] = persistenceService.stateToHistory(state);

    expect(loaded.response).toEqual({ status: 200, statusText: 'OK', size: 2, time: 5 });
    expect(JSON.stringify(loaded)).not.toContain('xxxxx');
  });

  it('drops malformed entries instead of letting them reach the UI', () => {
    const state = {
      ...validState({ history: [entry, { id: 'bad' }, null, { timestamp: 1 }] as never }),
    } as unknown as AppState;

    expect(persistenceService.stateToHistory(state)).toEqual([entry]);
  });
});

// ============================================================
// saveAppState
// ============================================================

describe('saveAppState', () => {
  function runtimeTab(id: string): Tab {
    return {
      id,
      request: { ...createEmptyRequest(), url: `https://api.test/${id}` },
      requestState: { status: 'success', response: {
        status: 200, statusText: 'OK', headers: [], body: 'x', bodyEncoding: 'utf8',
        truncated: false, size: 1, time: 1,
        networkInfo: { httpVersion: 'HTTP/1.1', remoteAddr: null, tlsVerified: true },
      } },
      isDirty: true,
    };
  }

  it('writes YAML that loads back as an equivalent state', async () => {
    invokeMock.mockResolvedValue(undefined);

    await persistenceService.saveAppState([runtimeTab('a')], 'a', [], []);

    const [command, payload] = invokeMock.mock.calls[0];
    expect(command).toBe('save_data');

    const parsed = YAML.parse((payload as { yamlContent: string }).yamlContent);
    expect(parsed.version).toBe(STATE_VERSION);
    expect(parsed.activeTabId).toBe('a');
    expect(parsed.tabs).toHaveLength(1);
  });

  it('does not persist transient request state', async () => {
    invokeMock.mockResolvedValue(undefined);

    await persistenceService.saveAppState([runtimeTab('a')], 'a', [], []);

    const { yamlContent } = invokeMock.mock.calls[0][1] as { yamlContent: string };
    expect(YAML.parse(yamlContent).tabs[0].requestState).toBeUndefined();
  });

  it('round-trips through load without losing the tab', async () => {
    invokeMock.mockResolvedValue(undefined);
    await persistenceService.saveAppState([runtimeTab('a')], 'a', [], []);
    const { yamlContent } = invokeMock.mock.calls[0][1] as { yamlContent: string };

    withStoredState(yamlContent);
    const state = await persistenceService.loadAppState();

    expect(state).not.toBeNull();
    const tabs = persistenceService.stateToTabs(state!);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].request.url).toBe('https://api.test/a');
  });

  it('swallows a backend write failure rather than breaking the caller', async () => {
    invokeMock.mockRejectedValue(new Error('disk full'));

    await expect(persistenceService.saveAppState([], 'a', [], [])).resolves.toBeUndefined();
  });
});
