import { describe, it, expect } from 'vitest';
import {
  createCollection,
  createFolder,
  createRequestNode,
  findNode,
  findContainer,
  collectSubtreeIds,
  insertNode,
  removeNode,
  renameNode,
  setFolderCollapsed,
  updateRequestNode,
  moveNode,
  listRequests,
} from './collection';
import type { Collection, CollectionNode } from './collection';
import { createEmptyRequest } from './request';

/**
 * collection "api"
 *   folder "users"          (users)
 *     request "list"        (list)
 *     folder "admin"        (admin)
 *       request "ban"       (ban)
 *   request "health"        (health)
 */
function tree(): Collection[] {
  const list = { ...createRequestNode('list', createEmptyRequest()), id: 'list' };
  const ban = { ...createRequestNode('ban', createEmptyRequest()), id: 'ban' };
  const admin = { ...createFolder('admin'), id: 'admin', children: [ban] };
  const users = { ...createFolder('users'), id: 'users', children: [list, admin] };
  const health = { ...createRequestNode('health', createEmptyRequest()), id: 'health' };

  return [{ ...createCollection('api'), id: 'api', children: [users, health] }];
}

function idsUnder(collections: Collection[], containerId: string): string[] {
  const container = findContainer(collections, containerId);
  return container ? container.children.map((c) => c.id) : [];
}

describe('findNode', () => {
  it('finds a top level node', () => {
    expect(findNode(tree(), 'health')).toMatchObject({ parentId: 'api', index: 1 });
  });

  it('finds a nested node', () => {
    expect(findNode(tree(), 'ban')).toMatchObject({ parentId: 'admin', index: 0 });
  });

  it('returns null for an unknown id', () => {
    expect(findNode(tree(), 'nope')).toBeNull();
  });

  it('does not find a collection, since a collection is not a child', () => {
    expect(findNode(tree(), 'api')).toBeNull();
  });
});

describe('findContainer', () => {
  it('finds a collection', () => {
    expect(findContainer(tree(), 'api')?.name).toBe('api');
  });

  it('finds a nested folder', () => {
    expect(findContainer(tree(), 'admin')?.name).toBe('admin');
  });

  it('does not treat a request as a container', () => {
    expect(findContainer(tree(), 'list')).toBeNull();
  });
});

describe('collectSubtreeIds', () => {
  it('includes the node itself', () => {
    expect(collectSubtreeIds(tree()[0]).has('api')).toBe(true);
  });

  it('includes every descendant', () => {
    const users = findContainer(tree(), 'users')!;
    expect([...collectSubtreeIds(users)].sort()).toEqual(['admin', 'ban', 'list', 'users']);
  });

  it('is just the id for a request', () => {
    const list = findNode(tree(), 'list')!.node;
    expect([...collectSubtreeIds(list)]).toEqual(['list']);
  });
});

