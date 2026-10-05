import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';
import { collectionsService, parseCollections, COLLECTIONS_VERSION } from './collectionsService';
import { clearSealedCache } from './credentialsService';
import { createEmptyRequest } from '../domain';
import type { AuthConfig, Collection, CollectionFolderNode, CollectionRequestNode } from '../domain';

const invokeMock = vi.mocked(invoke);

function tree(): Collection[] {
  return [
    {
      id: 'col-1',
      name: 'api',
      children: [
        {
          kind: 'folder',
          id: 'folder-1',
          name: 'users',
          children: [
            {
              kind: 'request',
              id: 'req-1',
              name: 'list',
              request: { ...createEmptyRequest(), url: 'https://api.test/users' },
            },
          ],
        },
      ],
    },
  ];
}

function fileFor(collections: Collection[]) {
  return YAML.stringify({ version: COLLECTIONS_VERSION, collections }, { lineWidth: 0 });
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

describe('serialize and deserialize', () => {
  it('keeps a collapsed flag through a round-trip', () => {
    const collapsed: Collection[] = [
      { id: 'c', name: 'api', collapsed: true, children: [] },
    ];

    expect(collectionsService.deserialize(collectionsService.serialize(collapsed))).toEqual(
      collapsed
    );
  });

  it('omits collapsed when it is false, keeping the file small', () => {
    const serialized = collectionsService.serialize([{ id: 'c', name: 'api', children: [] }]);

    expect(serialized).not.toContain('collapsed');
  });

  it('round-trips a tree unchanged', () => {
    const before = tree();
    const after = collectionsService.deserialize(collectionsService.serialize(before));

    expect(after).toEqual(before);
  });

  it('round-trips an empty list', () => {
    expect(collectionsService.deserialize(collectionsService.serialize([]))).toEqual([]);
  });

  it('returns null for content that is not YAML', () => {
    expect(collectionsService.deserialize('{ not: valid: yaml')).toBeNull();
  });

  it('returns null for YAML that is not a collections file', () => {
    expect(collectionsService.deserialize(YAML.stringify({ hello: 'world' }))).toBeNull();
  });

  it('returns null for a version we do not understand', () => {
    expect(
      collectionsService.deserialize(YAML.stringify({ version: 99, collections: [] }))
    ).toBeNull();
  });
});

describe('parseCollections', () => {
  it('drops a node with an unknown kind rather than the whole file', () => {
    const parsed = parseCollections({
      version: COLLECTIONS_VERSION,
      collections: [
        {
          id: 'c',
          name: 'api',
          children: [{ kind: 'wat', id: 'x', name: 'x' }, { kind: 'folder', id: 'f', name: 'f' }],
        },
      ],
    });

    expect(parsed![0].children.map((c) => c.id)).toEqual(['f']);
  });

  it('drops a request node with no request payload', () => {
    const parsed = parseCollections({
      version: COLLECTIONS_VERSION,
      collections: [{ id: 'c', name: 'api', children: [{ kind: 'request', id: 'r', name: 'r' }] }],
    });

    expect(parsed![0].children).toEqual([]);
  });

  it('gives a node with no id a fresh one', () => {
    const parsed = parseCollections({
      version: COLLECTIONS_VERSION,
      collections: [{ name: 'api', children: [] }],
    });

    expect(parsed![0].id).toBeTruthy();
  });

  it('fills in a missing children array', () => {
    const parsed = parseCollections({
      version: COLLECTIONS_VERSION,
      collections: [{ id: 'c', name: 'api' }],
    });

    expect(parsed![0].children).toEqual([]);
  });

  it('fills in request defaults for a partial request', () => {
    const parsed = parseCollections({
      version: COLLECTIONS_VERSION,
      collections: [
        {
          id: 'c',
          name: 'api',
          children: [
            { kind: 'request', id: 'r', name: 'r', request: { url: 'https://api.test/x' } },
          ],
        },
      ],
    });

    const node = parsed![0].children[0];
    expect(node.kind === 'request' && node.request.method).toBe('GET');
    expect(node.kind === 'request' && Array.isArray(node.request.headers)).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(parseCollections(null)).toBeNull();
    expect(parseCollections([])).toBeNull();
  });
});

describe('load', () => {
  it('returns an empty list when there is no file yet', async () => {
    invokeMock.mockResolvedValue(null);

    expect(await collectionsService.load()).toEqual([]);
    expect(backupSuffixes()).toEqual([]);
  });

  it('loads a valid file', async () => {
    // One fixture instance: tree() mints fresh header ids on every call.
    const fixture = tree();
    invokeMock.mockImplementation(async (command: string) =>
      command === 'load_data' ? fileFor(fixture) : null
    );

    expect(await collectionsService.load()).toEqual(fixture);
  });

  it('asks for the collections file, not the state file', async () => {
    invokeMock.mockResolvedValue(null);

    await collectionsService.load();

    expect(invokeMock).toHaveBeenCalledWith('load_data', { kind: 'collections' });
  });

  it('backs up rather than deletes an unparseable file', async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === 'load_data' ? '{ not: valid: yaml' : 'C:/data/backup.bak'
    );

    expect(await collectionsService.load()).toEqual([]);
    expect(backupSuffixes()).toEqual(['corrupt']);
  });

  it('backs up rather than deletes a file from a newer version', async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === 'load_data'
        ? YAML.stringify({ version: 99, collections: [] })
        : 'C:/data/backup.bak'
    );

    expect(await collectionsService.load()).toEqual([]);
    expect(backupSuffixes()).toEqual(['v99']);
  });

  it('returns an empty list when the backend cannot read at all', async () => {
    invokeMock.mockRejectedValue(new Error('permission denied'));

    expect(await collectionsService.load()).toEqual([]);
  });
});

