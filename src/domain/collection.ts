import type { HttpRequest } from './request';

export interface CollectionFolderNode {
  kind: 'folder';
  id: string;
  name: string;
  children: CollectionNode[];
  collapsed?: boolean;
}

export interface CollectionRequestNode {
  kind: 'request';
  id: string;
  name: string;
  request: HttpRequest;
}

export type CollectionNode = CollectionFolderNode | CollectionRequestNode;

/** A collection is the root of a tree; it behaves like a folder that cannot be nested. */
export interface Collection {
  id: string;
  name: string;
  children: CollectionNode[];
  collapsed?: boolean;
}

export function createCollection(name = 'New Collection'): Collection {
  return { id: crypto.randomUUID(), name, children: [] };
}

export function createFolder(name = 'New Folder'): CollectionFolderNode {
  return { kind: 'folder', id: crypto.randomUUID(), name, children: [] };
}

export function createRequestNode(name: string, request: HttpRequest): CollectionRequestNode {
  return { kind: 'request', id: crypto.randomUUID(), name, request };
}

// ============================================================
// Tree operations
//
// All pure: they take the tree and return a new one, so the store stays a thin wrapper
// and the interesting logic is testable without React.
// ============================================================

export interface NodeLocation {
  node: CollectionNode;
  /** Id of the containing collection or folder. */
  parentId: string;
  index: number;
}

function childrenOf(container: Collection | CollectionFolderNode): CollectionNode[] {
  return container.children;
}

export function findNode(collections: Collection[], nodeId: string): NodeLocation | null {
  const visit = (container: Collection | CollectionFolderNode): NodeLocation | null => {
    const children = childrenOf(container);

    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (node.id === nodeId) return { node, parentId: container.id, index };

      if (node.kind === 'folder') {
        const found = visit(node);
        if (found) return found;
      }
    }

    return null;
  };

  for (const collection of collections) {
    const found = visit(collection);
    if (found) return found;
  }

  return null;
}

export function findContainer(
  collections: Collection[],
  containerId: string
): Collection | CollectionFolderNode | null {
  const visit = (
    container: Collection | CollectionFolderNode
  ): Collection | CollectionFolderNode | null => {
    if (container.id === containerId) return container;

    for (const node of childrenOf(container)) {
      if (node.kind !== 'folder') continue;
      const found = visit(node);
      if (found) return found;
    }

    return null;
  };

  for (const collection of collections) {
    const found = visit(collection);
    if (found) return found;
  }

  return null;
}

/** Every id inside the subtree rooted at `container`, including its own. */
export function collectSubtreeIds(container: Collection | CollectionNode): Set<string> {
  const ids = new Set<string>([container.id]);

  // A Collection carries no `kind`, so presence of children is the test rather than a
  // discriminator check.
  if (!('children' in container)) return ids;

  for (const child of container.children) {
    for (const id of collectSubtreeIds(child)) ids.add(id);
  }

  return ids;
}

function mapContainers(
  collections: Collection[],
  transform: (children: CollectionNode[], containerId: string) => CollectionNode[]
): Collection[] {
  const visitNode = (node: CollectionNode): CollectionNode => {
    if (node.kind !== 'folder') return node;
    return { ...node, children: transform(node.children.map(visitNode), node.id) };
  };

  return collections.map((collection) => ({
    ...collection,
    children: transform(collection.children.map(visitNode), collection.id),
  }));
}

export function insertNode(
  collections: Collection[],
  parentId: string,
  index: number,
  node: CollectionNode
): Collection[] {
  if (!findContainer(collections, parentId)) return collections;

  return mapContainers(collections, (children, containerId) => {
    if (containerId !== parentId) return children;

    const next = [...children];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, node);
    return next;
  });
}

export function removeNode(collections: Collection[], nodeId: string): Collection[] {
  if (!findNode(collections, nodeId)) return collections;

  return mapContainers(collections, (children) => children.filter((child) => child.id !== nodeId));
}

export function renameNode(
  collections: Collection[],
  nodeId: string,
  name: string
): Collection[] {
  return collections.map((collection) => {
    if (collection.id === nodeId) return { ...collection, name };

    const visit = (node: CollectionNode): CollectionNode => {
      if (node.id === nodeId) return { ...node, name };
      if (node.kind !== 'folder') return node;
      return { ...node, children: node.children.map(visit) };
    };

    return { ...collection, children: collection.children.map(visit) };
  });
}

export function setFolderCollapsed(
  collections: Collection[],
  containerId: string,
  collapsed: boolean
): Collection[] {
  return collections.map((collection) => {
    if (collection.id === containerId) return { ...collection, collapsed };

    const visit = (node: CollectionNode): CollectionNode => {
      if (node.kind !== 'folder') return node;
      if (node.id === containerId) return { ...node, collapsed };
      return { ...node, children: node.children.map(visit) };
    };

    return { ...collection, children: collection.children.map(visit) };
  });
}

export function updateRequestNode(
  collections: Collection[],
  nodeId: string,
  request: HttpRequest
): Collection[] {
  return collections.map((collection) => {
    const visit = (node: CollectionNode): CollectionNode => {
      if (node.kind === 'request') {
        return node.id === nodeId ? { ...node, request } : node;
      }
      return { ...node, children: node.children.map(visit) };
    };

    return { ...collection, children: collection.children.map(visit) };
  });
}

export type MoveRejection = 'unknown-node' | 'unknown-target' | 'into-own-subtree';

export interface MoveResult {
  collections: Collection[];
  rejected?: MoveRejection;
}

/**
 * Moves a node under a new parent. Refuses to drop a folder inside itself or one of its
 * descendants, which would detach that subtree from the tree entirely.
 */
export function moveNode(
  collections: Collection[],
  nodeId: string,
  targetParentId: string,
  index: number
): MoveResult {
  const location = findNode(collections, nodeId);
  if (!location) return { collections, rejected: 'unknown-node' };

  if (!findContainer(collections, targetParentId)) {
    return { collections, rejected: 'unknown-target' };
  }

  if (collectSubtreeIds(location.node).has(targetParentId)) {
    return { collections, rejected: 'into-own-subtree' };
  }

  // Removing first shifts later siblings, so an index past the original position has to
  // come back by one when the move stays inside the same parent.
  const sameParent = location.parentId === targetParentId;
  const adjusted = sameParent && index > location.index ? index - 1 : index;

  const without = removeNode(collections, nodeId);
  return { collections: insertNode(without, targetParentId, adjusted, location.node) };
}

/** Flat list of every request in the tree, for search and export. */
export function listRequests(collections: Collection[]): CollectionRequestNode[] {
  const found: CollectionRequestNode[] = [];

  const visit = (nodes: CollectionNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'request') found.push(node);
      else visit(node.children);
    }
  };

  for (const collection of collections) visit(collection.children);
  return found;
}
