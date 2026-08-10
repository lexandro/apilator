// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore, migrateSettings, SETTINGS_VERSION } from './settingsStore';
import { SECRET_KEYS } from '../services';
import { DEFAULT_PROXY_SETTINGS, DEFAULT_GENERAL_SETTINGS } from '../domain';

const invokeMock = vi.mocked(invoke);
const store = () => useSettingsStore.getState();

const PERSIST_KEY = 'apilator-settings';

function persistedJson(): string {
  return localStorage.getItem(PERSIST_KEY) ?? '';
}

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(null);
  useSettingsStore.setState({
    proxy: structuredClone(DEFAULT_PROXY_SETTINGS),
    general: structuredClone(DEFAULT_GENERAL_SETTINGS),
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ============================================================
// B6 - secrets must never reach localStorage
// ============================================================

describe('proxy passwords stay out of localStorage', () => {
  it('keeps the custom proxy password in memory but not on disk', () => {
    store().updateCustomProxy({ password: 'hunter2' });

    expect(store().proxy.customProxy.password).toBe('hunter2');
    expect(persistedJson()).not.toContain('hunter2');
  });

  it('keeps the default proxy password in memory but not on disk', () => {
    store().updateProxySettings({ defaultProxyPassword: 'correct-horse' });

    expect(store().proxy.defaultProxyPassword).toBe('correct-horse');
    expect(persistedJson()).not.toContain('correct-horse');
  });

  it('still persists the non-secret proxy fields', () => {
    store().updateCustomProxy({ host: 'proxy.internal', port: '3128' });

    expect(persistedJson()).toContain('proxy.internal');
    expect(persistedJson()).toContain('3128');
  });

  it('writes a blank password into the persisted blob rather than omitting the key', () => {
    store().updateCustomProxy({ password: 'hunter2' });

    const persisted = JSON.parse(persistedJson());
    expect(persisted.state.proxy.customProxy.password).toBe('');
    expect(persisted.state.proxy.defaultProxyPassword).toBe('');
  });
});

describe('proxy passwords go to the OS credential store', () => {
  it('stores the custom proxy password under its own key', () => {
    store().updateCustomProxy({ password: 'hunter2' });

    expect(invokeMock).toHaveBeenCalledWith('set_secret', {
      key: SECRET_KEYS.customProxyPassword,
      value: 'hunter2',
    });
  });

  it('stores the default proxy password under its own key', () => {
    store().updateProxySettings({ defaultProxyPassword: 'correct-horse' });

    expect(invokeMock).toHaveBeenCalledWith('set_secret', {
      key: SECRET_KEYS.defaultProxyPassword,
      value: 'correct-horse',
    });
  });

  it('does not touch the credential store when the password is not part of the update', () => {
    store().updateCustomProxy({ host: 'proxy.internal' });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('propagates a cleared password so the credential is removed', () => {
    store().updateCustomProxy({ password: '' });

    expect(invokeMock).toHaveBeenCalledWith('set_secret', {
      key: SECRET_KEYS.customProxyPassword,
      value: '',
    });
  });
});

describe('hydrateSecrets', () => {
  it('loads both passwords back into the store', async () => {
    invokeMock.mockImplementation(async (command: string, payload) => {
      if (command !== 'get_secret') return null;
      const { key } = payload as { key: string };
      if (key === SECRET_KEYS.customProxyPassword) return 'from-store-custom';
      if (key === SECRET_KEYS.defaultProxyPassword) return 'from-store-default';
      return null;
    });

    await store().hydrateSecrets();

    expect(store().proxy.customProxy.password).toBe('from-store-custom');
    expect(store().proxy.defaultProxyPassword).toBe('from-store-default');
  });

  it('leaves the passwords blank when the credential store has nothing', async () => {
    invokeMock.mockResolvedValue(null);

    await store().hydrateSecrets();

    expect(store().proxy.customProxy.password).toBe('');
    expect(store().proxy.defaultProxyPassword).toBe('');
  });

  it('does not reject when the credential store is unavailable', async () => {
    invokeMock.mockRejectedValue(new Error('no credential store'));

    await expect(store().hydrateSecrets()).resolves.toBeUndefined();
    expect(store().proxy.customProxy.password).toBe('');
  });

  it('leaves the other proxy settings untouched', async () => {
    store().updateCustomProxy({ host: 'proxy.internal', port: '3128' });
    invokeMock.mockResolvedValue(null);

    await store().hydrateSecrets();

    expect(store().proxy.customProxy.host).toBe('proxy.internal');
    expect(store().proxy.customProxy.port).toBe('3128');
  });
});

// ============================================================
// B1 - TLS verification default
// ============================================================

describe('getGeneralSettings', () => {
  it('defaults TLS verification to on', () => {
    expect(store().getGeneralSettings().verifyTls).toBe(true);
  });

  it('reflects the user turning verification off', () => {
    store().updateGeneralSettings({ verifyTls: false });

    expect(store().getGeneralSettings().verifyTls).toBe(false);
  });

  it('fills in keys missing from a settings blob written by an older build', () => {
    const older = { ...DEFAULT_GENERAL_SETTINGS } as Partial<typeof DEFAULT_GENERAL_SETTINGS>;
    delete older.verifyTls;
    useSettingsStore.setState({ general: older as typeof DEFAULT_GENERAL_SETTINGS });

    expect(store().getGeneralSettings().verifyTls).toBe(true);
  });

  it('treats an explicit null in the stored blob as absent, not as off', () => {
    // JSON cannot hold undefined but it can hold null, and null must not silently
    // disable certificate verification.
    useSettingsStore.setState({
      general: { ...DEFAULT_GENERAL_SETTINGS, verifyTls: null as unknown as boolean },
    });

    expect(store().getGeneralSettings().verifyTls).toBe(true);
  });

  it('treats an explicit undefined the same way', () => {
    useSettingsStore.setState({
      general: { ...DEFAULT_GENERAL_SETTINGS, verifyTls: undefined as unknown as boolean },
    });

    expect(store().getGeneralSettings().verifyTls).toBe(true);
  });
});

// ============================================================
// Proxy config for requests
// ============================================================

describe('getProxyConfig', () => {
  it('reports no proxy when nothing is enabled', () => {
    useSettingsStore.setState({
      proxy: { ...DEFAULT_PROXY_SETTINGS, useSystemProxy: false },
    });

    expect(store().getProxyConfig()).toEqual({ mode: 'none' });
  });

  it('builds the custom proxy url from protocol, host and port', () => {
    store().updateProxySettings({ useCustomProxy: true });
    store().updateCustomProxy({ protocol: 'http', host: 'proxy.internal', port: '3128' });

    expect(store().getProxyConfig()).toMatchObject({
      mode: 'custom',
      customProxy: { url: 'http://proxy.internal:3128' },
    });
  });

  it('omits credentials when proxy auth is off', () => {
    store().updateProxySettings({ useCustomProxy: true });
    store().updateCustomProxy({ auth: false, username: 'u', password: 'p' });

    const config = store().getProxyConfig();
    expect(config.customProxy?.username).toBeUndefined();
    expect(config.customProxy?.password).toBeUndefined();
  });

  it('splits the bypass list on commas and drops blanks', () => {
    store().updateProxySettings({ useCustomProxy: true });
    store().updateCustomProxy({ bypass: 'localhost, 127.0.0.1 , ,example.com' });

    expect(store().getProxyConfig().customProxy?.bypass).toEqual([
      'localhost',
      '127.0.0.1',
      'example.com',
    ]);
  });
});

// ============================================================
// Settings migration
// ============================================================

describe('migrateSettings', () => {
  it('replaces the meaningless zero timeout with the real default', () => {
    const migrated = migrateSettings({ general: { requestTimeout: 0 } }, 0) as {
      general: { requestTimeout: number };
    };

    expect(migrated.general.requestTimeout).toBe(DEFAULT_GENERAL_SETTINGS.requestTimeout);
  });

  it('fills in a missing timeout', () => {
    const migrated = migrateSettings({ general: {} }, 0) as {
      general: { requestTimeout: number };
    };

    expect(migrated.general.requestTimeout).toBe(DEFAULT_GENERAL_SETTINGS.requestTimeout);
  });

  it('keeps a timeout the user actually chose', () => {
    const migrated = migrateSettings({ general: { requestTimeout: 5000 } }, 0) as {
      general: { requestTimeout: number };
    };

    expect(migrated.general.requestTimeout).toBe(5000);
  });

  it('leaves the other settings alone', () => {
    const migrated = migrateSettings(
      { general: { requestTimeout: 0, maxResponseSize: 10 }, sidebarCollapsed: true },
      0
    ) as { general: { maxResponseSize: number }; sidebarCollapsed: boolean };

    expect(migrated.general.maxResponseSize).toBe(10);
    expect(migrated.sidebarCollapsed).toBe(true);
  });

  it('does nothing for a blob already at the current version', () => {
    const blob = { general: { requestTimeout: 0 } };

    expect(migrateSettings(blob, SETTINGS_VERSION)).toBe(blob);
  });

  it('survives a blob with no general section', () => {
    const migrated = migrateSettings({ theme: {} }, 0) as {
      general: { requestTimeout: number };
    };

    expect(migrated.general.requestTimeout).toBe(DEFAULT_GENERAL_SETTINGS.requestTimeout);
  });

  it('survives a non-object blob', () => {
    expect(migrateSettings(null, 0)).toBeNull();
    expect(migrateSettings('nope', 0)).toBe('nope');
  });
});
