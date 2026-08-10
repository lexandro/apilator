import { useCallback, useState } from 'react';
import { useCollectionsStore } from '../../stores';
import { useCollectionTransfer } from '../../hooks';
import { findNode, findContainer } from '../../domain';
import { EmptyState } from '../common';
import { CollectionTree, type DropTarget } from './CollectionTree';
import './CollectionsPanel.css';

interface CollectionsPanelProps {
  onOpenRequest: (nodeId: string) => void;
  selectedId?: string | null;
}

interface MenuState {
  x: number;
  y: number;
  nodeId: string;
  isContainer: boolean;
}

const REJECTION_MESSAGE: Record<string, string> = {
  'into-own-subtree': 'A folder cannot be moved inside itself.',
  'unknown-node': 'That item no longer exists.',
  'unknown-target': 'You can only drop items into a collection or folder.',
};

export function CollectionsPanel({ onOpenRequest, selectedId }: CollectionsPanelProps) {
  const collections = useCollectionsStore((s) => s.collections);
  const addCollection = useCollectionsStore((s) => s.addCollection);
  const addFolder = useCollectionsStore((s) => s.addFolder);
  const rename = useCollectionsStore((s) => s.rename);
  const remove = useCollectionsStore((s) => s.remove);
  const toggleCollapsed = useCollectionsStore((s) => s.toggleCollapsed);
  const move = useCollectionsStore((s) => s.move);
  const lastMoveRejection = useCollectionsStore((s) => s.lastMoveRejection);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { exportCollections, importCollections } = useCollectionTransfer();

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, nodeId: string, isContainer: boolean) => {
      event.preventDefault();
      event.stopPropagation();
      setMenu({ x: event.clientX, y: event.clientY, nodeId, isContainer });
    },
    []
  );

  /**
   * A drop lands either inside a container or next to a sibling; the latter needs the
   * target's parent and index, which the tree does not track.
   */
  const handleMove = useCallback(
    (sourceId: string, target: DropTarget) => {
      if (target.position === 'inside') {
        move(sourceId, target.nodeId, Number.MAX_SAFE_INTEGER);
        return;
      }

      const location = findNode(collections, target.nodeId);

      if (!location) {
        // A collection root: before/after means reordering collections themselves, which
        // is not supported, so treat it as dropping inside.
        move(sourceId, target.nodeId, Number.MAX_SAFE_INTEGER);
        return;
      }

      move(sourceId, location.parentId, location.index + (target.position === 'after' ? 1 : 0));
    },
    [collections, move]
  );

  const closeMenu = () => setMenu(null);

  const menuNodeName = menu
    ? (findContainer(collections, menu.nodeId)?.name ??
      findNode(collections, menu.nodeId)?.node.name ??
      '')
    : '';

  return (
    <div className="collections-panel" onClick={closeMenu}>
      <div className="collections-panel__header">
        <h2 className="collections-panel__title">Collections</h2>
        <div className="collections-panel__actions">
          <button
            className="collections-panel__action"
            onClick={async () => setNotice((await importCollections()).message || null)}
            title="Import an Apilator export or an OpenAPI document"
          >
            Import
          </button>
          <button
            className="collections-panel__action"
            onClick={async () => setNotice((await exportCollections()).message || null)}
            title="Export all collections to a file"
          >
            Export
          </button>
          <button
            className="collections-panel__action"
            onClick={() => addCollection()}
            title="New collection"
          >
            +
          </button>
        </div>
      </div>

      {notice && (
        <p className="collections-panel__notice" role="status" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}

      {lastMoveRejection && (
        <p className="collections-panel__warning" role="alert">
          {REJECTION_MESSAGE[lastMoveRejection] ?? 'That move is not allowed.'}
        </p>
      )}

      <div className="collections-panel__body">
        {collections.length === 0 ? (
          <EmptyState
            icon="📁"
            message="No collections yet. Save a request to create one."
            className="collections-empty"
          />
        ) : (
          <CollectionTree
            collections={collections}
            selectedId={selectedId}
            onOpenRequest={onOpenRequest}
            onToggleCollapsed={toggleCollapsed}
            onMove={handleMove}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>

      {menu && (
        <div
          className="collections-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.isContainer && (
            <button
              className="collections-menu__item"
              onClick={() => {
                addFolder(menu.nodeId);
                closeMenu();
              }}
            >
              New folder
            </button>
          )}
          <button
            className="collections-menu__item"
            onClick={() => {
              const name = window.prompt('Rename to', menuNodeName);
              if (name?.trim()) rename(menu.nodeId, name.trim());
              closeMenu();
            }}
          >
            Rename
          </button>
          <button
            className="collections-menu__item collections-menu__item--danger"
            onClick={() => {
              remove(menu.nodeId);
              closeMenu();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
