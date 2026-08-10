export interface EnvVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  /** Secret values live in the OS credential store, never in the environments file. */
  secret: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvVariable[];
}

export function createEnvVariable(key = '', value = ''): EnvVariable {
  return { id: crypto.randomUUID(), key, value, enabled: true, secret: false };
}

export function createEnvironment(name = 'New Environment'): Environment {
  return { id: crypto.randomUUID(), name, variables: [] };
}

/** Credential store key for a secret variable. */
export function secretKeyFor(environmentId: string, variableId: string): string {
  return `env.${environmentId}.${variableId}`;
}

// ============================================================
// Variable substitution
// ============================================================

const PLACEHOLDER = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

export interface ResolutionResult {
  text: string;
  /** Names that appeared in the text but had no enabled variable behind them. */
  unresolved: string[];
}

export function variableMap(environment: Environment | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!environment) return map;

  for (const variable of environment.variables) {
    if (!variable.enabled) continue;
    const key = variable.key.trim();
    if (key) map.set(key, variable.value);
  }

  return map;
}

/**
 * Replaces `{{name}}` with the variable's value. An unknown name is left untouched rather
 * than blanked, so a mistyped placeholder is visible in the request instead of silently
 * turning into an empty string.
 */
export function resolveVariables(text: string, values: Map<string, string>): ResolutionResult {
  if (!text.includes('{{')) return { text, unresolved: [] };

  const unresolved: string[] = [];

  const resolved = text.replace(PLACEHOLDER, (match, rawName: string) => {
    const name = rawName.trim();
    const value = values.get(name);

    if (value === undefined) {
      if (!unresolved.includes(name)) unresolved.push(name);
      return match;
    }

    return value;
  });

  return { text: resolved, unresolved };
}

/** Every placeholder name used in the text, whether or not it resolves. */
export function findPlaceholders(text: string): string[] {
  const names: string[] = [];

  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }

  return names;
}
