import { create } from 'zustand';
import type { Collection, CollectionNode, HttpRequest, MoveRejection } from '../domain';
import {
  createCollection,
  createFolder,
  createRequestNode,
  findNode,
  insertNode,
  moveNode,
  removeNode,
  renameNode,
  setFolderCollapsed,
  updateRequestNode,
} from '../domain';
import { collectionsService } from '../services';

interface CollectionsState {
  collections: Collection[];
  isLoaded: boolean;
  /** Set when the last move was refused, so the UI can explain why. */
  lastMoveRejection: MoveRejection | null;

  hydrate: () => Promise<void>;
  replaceAll: (collections: Collection[]) => void;

  addCollection: (name?: string) => Collection;
  addFolder: (parentId: string, name?: string) => void;
  addRequest: (parentId: string, name: string, request: HttpRequest) => void;

  rename: (nodeId: string, name: string) => void;
  remove: (nodeId: string) => void;
  toggleCollapsed: (containerId: string) => void;
  saveRequest: (nodeId: string, request: HttpRequest) => void;
  move: (nodeId: string, targetParentId: string, index: number) => void;

  getRequest: (nodeId: string) => HttpRequest | null;
}

/**
 * Every mutation persists afterwards. The file is small and writes are atomic, so this is
 * simpler and safer than trying to batch them.
 */
function persist(collections: Collection[]) {
  void collectionsService.save(collections);
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  isLoaded: false,
  lastMoveRejection: null,

  hydrate: async () => {
    const collections = await collectionsService.load();
    set({ collections, isLoaded: true });
  },

  replaceAll: (collections) => {
    set({ collections });
    persist(collections);
  },

  addCollection: (name) => {
    const collection = createCollection(name);
    const collections = [...get().collections, collection];
    set({ collections });
    persist(collections);
    return collection;
  },

  addFolder: (parentId, name) => {
    const container = get().collections;
    const collections = insertNode(container, parentId, Number.MAX_SAFE_INTEGER, createFolder(name));
    if (collections === container) return;
    set({ collections });
    persist(collections);
  },

  addRequest: (parentId, name, request) => {
    const container = get().collections;
    const node: CollectionNode = createRequestNode(name, request);
    const collections = insertNode(container, parentId, Number.MAX_SAFE_INTEGER, node);
    if (collections === container) return;
    set({ collections });
    persist(collections);
  },

  rename: (nodeId, name) => {
    const collections = renameNode(get().collections, nodeId, name);
    set({ collections });
    persist(collections);
  },

  remove: (nodeId) => {
    const before = get().collections;
    const collections = before.some((c) => c.id === nodeId)
      ? before.filter((c) => c.id !== nodeId)
      : removeNode(before, nodeId);

    if (collections === before) return;
    set({ collections });
    persist(collections);
  },

  toggleCollapsed: (containerId) => {
    const { collections } = get();
    const current =
      collections.find((c) => c.id === containerId)?.collapsed ??
      (findNode(collections, containerId)?.node as { collapsed?: boolean } | undefined)?.collapsed ??
      false;

    const next = setFolderCollapsed(collections, containerId, !current);
    set({ collections: next });
    persist(next);
  },

  saveRequest: (nodeId, request) => {
    const collections = updateRequestNode(get().collections, nodeId, request);
    set({ collections });
    persist(collections);
  },

  move: (nodeId, targetParentId, index) => {
    const result = moveNode(get().collections, nodeId, targetParentId, index);

    if (result.rejected) {
      set({ lastMoveRejection: result.rejected });
      return;
    }

    set({ collections: result.collections, lastMoveRejection: null });
    persist(result.collections);
  },

  getRequest: (nodeId) => {
    const found = findNode(get().collections, nodeId);
    return found && found.node.kind === 'request' ? found.node.request : null;
  },
}));