describe('insertNode', () => {
  it('appends into a collection', () => {
    const node = { ...createRequestNode('new', createEmptyRequest()), id: 'new' };
    expect(idsUnder(insertNode(tree(), 'api', 99, node), 'api')).toEqual([
      'users',
      'health',
      'new',
    ]);
  });

  it('inserts at a position', () => {
    const node = { ...createRequestNode('new', createEmptyRequest()), id: 'new' };
    expect(idsUnder(insertNode(tree(), 'api', 0, node), 'api')).toEqual([
      'new',
      'users',
      'health',
    ]);
  });

  it('inserts into a nested folder', () => {
    const node = { ...createRequestNode('new', createEmptyRequest()), id: 'new' };
    expect(idsUnder(insertNode(tree(), 'admin', 0, node), 'admin')).toEqual(['new', 'ban']);
  });

  it('clamps a negative index', () => {
    const node = { ...createRequestNode('new', createEmptyRequest()), id: 'new' };
    expect(idsUnder(insertNode(tree(), 'api', -5, node), 'api')[0]).toBe('new');
  });

  it('is a no-op for an unknown parent', () => {
    const node = { ...createRequestNode('new', createEmptyRequest()), id: 'new' };
    const before = tree();
    expect(insertNode(before, 'nope', 0, node)).toBe(before);
  });

  it('does not mutate the input', () => {
    const before = tree();
    const snapshot = JSON.stringify(before);
    insertNode(before, 'api', 0, { ...createRequestNode('n', createEmptyRequest()), id: 'n' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('removeNode', () => {
  it('removes a top level node', () => {
    expect(idsUnder(removeNode(tree(), 'health'), 'api')).toEqual(['users']);
  });

  it('removes a nested node', () => {
    expect(idsUnder(removeNode(tree(), 'ban'), 'admin')).toEqual([]);
  });

  it('removes a folder with everything inside it', () => {
    const after = removeNode(tree(), 'users');
    expect(idsUnder(after, 'api')).toEqual(['health']);
    expect(findNode(after, 'ban')).toBeNull();
  });

  it('is a no-op for an unknown id', () => {
    const before = tree();
    expect(removeNode(before, 'nope')).toBe(before);
  });
});

describe('renameNode', () => {
  it('renames a collection', () => {
    expect(renameNode(tree(), 'api', 'API v2')[0].name).toBe('API v2');
  });

  it('renames a nested folder', () => {
    expect(findContainer(renameNode(tree(), 'admin', 'Admin'), 'admin')?.name).toBe('Admin');
  });

  it('renames a request', () => {
    expect(findNode(renameNode(tree(), 'ban', 'Ban user'), 'ban')?.node.name).toBe('Ban user');
  });

  it('leaves other nodes alone', () => {
    const after = renameNode(tree(), 'ban', 'Ban user');
    expect(findNode(after, 'list')?.node.name).toBe('list');
  });
});

describe('setFolderCollapsed', () => {
  it('collapses a collection', () => {
    expect(setFolderCollapsed(tree(), 'api', true)[0].collapsed).toBe(true);
  });

  it('collapses a nested folder', () => {
    const after = setFolderCollapsed(tree(), 'admin', true);
    expect((findContainer(after, 'admin') as { collapsed?: boolean }).collapsed).toBe(true);
  });
});

describe('updateRequestNode', () => {
  it('replaces the stored request', () => {
    const request = { ...createEmptyRequest(), url: 'https://api.test/updated' };
    const after = updateRequestNode(tree(), 'ban', request);

    const node = findNode(after, 'ban')!.node;
    expect(node.kind === 'request' && node.request.url).toBe('https://api.test/updated');
  });

  it('leaves other requests alone', () => {
    const after = updateRequestNode(tree(), 'ban', {
      ...createEmptyRequest(),
      url: 'https://api.test/updated',
    });
    const other = findNode(after, 'list')!.node;
    expect(other.kind === 'request' && other.request.url).toBe('');
  });
});

describe('moveNode', () => {
  it('moves a request into another folder', () => {
    const { collections, rejected } = moveNode(tree(), 'health', 'admin', 0);

    expect(rejected).toBeUndefined();
    expect(idsUnder(collections, 'admin')).toEqual(['health', 'ban']);
    expect(idsUnder(collections, 'api')).toEqual(['users']);
  });

  it('moves a folder with its contents', () => {
    const { collections } = moveNode(tree(), 'admin', 'api', 0);

    expect(idsUnder(collections, 'api')).toEqual(['admin', 'users', 'health']);
    expect(findNode(collections, 'ban')?.parentId).toBe('admin');
  });

  it('reorders within the same parent, downwards', () => {
    const { collections } = moveNode(tree(), 'users', 'api', 2);
    expect(idsUnder(collections, 'api')).toEqual(['health', 'users']);
  });

  it('reorders within the same parent, upwards', () => {
    const { collections } = moveNode(tree(), 'health', 'api', 0);
    expect(idsUnder(collections, 'api')).toEqual(['health', 'users']);
  });

  it('moving a node onto its own position changes nothing', () => {
    const { collections } = moveNode(tree(), 'users', 'api', 0);
    expect(idsUnder(collections, 'api')).toEqual(['users', 'health']);
  });

  // Without this guard the subtree is detached from the tree and everything in it is lost.
  it('refuses to move a folder into itself', () => {
    const before = tree();
    const { collections, rejected } = moveNode(before, 'users', 'users', 0);

    expect(rejected).toBe('into-own-subtree');
    expect(collections).toBe(before);
  });

  it('refuses to move a folder into its own descendant', () => {
    const before = tree();
    const { collections, rejected } = moveNode(before, 'users', 'admin', 0);

    expect(rejected).toBe('into-own-subtree');
    expect(collections).toBe(before);
  });

  it('allows moving a folder into a sibling subtree', () => {
    const { rejected } = moveNode(tree(), 'admin', 'api', 0);
    expect(rejected).toBeUndefined();
  });

  it('reports an unknown node', () => {
    expect(moveNode(tree(), 'nope', 'api', 0).rejected).toBe('unknown-node');
  });

  it('reports an unknown target', () => {
    expect(moveNode(tree(), 'health', 'nope', 0).rejected).toBe('unknown-target');
  });

  it('refuses a request as a drop target', () => {
    expect(moveNode(tree(), 'health', 'list', 0).rejected).toBe('unknown-target');
  });

  it('never loses a node', () => {
    const countNodes = (collections: Collection[]): number => {
      const visit = (nodes: CollectionNode[]): number =>
        nodes.reduce((n, node) => n + 1 + (node.kind === 'folder' ? visit(node.children) : 0), 0);
      return collections.reduce((n, c) => n + visit(c.children), 0);
    };

    const before = tree();
    const moves: Array<[string, string, number]> = [
      ['health', 'admin', 0],
      ['list', 'api', 0],
      ['admin', 'api', 1],
      ['users', 'admin', 0],
    ];

    let current = before;
    for (const [node, target, index] of moves) {
      current = moveNode(current, node, target, index).collections;
    }

    expect(countNodes(current)).toBe(countNodes(before));
  });
});

describe('listRequests', () => {
  it('finds every request at any depth', () => {
    expect(listRequests(tree()).map((r) => r.id).sort()).toEqual(['ban', 'health', 'list']);
  });

  it('returns an empty list for an empty collection', () => {
    expect(listRequests([createCollection()])).toEqual([]);
  });
});
