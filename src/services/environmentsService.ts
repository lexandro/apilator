import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';
import type { Environment, EnvVariable } from '../domain';
import { secretKeyFor } from '../domain';
import { secretsService } from './secretsService';

export const ENVIRONMENTS_VERSION = 1;

export interface EnvironmentsFile {
  version: number;
  environments: Environment[];
  activeEnvironmentId: string | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toRuntimeVariable(value: unknown): EnvVariable | null {
  if (!isRecord(value)) return null;
  if (typeof value.key !== 'string') return null;

  return {
    id: str(value.id) || crypto.randomUUID(),
    key: value.key,
    // A secret's value never comes from the file; hydrateSecrets fills it in.
    value: value.secret === true ? '' : str(value.value),
    enabled: value.enabled !== false,
    secret: value.secret === true,
  };
}

function toRuntimeEnvironment(value: unknown): Environment | null {
  if (!isRecord(value)) return null;

  const variables = Array.isArray(value.variables) ? value.variables : [];

  return {
    id: str(value.id) || crypto.randomUUID(),
    name: str(value.name, 'Environment'),
    variables: variables.map(toRuntimeVariable).filter((v): v is EnvVariable => v !== null),
  };
}

export function parseEnvironments(raw: unknown): EnvironmentsFile | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== ENVIRONMENTS_VERSION) return null;
  if (!Array.isArray(raw.environments)) return null;

  const environments = raw.environments
    .map(toRuntimeEnvironment)
    .filter((e): e is Environment => e !== null);

  const activeId = typeof raw.activeEnvironmentId === 'string' ? raw.activeEnvironmentId : null;

  return {
    version: ENVIRONMENTS_VERSION,
    environments,
    // An id pointing at an environment that is gone would leave the selector on a
    // phantom entry.
    activeEnvironmentId: environments.some((e) => e.id === activeId) ? activeId : null,
  };
}

/** Blanks secret values so they cannot reach the file. */
export function withoutSecretValues(environments: Environment[]): Environment[] {
  return environments.map((environment) => ({
    ...environment,
    variables: environment.variables.map((variable) =>
      variable.secret ? { ...variable, value: '' } : variable
    ),
  }));
}

async function backupUnreadable(suffix: string): Promise<void> {
  try {
    const path = await invoke<string | null>('backup_data', { kind: 'environments', suffix });
    if (path) {
      console.warn(`Unreadable environments file was moved aside instead of deleted: ${path}`);
    }
  } catch (error) {
    console.error('Failed to back up the unreadable environments file:', error);
  }
}

const EMPTY: EnvironmentsFile = {
  version: ENVIRONMENTS_VERSION,
  environments: [],
  activeEnvironmentId: null,
};

async function load(): Promise<EnvironmentsFile> {
  let content: string | null;

  try {
    content = await invoke<string | null>('load_data', { kind: 'environments' });
  } catch (error) {
    console.error('Failed to read the environments file:', error);
    return EMPTY;
  }

  if (!content) return EMPTY;

  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    console.error('Environments file is not valid YAML:', error);
    await backupUnreadable('corrupt');
    return EMPTY;
  }

  const file = parseEnvironments(parsed);
  if (!file) {
    const version = isRecord(parsed) && typeof parsed.version === 'number' ? parsed.version : null;
    console.error(`Environments file version ${version ?? 'unknown'} cannot be read`);
    await backupUnreadable(version === null ? 'unknown' : `v${version}`);
    return EMPTY;
  }

  return file;
}

async function save(
  environments: Environment[],
  activeEnvironmentId: string | null
): Promise<void> {
  try {
    const file: EnvironmentsFile = {
      version: ENVIRONMENTS_VERSION,
      environments: withoutSecretValues(environments),
      activeEnvironmentId,
    };

    await invoke('save_data', {
      kind: 'environments',
      yamlContent: YAML.stringify(file, { indent: 2, lineWidth: 0 }),
    });
  } catch (error) {
    console.error('Failed to save environments:', error);
  }
}

/** Reads every secret value back out of the OS credential store. */
async function hydrateSecrets(environments: Environment[]): Promise<Environment[]> {
  const loaded = await Promise.all(
    environments.map(async (environment) => ({
      ...environment,
      variables: await Promise.all(
        environment.variables.map(async (variable) =>
          variable.secret
            ? {
                ...variable,
                value: await secretsService.getSecret(secretKeyFor(environment.id, variable.id)),
              }
            : variable
        )
      ),
    }))
  );

  return loaded;
}

async function storeSecret(
  environmentId: string,
  variable: EnvVariable
): Promise<void> {
  await secretsService.setSecret(secretKeyFor(environmentId, variable.id), variable.value);
}

async function forgetSecret(environmentId: string, variableId: string): Promise<void> {
  await secretsService.deleteSecret(secretKeyFor(environmentId, variableId));
}

export const environmentsService = {
  load,
  save,
  hydrateSecrets,
  storeSecret,
  forgetSecret,
};