describe('save', () => {
  it('writes to the collections file', async () => {
    invokeMock.mockResolvedValue(undefined);

    await collectionsService.save(tree());

    const [command, payload] = invokeMock.mock.calls[0];
    expect(command).toBe('save_data');
    expect((payload as { kind: string }).kind).toBe('collections');
  });

  it('writes something that loads back identically', async () => {
    const fixture = tree();
    invokeMock.mockResolvedValue(undefined);
    await collectionsService.save(fixture);
    const { yamlContent } = invokeMock.mock.calls[0][1] as { yamlContent: string };

    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) =>
      command === 'load_data' ? yamlContent : null
    );

    expect(await collectionsService.load()).toEqual(fixture);
  });

  it('swallows a write failure rather than breaking the caller', async () => {
    invokeMock.mockRejectedValue(new Error('disk full'));

    await expect(collectionsService.save(tree())).resolves.toBeUndefined();
  });
});

// ============================================================
// Import (phase 13)
// ============================================================

describe('importFromText', () => {
  const openApi = {
    openapi: '3.0.0',
    info: { title: 'Petstore' },
    servers: [{ url: 'https://api.petstore.test/v1' }],
    paths: {
      '/pets': { get: { summary: 'List pets', tags: ['pets'] }, post: { tags: ['pets'] } },
      '/pets/{id}': { get: { tags: ['pets'] } },
    },
  };

  it('reads our own export back', () => {
    const fixture = tree();
    const result = collectionsService.importFromText(collectionsService.serialize(fixture));

    expect(result?.kind).toBe('apilator');
    expect(result?.collections).toEqual(fixture);
    expect(result?.requestCount).toBe(1);
  });

  it('reads an OpenAPI document in JSON', () => {
    const result = collectionsService.importFromText(JSON.stringify(openApi));

    expect(result?.kind).toBe('openapi');
    expect(result?.requestCount).toBe(3);
    expect(result?.collections[0].name).toBe('Petstore');
  });

  it('reads an OpenAPI document in YAML', () => {
    const result = collectionsService.importFromText(YAML.stringify(openApi));

    expect(result?.kind).toBe('openapi');
    expect(result?.requestCount).toBe(3);
  });

  it('counts requests nested in folders', () => {
    const result = collectionsService.importFromText(JSON.stringify(openApi));
    expect(result?.requestCount).toBe(3);
  });

  it('returns null for a file that is neither', () => {
    expect(collectionsService.importFromText(YAML.stringify({ hello: 'world' }))).toBeNull();
  });

  it('returns null for content that does not parse', () => {
    expect(collectionsService.importFromText('{ not: valid: yaml')).toBeNull();
  });

  it('returns null for an empty file', () => {
    expect(collectionsService.importFromText('')).toBeNull();
  });
});

// ============================================================
// Credentials
// ============================================================

describe('request credentials', () => {
  const fakeSeal = (value: string) => `sealed:${btoa(value).split('').reverse().join('')}`;
  const fakeOpen = (value: string) =>
    value.startsWith('sealed:') ? atob(value.slice(7).split('').reverse().join('')) : null;

  let stored: string | null = null;

  beforeEach(() => {
    stored = null;
    clearSealedCache();
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = payload as { values?: string[]; yamlContent?: string };
      if (command === 'protect_values') return args.values!.map(fakeSeal);
      if (command === 'unprotect_values') return args.values!.map(fakeOpen);
      if (command === 'save_data') stored = args.yamlContent!;
      if (command === 'load_data') return stored;
      return undefined;
    });
  });

  const bearer: AuthConfig = { type: 'bearer', token: 'COLLECTION-TOKEN-PLAIN' };

  function treeWith(auth: AuthConfig): Collection[] {
    const collections = tree();
    const folder = collections[0].children[0] as CollectionFolderNode;
    const node = folder.children[0] as CollectionRequestNode;
    node.request = { ...node.request, auth };
    return collections;
  }

  function firstRequest(collections: Collection[]) {
    const folder = collections[0].children[0] as CollectionFolderNode;
    return (folder.children[0] as CollectionRequestNode).request;
  }

  it('does not write a credential to the collections file in the clear', async () => {
    await collectionsService.save(treeWith(bearer));

    expect(stored).not.toContain('COLLECTION-TOKEN-PLAIN');
    expect(stored).toContain('dpapi');
  });

  it('gives the credential back on load', async () => {
    await collectionsService.save(treeWith(bearer));

    expect(firstRequest(await collectionsService.load()).auth).toEqual(bearer);
  });

  it('leaves the credential out of an export but keeps the rest of the auth', () => {
    const exported = collectionsService.serialize(treeWith(bearer));

    expect(exported).not.toContain('COLLECTION-TOKEN-PLAIN');
    const imported = collectionsService.importFromText(exported)!;
    expect(firstRequest(imported.collections).auth).toEqual({ type: 'bearer', token: '' });
  });

  it('blanks a still-sealed credential in an imported file instead of using the object', async () => {
    await collectionsService.save(treeWith(bearer));

    const imported = collectionsService.importFromText(stored!)!;

    expect(firstRequest(imported.collections).auth).toEqual({ type: 'bearer', token: '' });
  });
});
