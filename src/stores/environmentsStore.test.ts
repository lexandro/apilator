import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/environmentsService', () => ({
  environmentsService: {
    load: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    hydrateSecrets: vi.fn(),
    storeSecret: vi.fn().mockResolvedValue(undefined),
    forgetSecret: vi.fn().mockResolvedValue(undefined),
  },
  ENVIRONMENTS_VERSION: 1,
  parseEnvironments: vi.fn(),
  withoutSecretValues: vi.fn(),
}));

import { useEnvironmentsStore } from './environmentsStore';
import { environmentsService } from '../services';
import type { Environment } from '../domain';

const load = vi.mocked(environmentsService.load);
const save = vi.mocked(environmentsService.save);
const hydrateSecrets = vi.mocked(environmentsService.hydrateSecrets);
const storeSecret = vi.mocked(environmentsService.storeSecret);
const forgetSecret = vi.mocked(environmentsService.forgetSecret);

const store = () => useEnvironmentsStore.getState();

function seed(): { envId: string; varId: string } {
  const envId = 'env-1';
  const varId = 'var-1';

  const environments: Environment[] = [
    {
      id: envId,
      name: 'dev',
      variables: [
        { id: varId, key: 'host', value: 'api.dev.test', enabled: true, secret: false },
      ],
    },
  ];

  useEnvironmentsStore.setState({ environments, activeEnvironmentId: envId, isLoaded: true });
  return { envId, varId };
}

beforeEach(() => {
  useEnvironmentsStore.setState({ environments: [], activeEnvironmentId: null, isLoaded: false });
  load.mockReset().mockResolvedValue({ version: 1, environments: [], activeEnvironmentId: null });
  hydrateSecrets.mockReset().mockImplementation(async (envs) => envs);
  save.mockReset().mockResolvedValue(undefined);
  storeSecret.mockReset().mockResolvedValue(undefined);
  forgetSecret.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hydrate', () => {
  it('loads environments and fills in secret values', async () => {
    load.mockResolvedValue({
      version: 1,
      environments: [{ id: 'e', name: 'dev', variables: [] }],
      activeEnvironmentId: 'e',
    });
    hydrateSecrets.mockResolvedValue([
      {
        id: 'e',
        name: 'dev',
        variables: [{ id: 'v', key: 'token', value: 'from-store', enabled: true, secret: true }],
      },
    ]);

    await store().hydrate();

    expect(store().environments[0].variables[0].value).toBe('from-store');
    expect(store().activeEnvironmentId).toBe('e');
    expect(store().isLoaded).toBe(true);
  });
});

describe('environments', () => {
  it('selects the first environment automatically', () => {
    const created = store().addEnvironment('dev');
    expect(store().activeEnvironmentId).toBe(created.id);
  });

  it('does not steal the selection from an existing environment', () => {
    const first = store().addEnvironment('dev');
    store().addEnvironment('prod');

    expect(store().activeEnvironmentId).toBe(first.id);
  });

  it('renames', () => {
    const { envId } = seed();
    store().renameEnvironment(envId, 'staging');
    expect(store().environments[0].name).toBe('staging');
  });

  it('clears the selection when the active environment is removed', () => {
    const { envId } = seed();
    store().removeEnvironment(envId);

    expect(store().environments).toEqual([]);
    expect(store().activeEnvironmentId).toBeNull();
  });

  it('forgets the credentials of a removed environment', () => {
    const { envId, varId } = seed();
    store().updateVariable(envId, varId, { secret: true });
    forgetSecret.mockClear();

    store().removeEnvironment(envId);

    expect(forgetSecret).toHaveBeenCalledWith(envId, varId);
  });
});

describe('variables', () => {
  it('adds a blank variable', () => {
    const { envId } = seed();
    store().addVariable(envId);
    expect(store().environments[0].variables).toHaveLength(2);
  });

  it('updates a value', () => {
    const { envId, varId } = seed();
    store().updateVariable(envId, varId, { value: 'api.prod.test' });
    expect(store().environments[0].variables[0].value).toBe('api.prod.test');
  });

  it('removes a variable', () => {
    const { envId, varId } = seed();
    store().removeVariable(envId, varId);
    expect(store().environments[0].variables).toEqual([]);
  });
});

// The point of the secret flag: values never reach the environments file.
describe('secret variables', () => {
  it('writes a secret to the credential store on every change', () => {
    const { envId, varId } = seed();

    store().updateVariable(envId, varId, { secret: true });
    store().updateVariable(envId, varId, { value: 'hunter2' });

    expect(storeSecret).toHaveBeenLastCalledWith(
      envId,
      expect.objectContaining({ id: varId, value: 'hunter2', secret: true })
    );
  });

  it('does not write plain values to the credential store', () => {
    const { envId, varId } = seed();

    store().updateVariable(envId, varId, { value: 'plain' });

    expect(storeSecret).not.toHaveBeenCalled();
  });

  it('forgets the credential when a variable stops being secret', () => {
    const { envId, varId } = seed();
    store().updateVariable(envId, varId, { secret: true });

    store().updateVariable(envId, varId, { secret: false });

    expect(forgetSecret).toHaveBeenCalledWith(envId, varId);
  });

  it('forgets the credential when a secret variable is removed', () => {
    const { envId, varId } = seed();
    store().updateVariable(envId, varId, { secret: true });
    forgetSecret.mockClear();

    store().removeVariable(envId, varId);

    expect(forgetSecret).toHaveBeenCalledWith(envId, varId);
  });
});

describe('getVariables', () => {
  it('is empty with no active environment', () => {
    seed();
    store().selectEnvironment(null);

    expect(store().getVariables().size).toBe(0);
  });

  it('exposes the active environment as a lookup map', () => {
    seed();
    expect(store().getVariables().get('host')).toBe('api.dev.test');
  });

  it('follows the selection', () => {
    seed();
    const other = store().addEnvironment('prod');
    store().addVariable(other.id);
    const varId = store().environments[1].variables[0].id;
    store().updateVariable(other.id, varId, { key: 'host', value: 'api.prod.test' });

    store().selectEnvironment(other.id);

    expect(store().getVariables().get('host')).toBe('api.prod.test');
  });

  it('omits disabled variables', () => {
    const { envId, varId } = seed();
    store().updateVariable(envId, varId, { enabled: false });

    expect(store().getVariables().has('host')).toBe(false);
  });
});

describe('persistence', () => {
  it('saves after a change', () => {
    const { envId } = seed();
    save.mockClear();

    store().renameEnvironment(envId, 'renamed');

    expect(save).toHaveBeenCalledWith(store().environments, store().activeEnvironmentId);
  });

  it('saves when the selection changes', () => {
    seed();
    save.mockClear();

    store().selectEnvironment(null);

    expect(save).toHaveBeenCalled();
  });
});
