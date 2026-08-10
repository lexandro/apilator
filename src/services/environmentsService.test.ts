import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';
import {
  environmentsService,
  parseEnvironments,
  withoutSecretValues,
  ENVIRONMENTS_VERSION,
} from './environmentsService';
import type { Environment } from '../domain';

const invokeMock = vi.mocked(invoke);

function environment(overrides: Partial<Environment> = {}): Environment {
  return {
    id: 'env-1',
    name: 'dev',
    variables: [
      { id: 'v1', key: 'host', value: 'api.dev.test', enabled: true, secret: false },
      { id: 'v2', key: 'token', value: 'super-secret', enabled: true, secret: true },
    ],
    ...overrides,
  };
}

function fileFor(environments: Environment[], activeEnvironmentId: string | null = null) {
  return YAML.stringify(
    { version: ENVIRONMENTS_VERSION, environments, activeEnvironmentId },
    { lineWidth: 0 }
  );
}

function backupSuffixes(): string[] {
  return invokeMock.mock.calls
    .filter(([command]) => command === 'backup_data')
    .map(([, payload]) => (payload as { suffix: string }).suffix);
}

beforeEach(() => {
  invokeMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The whole point of the secret flag.
describe('withoutSecretValues', () => {
  it('blanks secret values', () => {
    const [env] = withoutSecretValues([environment()]);
    expect(env.variables.find((v) => v.id === 'v2')!.value).toBe('');
  });

  it('leaves plain values alone', () => {
    const [env] = withoutSecretValues([environment()]);
    expect(env.variables.find((v) => v.id === 'v1')!.value).toBe('api.dev.test');
  });

  it('keeps the secret flag itself', () => {
    const [env] = withoutSecretValues([environment()]);
    expect(env.variables.find((v) => v.id === 'v2')!.secret).toBe(true);
  });
});

describe('parseEnvironments', () => {
  it('reads a valid file', () => {
    const parsed = parseEnvironments({
      version: ENVIRONMENTS_VERSION,
      environments: [environment()],
      activeEnvironmentId: 'env-1',
    });

    expect(parsed?.environments).toHaveLength(1);
    expect(parsed?.activeEnvironmentId).toBe('env-1');
  });

  it('never trusts a secret value from the file', () => {
    const parsed = parseEnvironments({
      version: ENVIRONMENTS_VERSION,
      environments: [environment()],
      activeEnvironmentId: null,
    });

    expect(parsed!.environments[0].variables.find((v) => v.id === 'v2')!.value).toBe('');
  });

  it('drops an active id pointing at an environment that is gone', () => {
    const parsed = parseEnvironments({
      version: ENVIRONMENTS_VERSION,
      environments: [],
      activeEnvironmentId: 'vanished',
    });

    expect(parsed?.activeEnvironmentId).toBeNull();
  });

  it('drops a variable with no key', () => {
    const parsed = parseEnvironments({
      version: ENVIRONMENTS_VERSION,
      environments: [{ id: 'e', name: 'dev', variables: [{ id: 'v' }] }],
      activeEnvironmentId: null,
    });

    expect(parsed!.environments[0].variables).toEqual([]);
  });

  it('defaults enabled to true', () => {
    const parsed = parseEnvironments({
      version: ENVIRONMENTS_VERSION,
      environments: [{ id: 'e', name: 'dev', variables: [{ id: 'v', key: 'a' }] }],
      activeEnvironmentId: null,
    });

    expect(parsed!.environments[0].variables[0].enabled).toBe(true);
  });

  it('gives an environment with no id a fresh one', () => {
    const parsed = parseEnvironments({
      version: ENVIRONMENTS_VERSION,
      environments: [{ name: 'dev' }],
      activeEnvironmentId: null,
    });

    expect(parsed!.environments[0].id).toBeTruthy();
    expect(parsed!.environments[0].variables).toEqual([]);
  });

  it('rejects a version we do not understand', () => {
    expect(parseEnvironments({ version: 99, environments: [] })).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(parseEnvironments(null)).toBeNull();
    expect(parseEnvironments([])).toBeNull();
  });
});

describe('load', () => {
  it('returns an empty file when nothing is saved', async () => {
    invokeMock.mockResolvedValue(null);

    const file = await environmentsService.load();

    expect(file.environments).toEqual([]);
    expect(file.activeEnvironmentId).toBeNull();
  });

  it('asks for the environments file', async () => {
    invokeMock.mockResolvedValue(null);

    await environmentsService.load();

    expect(invokeMock).toHaveBeenCalledWith('load_data', { kind: 'environments' });
  });

  it('loads a saved file', async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === 'load_data' ? fileFor([environment()], 'env-1') : null
    );

    const file = await environmentsService.load();

    expect(file.environments[0].name).toBe('dev');
    expect(file.activeEnvironmentId).toBe('env-1');
  });

  it('backs up rather than deletes an unparseable file', async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === 'load_data' ? '{ not: valid: yaml' : 'C:/data/backup.bak'
    );

    expect((await environmentsService.load()).environments).toEqual([]);
    expect(backupSuffixes()).toEqual(['corrupt']);
  });

  it('backs up rather than deletes a newer version', async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === 'load_data'
        ? YAML.stringify({ version: 99, environments: [] })
        : 'C:/data/backup.bak'
    );

    expect((await environmentsService.load()).environments).toEqual([]);
    expect(backupSuffixes()).toEqual(['v99']);
  });

  it('returns an empty file when the backend cannot read at all', async () => {
    invokeMock.mockRejectedValue(new Error('permission denied'));

    expect((await environmentsService.load()).environments).toEqual([]);
  });
});

