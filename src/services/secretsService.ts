import { invoke } from '@tauri-apps/api/core';

/**
 * Secrets live in the OS credential store, never in localStorage or the state file.
 * Failures are logged and swallowed: a missing credential store must not stop the app.
 */
export const SECRET_KEYS = {
  customProxyPassword: 'proxy.custom.password',
  defaultProxyPassword: 'proxy.default.password',
} as const;

async function getSecret(key: string): Promise<string> {
  try {
    return (await invoke<string | null>('get_secret', { key })) ?? '';
  } catch (error) {
    console.error(`Failed to read secret "${key}":`, error);
    return '';
  }
}

async function setSecret(key: string, value: string): Promise<void> {
  try {
    await invoke('set_secret', { key, value });
  } catch (error) {
    console.error(`Failed to store secret "${key}":`, error);
  }
}

async function deleteSecret(key: string): Promise<void> {
  try {
    await invoke('delete_secret', { key });
  } catch (error) {
    console.error(`Failed to delete secret "${key}":`, error);
  }
}

export const secretsService = {
  getSecret,
  setSecret,
  deleteSecret,
};
