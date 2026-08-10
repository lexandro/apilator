import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/collectionsService', () => ({
  collectionsService: {
    load: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    serialize: vi.fn(),
    deserialize: vi.fn(),
  },
  COLLECTIONS_VERSION: 1,
  parseCollections: vi.fn(),
}));

import { useCollectionsStore } from './collectionsStore';
import { collectionsService } from '../services';
import { createEmptyRequest, findContainer, findNode } from '../domain';
import type { Collection } from '../domain';

const load = vi.mocked(collectionsService.load);
const save = vi.mocked(collectionsService.save);
const store = () => useCollectionsStore.getState();

function seed(): { collectionId: string; folderId: string; requestId: string } {
  const collectionId = 'col-1';
  const folderId = 'folder-1';
  const requestId = 'req-1';

  const collections: Collection[] = [
    {
      id: collectionId,
      name: 'api',
      children: [
        {
          kind: 'folder',
          id: folderId,
          name: 'users',
          children: [
            {
              kind: 'request',
              id: requestId,
              name: 'list',
              request: { ...createEmptyRequest(), url: 'https://api.test/users' },
            },
          ],
        },
      ],
    },
  ];

  useCollectionsStore.setState({ collections, isLoaded: true, lastMoveRejection: null });
  return { collectionId, folderId, requestId };
}

beforeEach(() => {
  useCollectionsStore.setState({ collections: [], isLoaded: false, lastMoveRejection: null });
  load.mockReset().mockResolvedValue([]);
  save.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hydrate', () => {
  it('loads collections and marks itself loaded', async () => {
    load.mockResolvedValue([{ id: 'c', name: 'loaded', children: [] }]);

    await store().hydrate();

    expect(store().collections).toHaveLength(1);
    expect(store().isLoaded).toBe(true);
  });

  it('marks itself loaded even with nothing saved', async () => {
    await store().hydrate();
    expect(store().isLoaded).toBe(true);
  });
});

describe('adding', () => {
  it('creates a collection and returns it', () => {
    const created = store().addCollection('mine');

    expect(store().collections.map((c) => c.name)).toEqual(['mine']);
    expect(created.name).toBe('mine');
    expect(save).toHaveBeenCalled();
  });

  it('adds a folder inside a collection', () => {
    const { collectionId } = seed();

    store().addFolder(collectionId, 'new folder');

    const names = findContainer(store().collections, collectionId)!.children.map((c) => c.name);
    expect(names).toContain('new folder');
  });

  it('ignores a folder added to an unknown parent', () => {
    seed();
    const before = store().collections;

    store().addFolder('nope', 'orphan');

    expect(store().collections).toBe(before);
  });

  it('adds a request inside a folder', () => {
    const { folderId } = seed();

    store().addRequest(folderId, 'create', { ...createEmptyRequest(), url: 'https://api.test/x' });

    const names = findContainer(store().collections, folderId)!.children.map((c) => c.name);
    expect(names).toEqual(['list', 'create']);
  });
});

describe('rename and remove', () => {
  it('renames a request', () => {
    const { requestId } = seed();

    store().rename(requestId, 'List users');

    expect(findNode(store().collections, requestId)?.node.name).toBe('List users');
  });

  it('removes a node', () => {
    const { requestId } = seed();

    store().remove(requestId);

    expect(findNode(store().collections, requestId)).toBeNull();
  });

  it('removes a whole collection', () => {
    const { collectionId } = seed();

    store().remove(collectionId);

    expect(store().collections).toEqual([]);
  });

  it('does not persist when nothing was removed', () => {
    seed();
    save.mockClear();

    store().remove('nope');

    expect(save).not.toHaveBeenCalled();
  });
});

describe('collapsing', () => {
  it('toggles a collection', () => {
    const { collectionId } = seed();

    store().toggleCollapsed(collectionId);
    expect(store().collections[0].collapsed).toBe(true);

    store().toggleCollapsed(collectionId);
    expect(store().collections[0].collapsed).toBe(false);
  });

  it('toggles a nested folder', () => {
    const { folderId } = seed();

    store().toggleCollapsed(folderId);

    const folder = findContainer(store().collections, folderId) as { collapsed?: boolean };
    expect(folder.collapsed).toBe(true);
  });
});

describe('saveRequest', () => {
  it('replaces the stored request', () => {
    const { requestId } = seed();

    store().saveRequest(requestId, { ...createEmptyRequest(), url: 'https://api.test/changed' });

    expect(store().getRequest(requestId)?.url).toBe('https://api.test/changed');
  });
});

describe('getRequest', () => {
  it('returns the request for a request node', () => {
    const { requestId } = seed();
    expect(store().getRequest(requestId)?.url).toBe('https://api.test/users');
  });

  it('returns null for a folder', () => {
    const { folderId } = seed();
    expect(store().getRequest(folderId)).toBeNull();
  });

  it('returns null for an unknown id', () => {
    seed();
    expect(store().getRequest('nope')).toBeNull();
  });
});

describe('move', () => {
  it('moves a request to another parent', () => {
    const { collectionId, requestId } = seed();

    store().move(requestId, collectionId, 0);

    expect(findNode(store().collections, requestId)?.parentId).toBe(collectionId);
    expect(store().lastMoveRejection).toBeNull();
  });

  it('records why a rejected move failed and changes nothing', () => {
    const { folderId } = seed();
    const before = store().collections;

    store().move(folderId, folderId, 0);

    expect(store().lastMoveRejection).toBe('into-own-subtree');
    expect(store().collections).toBe(before);
  });

  it('does not persist a rejected move', () => {
    const { folderId } = seed();
    save.mockClear();

    store().move(folderId, folderId, 0);

    expect(save).not.toHaveBeenCalled();
  });

  it('clears a previous rejection once a move succeeds', () => {
    const { collectionId, folderId, requestId } = seed();

    store().move(folderId, folderId, 0);
    expect(store().lastMoveRejection).toBe('into-own-subtree');

    store().move(requestId, collectionId, 0);
    expect(store().lastMoveRejection).toBeNull();
  });
});

describe('persistence', () => {
  it('writes after every mutation that changed something', () => {
    seed();
    save.mockClear();

    const { requestId } = seed();
    store().rename(requestId, 'renamed');

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe(store().collections);
  });
});