describe('save', () => {
  it('writes to the environments file', async () => {
    invokeMock.mockResolvedValue(undefined);

    await environmentsService.save([environment()], 'env-1');

    const [command, payload] = invokeMock.mock.calls[0];
    expect(command).toBe('save_data');
    expect((payload as { kind: string }).kind).toBe('environments');
  });

  it('never writes a secret value into the file', async () => {
    invokeMock.mockResolvedValue(undefined);

    await environmentsService.save([environment()], null);

    const { yamlContent } = invokeMock.mock.calls[0][1] as { yamlContent: string };
    expect(yamlContent).not.toContain('super-secret');
    expect(yamlContent).toContain('api.dev.test');
  });

  it('swallows a write failure rather than breaking the caller', async () => {
    invokeMock.mockRejectedValue(new Error('disk full'));

    await expect(environmentsService.save([environment()], null)).resolves.toBeUndefined();
  });
});

describe('secrets', () => {
  it('reads secret values back out of the credential store', async () => {
    invokeMock.mockImplementation(async (command: string, payload) => {
      if (command !== 'get_secret') return null;
      return (payload as { key: string }).key === 'env.env-1.v2' ? 'restored' : null;
    });

    const [env] = await environmentsService.hydrateSecrets([
      { ...environment(), variables: environment().variables.map((v) => ({ ...v, value: '' })) },
    ]);

    expect(env.variables.find((v) => v.id === 'v2')!.value).toBe('restored');
  });

  it('leaves plain variables untouched while hydrating', async () => {
    invokeMock.mockResolvedValue(null);

    const [env] = await environmentsService.hydrateSecrets([environment()]);

    expect(env.variables.find((v) => v.id === 'v1')!.value).toBe('api.dev.test');
  });

  it('stores a secret under its namespaced key', async () => {
    invokeMock.mockResolvedValue(undefined);

    await environmentsService.storeSecret('env-1', environment().variables[1]);

    expect(invokeMock).toHaveBeenCalledWith('set_secret', {
      key: 'env.env-1.v2',
      value: 'super-secret',
    });
  });

  it('forgets a secret by its namespaced key', async () => {
    invokeMock.mockResolvedValue(undefined);

    await environmentsService.forgetSecret('env-1', 'v2');

    expect(invokeMock).toHaveBeenCalledWith('delete_secret', { key: 'env.env-1.v2' });
  });
});
