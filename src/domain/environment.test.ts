import { describe, it, expect } from 'vitest';
import {
  createEnvironment,
  createEnvVariable,
  secretKeyFor,
  variableMap,
  resolveVariables,
  findPlaceholders,
} from './environment';
import type { Environment } from './environment';

function env(vars: Array<Partial<ReturnType<typeof createEnvVariable>>>): Environment {
  return {
    ...createEnvironment('dev'),
    variables: vars.map((v) => ({ ...createEnvVariable(), ...v })),
  };
}

function values(pairs: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(pairs));
}

describe('secretKeyFor', () => {
  it('namespaces by environment and variable', () => {
    expect(secretKeyFor('env-1', 'var-1')).toBe('env.env-1.var-1');
  });

  it('gives different variables different keys', () => {
    expect(secretKeyFor('e', 'a')).not.toBe(secretKeyFor('e', 'b'));
  });
});

describe('variableMap', () => {
  it('is empty without an environment', () => {
    expect(variableMap(null).size).toBe(0);
  });

  it('maps key to value', () => {
    expect(variableMap(env([{ key: 'host', value: 'api.test' }])).get('host')).toBe('api.test');
  });

  it('skips disabled variables', () => {
    expect(variableMap(env([{ key: 'host', value: 'x', enabled: false }])).has('host')).toBe(false);
  });

  it('skips variables with a blank key', () => {
    expect(variableMap(env([{ key: '   ', value: 'x' }])).size).toBe(0);
  });

  it('trims the key', () => {
    expect(variableMap(env([{ key: ' host ', value: 'x' }])).get('host')).toBe('x');
  });

  it('lets a later variable win over an earlier one with the same key', () => {
    const map = variableMap(env([{ key: 'a', value: 'first' }, { key: 'a', value: 'second' }]));
    expect(map.get('a')).toBe('second');
  });
});

describe('resolveVariables', () => {
  it('leaves text with no placeholder untouched', () => {
    expect(resolveVariables('https://api.test/x', values({ a: 'b' }))).toEqual({
      text: 'https://api.test/x',
      unresolved: [],
    });
  });

  it('substitutes a placeholder', () => {
    expect(resolveVariables('https://{{host}}/x', values({ host: 'api.test' })).text).toBe(
      'https://api.test/x'
    );
  });

  it('substitutes several placeholders', () => {
    const result = resolveVariables('{{scheme}}://{{host}}/{{path}}', values({
      scheme: 'https',
      host: 'api.test',
      path: 'users',
    }));

    expect(result.text).toBe('https://api.test/users');
  });

  it('substitutes the same placeholder more than once', () => {
    expect(resolveVariables('{{a}}-{{a}}', values({ a: 'x' })).text).toBe('x-x');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(resolveVariables('{{ host }}', values({ host: 'api.test' })).text).toBe('api.test');
  });

  // Blanking an unknown name would hide the typo; leaving it makes the mistake visible.
  it('leaves an unknown placeholder in place and reports it', () => {
    const result = resolveVariables('https://{{nope}}/x', values({ host: 'a' }));

    expect(result.text).toBe('https://{{nope}}/x');
    expect(result.unresolved).toEqual(['nope']);
  });

  it('reports each unresolved name once', () => {
    expect(resolveVariables('{{a}} {{a}} {{b}}', values({})).unresolved).toEqual(['a', 'b']);
  });

  it('substitutes an empty value rather than treating it as unresolved', () => {
    const result = resolveVariables('x{{empty}}y', values({ empty: '' }));

    expect(result.text).toBe('xy');
    expect(result.unresolved).toEqual([]);
  });

  it('ignores a single brace pair', () => {
    expect(resolveVariables('{host}', values({ host: 'a' })).text).toBe('{host}');
  });

  it('ignores an empty placeholder', () => {
    expect(resolveVariables('{{}}', values({})).text).toBe('{{}}');
  });

  it('does not recurse into a substituted value', () => {
    // Otherwise a variable holding "{{a}}" could loop forever.
    expect(resolveVariables('{{a}}', values({ a: '{{a}}' })).text).toBe('{{a}}');
  });

  it('handles a value containing braces', () => {
    expect(resolveVariables('{{a}}', values({ a: '{"json":true}' })).text).toBe('{"json":true}');
  });

  it('works on an empty string', () => {
    expect(resolveVariables('', values({ a: 'b' })).text).toBe('');
  });
});

describe('findPlaceholders', () => {
  it('lists every distinct name', () => {
    expect(findPlaceholders('{{a}}/{{b}}/{{a}}')).toEqual(['a', 'b']);
  });

  it('returns nothing for plain text', () => {
    expect(findPlaceholders('https://api.test')).toEqual([]);
  });

  it('trims names', () => {
    expect(findPlaceholders('{{  spaced  }}')).toEqual(['spaced']);
  });
});
